//! Native desktop source enumeration for the in-app screen-share picker.
//!
//! Enumerates monitors and top-level windows (with small thumbnails) so the
//! reference client's own `ScreenSharePickerModal` can render a native picker.
//! Capture itself is performed by the webview via `getDisplayMedia` (WebView2
//! shows its own "Choose what to share" confirmation) — we only *list* sources
//! here.
//!
//! Thumbnails use Windows.Graphics.Capture (GPU compositor readback) so
//! GPU-composited windows and monitors don't read back black the way GDI
//! `StretchBlt`/`PrintWindow` do; GDI stays as the fallback when WGC is
//! unavailable or fails for a given source.
//!
//! Source id format mirrors Electron's desktopCapturer so the reference code
//! paths work unchanged: `screen:<index>:0` and `window:<hwnd>:0`.

use serde::Serialize;

/// One shareable desktop source (a monitor or a window), shaped to match the
/// reference `DesktopSource` interface.
#[derive(Serialize, Clone)]
pub struct DesktopSource {
    pub id: String,
    pub name: String,
    #[serde(rename = "thumbnailDataUrl", skip_serializing_if = "Option::is_none")]
    pub thumbnail_data_url: Option<String>,
    #[serde(rename = "display_id", skip_serializing_if = "Option::is_none")]
    pub display_id: Option<String>,
    #[serde(rename = "nativeWidth", skip_serializing_if = "Option::is_none")]
    pub native_width: Option<u32>,
    #[serde(rename = "nativeHeight", skip_serializing_if = "Option::is_none")]
    pub native_height: Option<u32>,
}

/// Enumerate screens + windows. `types` filters kinds ("screen"/"window").
/// `list_only` skips thumbnail capture (faster; used for the preloaded list).
pub fn get_sources(types: &[String], list_only: bool) -> Vec<DesktopSource> {
    #[cfg(windows)]
    {
        windows_impl::enumerate(types, list_only)
    }
    #[cfg(not(windows))]
    {
        let _ = (types, list_only);
        Vec::new()
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::DesktopSource;
    use std::cell::RefCell;
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM, RECT, TRUE};
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, EnumDisplayMonitors,
        GetDIBits, GetMonitorInfoW, SelectObject, StretchBlt, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, HBITMAP, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW, SRCCOPY,
    };
    use windows::Win32::Storage::Xps::PrintWindow;
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClientRect, GetWindowLongW, GetWindowRect, GetWindowTextLengthW,
        GetWindowTextW, IsIconic, IsWindowVisible, GWL_EXSTYLE, GWL_STYLE, WS_CHILD,
        WS_EX_TOOLWINDOW,
    };

    const THUMB_W: u32 = 320;
    const THUMB_H: u32 = 180;

    thread_local! {
        static MONITORS: RefCell<Vec<(isize, RECT, String)>> = RefCell::new(Vec::new());
        static WINDOWS: RefCell<Vec<(isize, String)>> = RefCell::new(Vec::new());
    }

    pub fn enumerate(types: &[String], list_only: bool) -> Vec<DesktopSource> {
        let want_screen = types.iter().any(|t| t == "screen");
        let want_window = types.iter().any(|t| t == "window");

        // WGC needs COM on this thread (we run on a blocking-pool thread).
        unsafe {
            use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let wgc = if list_only { None } else { wgc::Context::new() };

        let mut out = Vec::new();
        if want_screen {
            out.extend(enumerate_monitors(list_only, wgc.as_ref()));
        }
        if want_window {
            out.extend(enumerate_windows(list_only, wgc.as_ref()));
        }
        out
    }

    fn enumerate_monitors(list_only: bool, wgc: Option<&wgc::Context>) -> Vec<DesktopSource> {
        MONITORS.with(|m| m.borrow_mut().clear());
        unsafe {
            let _ = EnumDisplayMonitors(None, None, Some(monitor_enum_proc), LPARAM(0));
        }
        let collected: Vec<(isize, RECT, String)> = MONITORS.with(|m| m.borrow().clone());
        collected
            .into_iter()
            .enumerate()
            .map(|(i, (hmon, rect, name))| {
                let w = (rect.right - rect.left) as u32;
                let h = (rect.bottom - rect.top) as u32;
                let thumb = if list_only {
                    None
                } else {
                    wgc.and_then(|c| c.capture_monitor(HMONITOR(hmon as *mut _)))
                        .map(|img| rgba_to_thumb_data_url(img))
                        .or_else(|| capture_screen_rect_thumb(rect))
                };
                DesktopSource {
                    // Encode the ACTUAL HMONITOR value (not the enumeration
                    // index) as the middle token. The capture side runs its OWN
                    // EnumDisplayMonitors pass, and Windows does NOT guarantee
                    // the two passes yield the same order — so an index-based id
                    // could resolve to a DIFFERENT monitor at capture time (the
                    // "shares the wrong / both monitors" bug). The HMONITOR is a
                    // stable session handle, so capture can CreateForMonitor the
                    // exact display the user picked. The client's id regex keeps
                    // this middle token opaque, and display_id stays the index
                    // for UI. (window ids already carry the raw HWND the same way.)
                    id: format!("screen:{hmon}:0"),
                    name: if name.is_empty() {
                        format!("Screen {}", i + 1)
                    } else {
                        name
                    },
                    thumbnail_data_url: thumb,
                    display_id: Some(i.to_string()),
                    native_width: Some(w),
                    native_height: Some(h),
                }
            })
            .collect()
    }

    fn enumerate_windows(list_only: bool, wgc: Option<&wgc::Context>) -> Vec<DesktopSource> {
        WINDOWS.with(|w| w.borrow_mut().clear());
        unsafe {
            let _ = EnumWindows(Some(window_enum_proc), LPARAM(0));
        }
        let collected: Vec<(isize, String)> = WINDOWS.with(|w| w.borrow().clone());
        collected
            .into_iter()
            .filter_map(|(hwnd_raw, title)| {
                let hwnd = HWND(hwnd_raw as *mut _);
                let (w, h) = unsafe {
                    let mut r = RECT::default();
                    if GetWindowRect(hwnd, &mut r).is_err() {
                        return None;
                    }
                    ((r.right - r.left) as u32, (r.bottom - r.top) as u32)
                };
                if w < 32 || h < 32 {
                    return None;
                }
                let thumb = if list_only {
                    None
                } else {
                    wgc.and_then(|c| c.capture_window(hwnd))
                        .map(|img| rgba_to_thumb_data_url(img))
                        .or_else(|| capture_window_thumb(hwnd))
                };
                Some(DesktopSource {
                    id: format!("window:{}:0", hwnd_raw),
                    name: title,
                    thumbnail_data_url: thumb,
                    display_id: None,
                    native_width: Some(w),
                    native_height: Some(h),
                })
            })
            .collect()
    }

    unsafe extern "system" fn monitor_enum_proc(
        hmonitor: HMONITOR,
        _hdc: HDC,
        _rect: *mut RECT,
        _lparam: LPARAM,
    ) -> BOOL {
        let mut info = MONITORINFOEXW {
            monitorInfo: MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFOEXW>() as u32,
                ..Default::default()
            },
            ..Default::default()
        };
        if GetMonitorInfoW(hmonitor, &mut info.monitorInfo as *mut _ as *mut MONITORINFO).as_bool() {
            let name = String::from_utf16_lossy(
                &info
                    .szDevice
                    .iter()
                    .take_while(|&&c| c != 0)
                    .copied()
                    .collect::<Vec<u16>>(),
            );
            MONITORS.with(|m| {
                m.borrow_mut()
                    .push((hmonitor.0 as isize, info.monitorInfo.rcMonitor, name))
            });
        }
        TRUE
    }

    unsafe extern "system" fn window_enum_proc(hwnd: HWND, _lparam: LPARAM) -> BOOL {
        if !IsWindowVisible(hwnd).as_bool() {
            return TRUE;
        }
        if IsIconic(hwnd).as_bool() {
            return TRUE;
        }
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        if style & WS_CHILD.0 != 0 {
            return TRUE;
        }
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if ex & WS_EX_TOOLWINDOW.0 != 0 {
            return TRUE;
        }
        let len = GetWindowTextLengthW(hwnd);
        if len == 0 {
            return TRUE;
        }
        let mut buf = vec![0u16; (len + 1) as usize];
        let read = GetWindowTextW(hwnd, &mut buf);
        if read == 0 {
            return TRUE;
        }
        let title = String::from_utf16_lossy(&buf[..read as usize]);
        if title.trim().is_empty() {
            return TRUE;
        }
        WINDOWS.with(|w| w.borrow_mut().push((hwnd.0 as isize, title)));
        TRUE
    }

    /// Downscale a full-resolution RGBA capture to the thumbnail size
    /// (aspect-preserving) and encode as a PNG data URL.
    fn rgba_to_thumb_data_url(img: image::RgbaImage) -> String {
        let thumb = image::DynamicImage::ImageRgba8(img).thumbnail(THUMB_W, THUMB_H);
        let mut png = Vec::new();
        let _ = thumb.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png);
        png_to_data_url(&png)
    }

    /// GDI fallback: capture a monitor rect and downscale to a thumbnail PNG
    /// data URL. Reads black for HDR/overlay-composited content — used only
    /// when WGC is unavailable.
    fn capture_screen_rect_thumb(rect: RECT) -> Option<String> {
        let src_w = rect.right - rect.left;
        let src_h = rect.bottom - rect.top;
        if src_w <= 0 || src_h <= 0 {
            return None;
        }
        let (tw, th) = (THUMB_W as i32, THUMB_H as i32);
        unsafe {
            let screen_dc = windows::Win32::Graphics::Gdi::GetDC(None);
            let mem_dc = CreateCompatibleDC(Some(screen_dc));
            let bmp = CreateCompatibleBitmap(screen_dc, tw, th);
            let old = SelectObject(mem_dc, bmp.into());
            let _ = StretchBlt(
                mem_dc, 0, 0, tw, th, Some(screen_dc), rect.left, rect.top, src_w, src_h, SRCCOPY,
            );
            let data = bitmap_to_png(mem_dc, bmp, tw, th);
            SelectObject(mem_dc, old);
            let _ = DeleteObject(bmp.into());
            let _ = DeleteDC(mem_dc);
            windows::Win32::Graphics::Gdi::ReleaseDC(None, screen_dc);
            data.map(|d| png_to_data_url(&d))
        }
    }

    /// GDI fallback: capture a window via PrintWindow and downscale to a
    /// thumbnail PNG data URL. Used only when WGC fails for the window.
    fn capture_window_thumb(hwnd: HWND) -> Option<String> {
        let (tw, th) = (THUMB_W as i32, THUMB_H as i32);
        unsafe {
            let mut cr = RECT::default();
            if GetClientRect(hwnd, &mut cr).is_err() {
                return None;
            }
            let w = cr.right - cr.left;
            let h = cr.bottom - cr.top;
            if w <= 0 || h <= 0 {
                return None;
            }
            let win_dc = windows::Win32::Graphics::Gdi::GetDC(Some(hwnd));
            let mem_dc = CreateCompatibleDC(Some(win_dc));
            let full = CreateCompatibleBitmap(win_dc, w, h);
            let old = SelectObject(mem_dc, full.into());
            // PW_RENDERFULLCONTENT = 2 (captures GPU-composited windows too).
            let ok = PrintWindow(hwnd, mem_dc, windows::Win32::Storage::Xps::PRINT_WINDOW_FLAGS(2));
            let mut result = None;
            if ok.as_bool() {
                // Downscale into a thumbnail-sized bitmap.
                let thumb_dc = CreateCompatibleDC(Some(win_dc));
                let thumb_bmp = CreateCompatibleBitmap(win_dc, tw, th);
                let told = SelectObject(thumb_dc, thumb_bmp.into());
                let _ = StretchBlt(thumb_dc, 0, 0, tw, th, Some(mem_dc), 0, 0, w, h, SRCCOPY);
                result =
                    bitmap_to_png(thumb_dc, thumb_bmp, tw, th).map(|d| png_to_data_url(&d));
                SelectObject(thumb_dc, told);
                let _ = DeleteObject(thumb_bmp.into());
                let _ = DeleteDC(thumb_dc);
            }
            SelectObject(mem_dc, old);
            let _ = DeleteObject(full.into());
            let _ = DeleteDC(mem_dc);
            windows::Win32::Graphics::Gdi::ReleaseDC(Some(hwnd), win_dc);
            result
        }
    }

    /// Read a bitmap's pixels (BGRA top-down) and encode to PNG bytes.
    unsafe fn bitmap_to_png(dc: HDC, bmp: HBITMAP, w: i32, h: i32) -> Option<Vec<u8>> {
        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut buf = vec![0u8; (w * h * 4) as usize];
        let scanlines = GetDIBits(
            dc,
            bmp,
            0,
            h as u32,
            Some(buf.as_mut_ptr() as *mut _),
            &mut bi,
            DIB_RGB_COLORS,
        );
        if scanlines == 0 {
            return None;
        }
        // BGRA -> RGBA
        for px in buf.chunks_exact_mut(4) {
            px.swap(0, 2);
            px[3] = 255;
        }
        let img =
            image::RgbaImage::from_raw(w as u32, h as u32, buf).map(image::DynamicImage::ImageRgba8)?;
        let mut png = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .ok()?;
        Some(png)
    }

    fn png_to_data_url(png: &[u8]) -> String {
        use base64::Engine;
        format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(png)
        )
    }

    /// Windows.Graphics.Capture-based single-frame capture. Reads from the
    /// DWM compositor via D3D11, so GPU-composited/hardware-overlay content
    /// (which GDI reads back as black) captures correctly.
    mod wgc {
        use windows::core::Interface;
        use windows::Graphics::Capture::{
            Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem,
            GraphicsCaptureSession,
        };
        use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
        use windows::Graphics::DirectX::DirectXPixelFormat;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE, D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP};
        use windows::Win32::Graphics::Direct3D11::{
            D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
            D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE,
            D3D11_MAP_READ, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
        };
        use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
        use windows::Win32::Graphics::Dxgi::IDXGIDevice;
        use windows::Win32::Graphics::Gdi::HMONITOR;
        use windows::Win32::System::WinRT::Direct3D11::{
            CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
        };
        use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;

        pub struct Context {
            device: ID3D11Device,
            context: ID3D11DeviceContext,
            winrt_device: IDirect3DDevice,
        }

        impl Context {
            /// Returns None when WGC is unsupported or D3D11 device creation
            /// fails (callers fall back to GDI).
            pub fn new() -> Option<Self> {
                if !GraphicsCaptureSession::IsSupported().unwrap_or(false) {
                    return None;
                }
                let (device, context) = create_d3d_device()?;
                let winrt_device = unsafe {
                    let dxgi: IDXGIDevice = device.cast().ok()?;
                    CreateDirect3D11DeviceFromDXGIDevice(&dxgi)
                        .ok()?
                        .cast::<IDirect3DDevice>()
                        .ok()?
                };
                Some(Self {
                    device,
                    context,
                    winrt_device,
                })
            }

            pub fn capture_monitor(&self, hmon: HMONITOR) -> Option<image::RgbaImage> {
                let interop =
                    windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
                        .ok()?;
                let item: GraphicsCaptureItem =
                    unsafe { interop.CreateForMonitor(hmon) }.ok()?;
                self.capture_item(&item)
            }

            pub fn capture_window(&self, hwnd: HWND) -> Option<image::RgbaImage> {
                let interop =
                    windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
                        .ok()?;
                let item: GraphicsCaptureItem = unsafe { interop.CreateForWindow(hwnd) }.ok()?;
                self.capture_item(&item)
            }

            fn capture_item(&self, item: &GraphicsCaptureItem) -> Option<image::RgbaImage> {
                let size = item.Size().ok()?;
                if size.Width <= 0 || size.Height <= 0 {
                    return None;
                }
                let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
                    &self.winrt_device,
                    DirectXPixelFormat::B8G8R8A8UIntNormalized,
                    2,
                    size,
                )
                .ok()?;
                let session = pool.CreateCaptureSession(item).ok()?;
                let _ = session.SetIsCursorCaptureEnabled(false);
                // Win11-only; a visible border for the ~1-frame capture is
                // cosmetic, so failure is ignored.
                let _ = session.SetIsBorderRequired(false);
                if session.StartCapture().is_err() {
                    let _ = session.Close();
                    let _ = pool.Close();
                    return None;
                }
                // Free-threaded pool: poll for the first composed frame.
                let mut frame: Option<Direct3D11CaptureFrame> = None;
                for _ in 0..100 {
                    if let Ok(f) = pool.TryGetNextFrame() {
                        frame = Some(f);
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(10));
                }
                let result = frame.and_then(|f| self.frame_to_rgba(&f));
                let _ = session.Close();
                let _ = pool.Close();
                result
            }

            fn frame_to_rgba(&self, frame: &Direct3D11CaptureFrame) -> Option<image::RgbaImage> {
                let surface = frame.Surface().ok()?;
                let access: IDirect3DDxgiInterfaceAccess = surface.cast().ok()?;
                let texture: ID3D11Texture2D = unsafe { access.GetInterface() }.ok()?;
                unsafe {
                    let mut desc = D3D11_TEXTURE2D_DESC::default();
                    texture.GetDesc(&mut desc);
                    let staging_desc = D3D11_TEXTURE2D_DESC {
                        Width: desc.Width,
                        Height: desc.Height,
                        MipLevels: 1,
                        ArraySize: 1,
                        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                        SampleDesc: DXGI_SAMPLE_DESC {
                            Count: 1,
                            Quality: 0,
                        },
                        Usage: D3D11_USAGE_STAGING,
                        BindFlags: 0,
                        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                        MiscFlags: 0,
                    };
                    let mut staging: Option<ID3D11Texture2D> = None;
                    self.device
                        .CreateTexture2D(&staging_desc, None, Some(&mut staging))
                        .ok()?;
                    let staging = staging?;
                    self.context.CopyResource(&staging, &texture);
                    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                    self.context
                        .Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                        .ok()?;
                    let w = desc.Width as usize;
                    let h = desc.Height as usize;
                    let mut buf = vec![0u8; w * h * 4];
                    let src = mapped.pData as *const u8;
                    for row in 0..h {
                        std::ptr::copy_nonoverlapping(
                            src.add(row * mapped.RowPitch as usize),
                            buf[row * w * 4..].as_mut_ptr(),
                            w * 4,
                        );
                    }
                    self.context.Unmap(&staging, 0);
                    // BGRA -> RGBA
                    for px in buf.chunks_exact_mut(4) {
                        px.swap(0, 2);
                        px[3] = 255;
                    }
                    image::RgbaImage::from_raw(w as u32, h as u32, buf)
                }
            }
        }

        fn create_d3d_device() -> Option<(ID3D11Device, ID3D11DeviceContext)> {
            // WARP fallback covers RDP/headless sessions with no hardware GPU.
            for driver in [D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP] {
                if let Some(pair) = try_create_device(driver) {
                    return Some(pair);
                }
            }
            None
        }

        fn try_create_device(driver: D3D_DRIVER_TYPE) -> Option<(ID3D11Device, ID3D11DeviceContext)> {
            unsafe {
                let mut device: Option<ID3D11Device> = None;
                let mut context: Option<ID3D11DeviceContext> = None;
                D3D11CreateDevice(
                    None,
                    driver,
                    windows::Win32::Foundation::HMODULE::default(),
                    D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                    None,
                    D3D11_SDK_VERSION,
                    Some(&mut device),
                    None,
                    Some(&mut context),
                )
                .ok()?;
                Some((device?, context?))
            }
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    /// Interactive-desktop test: verifies WGC monitor thumbnails aren't the
    /// all-black frames GDI produced. Run manually:
    /// `cargo test -p fluxer-desktop -- --ignored thumbnails`
    #[test]
    #[ignore]
    fn monitor_thumbnails_are_not_black() {
        use base64::Engine;
        let sources = get_sources(&["screen".to_string()], false);
        assert!(!sources.is_empty(), "no monitors enumerated");
        for s in &sources {
            let url = s
                .thumbnail_data_url
                .as_ref()
                .unwrap_or_else(|| panic!("source {} has no thumbnail", s.id));
            let b64 = url.strip_prefix("data:image/png;base64,").unwrap();
            let png = base64::engine::general_purpose::STANDARD.decode(b64).unwrap();
            let img = image::load_from_memory(&png).unwrap().to_rgba8();
            let non_black = img
                .pixels()
                .filter(|p| p.0[0] > 16 || p.0[1] > 16 || p.0[2] > 16)
                .count();
            let total = (img.width() * img.height()) as usize;
            assert!(
                non_black * 20 > total,
                "thumbnail for {} is ≥95% black ({non_black}/{total} lit pixels)",
                s.id
            );
        }
    }
}
