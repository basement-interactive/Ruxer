// SPDX-License-Identifier: AGPL-3.0-or-later

#[cfg(not(windows))]
fn main() {
    eprintln!("d3d10-present-fixture is only functional on Windows");
}

#[cfg(windows)]
fn main() -> windows_core::Result<()> {
    windows_impl::run()
}

#[cfg_attr(not(windows), allow(dead_code))]
mod pattern {
    pub const BARS: [(u8, u8, u8); 8] = [
        (255, 255, 255),
        (255, 255, 0),
        (0, 255, 255),
        (0, 255, 0),
        (255, 0, 255),
        (255, 0, 0),
        (0, 0, 255),
        (0, 0, 0),
    ];

    pub const COUNTER_BLOCK: u32 = 16;

    pub fn bar_colour(x: u32, width: u32) -> (u8, u8, u8) {
        let width = width.max(1);
        let index = ((x as u64 * BARS.len() as u64) / width as u64) as usize;
        BARS[index.min(BARS.len() - 1)]
    }

    pub fn counter_colour(frame_index: u64) -> (u8, u8, u8) {
        let low = (frame_index & 0x00FF_FFFF) as u32;
        (
            (low & 0xFF) as u8,
            ((low >> 8) & 0xFF) as u8,
            ((low >> 16) & 0xFF) as u8,
        )
    }
}

#[cfg(windows)]
mod cli {
    pub struct Options {
        pub frames: Option<u64>,
        pub width: u32,
        pub height: u32,
        pub borderless: bool,
    }

    impl Default for Options {
        fn default() -> Self {
            Self {
                frames: None,
                width: 1280,
                height: 720,
                borderless: false,
            }
        }
    }

    impl Options {
        pub fn from_env() -> Self {
            let mut options = Options::default();
            let mut args = std::env::args().skip(1);
            while let Some(arg) = args.next() {
                match arg.as_str() {
                    "--frames" => {
                        if let Some(value) = args.next().and_then(|v| v.parse().ok()) {
                            options.frames = Some(value);
                        }
                    }
                    "--width" => {
                        if let Some(value) = args.next().and_then(|v| v.parse().ok()) {
                            options.width = value;
                        }
                    }
                    "--height" => {
                        if let Some(value) = args.next().and_then(|v| v.parse().ok()) {
                            options.height = value;
                        }
                    }
                    "--borderless" => options.borderless = true,
                    "--windowed" => options.borderless = false,
                    _ => {}
                }
            }
            options
        }
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::{cli::Options, pattern};
    use windows::Win32::Foundation::{HMODULE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Direct3D10::{
        D3D10_DRIVER_TYPE_HARDWARE, D3D10_MAPPED_TEXTURE2D, D3D10_SDK_VERSION, D3D10CreateDevice,
        ID3D10Device, ID3D10RenderTargetView, ID3D10Resource, ID3D10Texture2D,
    };
    use windows::Win32::Graphics::Dxgi::Common::{
        DXGI_FORMAT, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_MODE_DESC,
        DXGI_RATIONAL, DXGI_SAMPLE_DESC,
    };
    use windows::Win32::Graphics::Dxgi::{
        DXGI_PRESENT, DXGI_SWAP_CHAIN_DESC, DXGI_SWAP_EFFECT_DISCARD,
        DXGI_USAGE_RENDER_TARGET_OUTPUT, IDXGIDevice, IDXGIFactory, IDXGISwapChain,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, CreateWindowExW, DefWindowProcW, DispatchMessageW,
        GetClientRect, MSG, PM_REMOVE, PeekMessageW, PostQuitMessage, RegisterClassExW, SW_SHOW,
        ShowWindow, TranslateMessage, WM_DESTROY, WM_QUIT, WNDCLASSEXW, WS_OVERLAPPEDWINDOW,
        WS_POPUP, WS_VISIBLE,
    };
    use windows_core::{BOOL, Interface, Result, w};

    extern "system" fn wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        unsafe {
            match msg {
                WM_DESTROY => {
                    PostQuitMessage(0);
                    LRESULT(0)
                }
                _ => DefWindowProcW(hwnd, msg, wparam, lparam),
            }
        }
    }

    unsafe fn create_window(width: u32, height: u32, borderless: bool) -> Result<HWND> {
        unsafe {
            let instance = GetModuleHandleW(None)?;
            let class_name = w!("FluxerD3D10Fixture");
            let wc = WNDCLASSEXW {
                cbSize: size_of::<WNDCLASSEXW>() as u32,
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(wnd_proc),
                hInstance: instance.into(),
                lpszClassName: class_name,
                ..Default::default()
            };
            RegisterClassExW(&wc);
            let style = if borderless {
                WS_POPUP | WS_VISIBLE
            } else {
                WS_OVERLAPPEDWINDOW | WS_VISIBLE
            };
            let hwnd = CreateWindowExW(
                Default::default(),
                class_name,
                w!("Fluxer D3D10 Present Fixture"),
                style,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                width as i32,
                height as i32,
                None,
                None,
                Some(instance.into()),
                None,
            )?;
            let _ = ShowWindow(hwnd, SW_SHOW);
            Ok(hwnd)
        }
    }

    struct Renderer {
        device: ID3D10Device,
        swap_chain: IDXGISwapChain,
        rtv: ID3D10RenderTargetView,
        width: u32,
        height: u32,
        staging: ID3D10Texture2D,
        format: DXGI_FORMAT,
    }

    impl Renderer {
        unsafe fn new(hwnd: HWND, width: u32, height: u32) -> Result<Self> {
            unsafe {
                let mut device: Option<ID3D10Device> = None;
                D3D10CreateDevice(
                    None,
                    D3D10_DRIVER_TYPE_HARDWARE,
                    HMODULE::default(),
                    0,
                    D3D10_SDK_VERSION,
                    Some(&mut device),
                )?;
                let device = device.expect("D3D10CreateDeviceAndSwapChain yielded no device");

                let dxgi_device: IDXGIDevice = device.cast()?;
                let adapter = dxgi_device.GetAdapter()?;
                let factory: IDXGIFactory = adapter.GetParent()?;
                let (swap_chain, format) =
                    Self::make_swap_chain(&factory, &device, hwnd, width, height)?;

                let rtv = Self::make_rtv(&device, &swap_chain)?;
                let staging = Self::make_staging(&device, width, height, format)?;

                Ok(Self {
                    device,
                    swap_chain,
                    rtv,
                    width,
                    height,
                    staging,
                    format,
                })
            }
        }

        unsafe fn make_swap_chain(
            factory: &IDXGIFactory,
            device: &ID3D10Device,
            hwnd: HWND,
            width: u32,
            height: u32,
        ) -> Result<(IDXGISwapChain, DXGI_FORMAT)> {
            unsafe {
                let mut last = windows_core::HRESULT(0);
                for format in [DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_R8G8B8A8_UNORM] {
                    let desc = DXGI_SWAP_CHAIN_DESC {
                        BufferDesc: DXGI_MODE_DESC {
                            Width: width,
                            Height: height,
                            RefreshRate: DXGI_RATIONAL {
                                Numerator: 0,
                                Denominator: 0,
                            },
                            Format: format,
                            ..Default::default()
                        },
                        SampleDesc: DXGI_SAMPLE_DESC {
                            Count: 1,
                            Quality: 0,
                        },
                        BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
                        BufferCount: 1,
                        OutputWindow: hwnd,
                        Windowed: BOOL(1),
                        SwapEffect: DXGI_SWAP_EFFECT_DISCARD,
                        Flags: 0,
                    };
                    let mut swap_chain: Option<IDXGISwapChain> = None;
                    let hr = factory.CreateSwapChain(device, &desc, &mut swap_chain);
                    if hr.is_ok() {
                        return Ok((
                            swap_chain.expect("CreateSwapChain yielded no swapchain"),
                            format,
                        ));
                    }
                    last = hr;
                }
                last.ok()?;
                unreachable!()
            }
        }

        unsafe fn make_rtv(
            device: &ID3D10Device,
            swap_chain: &IDXGISwapChain,
        ) -> Result<ID3D10RenderTargetView> {
            unsafe {
                let back_buffer: ID3D10Texture2D = swap_chain.GetBuffer(0)?;
                let resource: ID3D10Resource = back_buffer.cast()?;
                let mut rtv: Option<ID3D10RenderTargetView> = None;
                device.CreateRenderTargetView(&resource, None, Some(&mut rtv))?;
                Ok(rtv.expect("CreateRenderTargetView yielded no view"))
            }
        }

        unsafe fn make_staging(
            device: &ID3D10Device,
            width: u32,
            height: u32,
            format: DXGI_FORMAT,
        ) -> Result<ID3D10Texture2D> {
            use windows::Win32::Graphics::Direct3D10::{
                D3D10_CPU_ACCESS_WRITE, D3D10_TEXTURE2D_DESC, D3D10_USAGE_STAGING,
            };
            unsafe {
                let desc = D3D10_TEXTURE2D_DESC {
                    Width: width,
                    Height: height,
                    MipLevels: 1,
                    ArraySize: 1,
                    Format: format,
                    SampleDesc: DXGI_SAMPLE_DESC {
                        Count: 1,
                        Quality: 0,
                    },
                    Usage: D3D10_USAGE_STAGING,
                    BindFlags: 0,
                    CPUAccessFlags: D3D10_CPU_ACCESS_WRITE.0 as u32,
                    MiscFlags: 0,
                };
                device.CreateTexture2D(&desc, None)
            }
        }

        unsafe fn render_frame(&self, frame_index: u64) -> Result<()> {
            use windows::Win32::Graphics::Direct3D10::D3D10_MAP_WRITE;
            unsafe {
                let (cr, cg, cb) =
                    pattern::BARS[(frame_index % pattern::BARS.len() as u64) as usize];
                let clear = [cr as f32 / 255.0, cg as f32 / 255.0, cb as f32 / 255.0, 1.0];
                self.device.ClearRenderTargetView(&self.rtv, &clear);

                let mapped: D3D10_MAPPED_TEXTURE2D = self.staging.Map(0, D3D10_MAP_WRITE, 0)?;
                let row_pitch = mapped.RowPitch as usize;
                let base = mapped.pData as *mut u8;
                let counter = pattern::counter_colour(frame_index);
                let luma = (frame_index & 0xFF) as u8;
                for y in 0..self.height {
                    let row = base.add(y as usize * row_pitch);
                    for x in 0..self.width {
                        let (r, g, b) = if x < pattern::COUNTER_BLOCK && y < pattern::COUNTER_BLOCK
                        {
                            counter
                        } else {
                            pattern::bar_colour(x, self.width)
                        };
                        let px = row.add(x as usize * 4);
                        if self.format == DXGI_FORMAT_R8G8B8A8_UNORM {
                            *px = r;
                            *px.add(1) = g;
                            *px.add(2) = b.saturating_add(luma / 4);
                        } else {
                            *px = b.saturating_add(luma / 4);
                            *px.add(1) = g;
                            *px.add(2) = r;
                        }
                        *px.add(3) = 255;
                    }
                }
                self.staging.Unmap(0);

                let back_buffer: ID3D10Texture2D = self.swap_chain.GetBuffer(0)?;
                let dst: ID3D10Resource = back_buffer.cast()?;
                let src: ID3D10Resource = self.staging.cast()?;
                self.device.CopyResource(&dst, &src);
                self.swap_chain.Present(1, DXGI_PRESENT(0)).ok()?;
                let _ = &self.device;
                Ok(())
            }
        }
    }

    pub fn run() -> Result<()> {
        let options = Options::from_env();
        unsafe {
            let hwnd = create_window(options.width, options.height, options.borderless)?;

            let mut rect = Default::default();
            let _ = GetClientRect(hwnd, &mut rect);
            let width = ((rect.right - rect.left).max(1)) as u32;
            let height = ((rect.bottom - rect.top).max(1)) as u32;

            let renderer = Renderer::new(hwnd, width, height)?;

            println!("HWND={}", hwnd.0 as isize);
            use std::io::Write;
            let _ = std::io::stdout().flush();

            let mut frame_index: u64 = 0;
            let mut msg = MSG::default();
            loop {
                while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                    if msg.message == WM_QUIT {
                        return Ok(());
                    }
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }

                renderer.render_frame(frame_index)?;
                frame_index += 1;

                if let Some(limit) = options.frames {
                    if frame_index >= limit {
                        return Ok(());
                    }
                }
            }
        }
    }
}
