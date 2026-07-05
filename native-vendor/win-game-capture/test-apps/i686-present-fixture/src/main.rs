// SPDX-License-Identifier: AGPL-3.0-or-later

#[cfg(not(windows))]
fn main() {
    eprintln!("i686-present-fixture is only functional on Windows");
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
    use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
    use windows::Win32::Graphics::Direct3D11::{
        D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION,
        D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11RenderTargetView,
        ID3D11Resource, ID3D11Texture2D,
    };
    use windows::Win32::Graphics::Dxgi::Common::{
        DXGI_ALPHA_MODE_IGNORE, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC,
    };
    use windows::Win32::Graphics::Dxgi::{
        DXGI_SCALING_STRETCH, DXGI_SWAP_CHAIN_DESC1, DXGI_SWAP_EFFECT_FLIP_DISCARD,
        DXGI_USAGE_RENDER_TARGET_OUTPUT, IDXGIDevice, IDXGIFactory2, IDXGISwapChain1,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, CreateWindowExW, DefWindowProcW, DispatchMessageW,
        GetClientRect, MSG, PM_REMOVE, PeekMessageW, PostQuitMessage, RegisterClassExW, SW_SHOW,
        ShowWindow, TranslateMessage, WM_DESTROY, WM_QUIT, WNDCLASSEXW, WS_OVERLAPPEDWINDOW,
        WS_POPUP, WS_VISIBLE,
    };
    use windows_core::{Interface, Result, w};

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
            let class_name = w!("FluxerI686Fixture");
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
                w!("Fluxer i686 (WOW64) Present Fixture"),
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
        device: ID3D11Device,
        context: ID3D11DeviceContext,
        swap_chain: IDXGISwapChain1,
        rtv: ID3D11RenderTargetView,
        width: u32,
        height: u32,
        staging: ID3D11Texture2D,
    }

    impl Renderer {
        unsafe fn new(hwnd: HWND, width: u32, height: u32) -> Result<Self> {
            unsafe {
                let mut device: Option<ID3D11Device> = None;
                let mut context: Option<ID3D11DeviceContext> = None;
                D3D11CreateDevice(
                    None,
                    D3D_DRIVER_TYPE_HARDWARE,
                    HMODULE::default(),
                    D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                    None,
                    D3D11_SDK_VERSION,
                    Some(&mut device),
                    None,
                    Some(&mut context),
                )?;
                let device = device.expect("D3D11CreateDevice yielded no device");
                let context = context.expect("D3D11CreateDevice yielded no context");

                let dxgi_device: IDXGIDevice = device.cast()?;
                let adapter = dxgi_device.GetAdapter()?;
                let factory: IDXGIFactory2 = adapter.GetParent()?;

                let desc = DXGI_SWAP_CHAIN_DESC1 {
                    Width: width,
                    Height: height,
                    Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    Stereo: false.into(),
                    SampleDesc: DXGI_SAMPLE_DESC {
                        Count: 1,
                        Quality: 0,
                    },
                    BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
                    BufferCount: 2,
                    Scaling: DXGI_SCALING_STRETCH,
                    SwapEffect: DXGI_SWAP_EFFECT_FLIP_DISCARD,
                    AlphaMode: DXGI_ALPHA_MODE_IGNORE,
                    Flags: 0,
                };
                let swap_chain =
                    factory.CreateSwapChainForHwnd(&device, hwnd, &desc, None, None)?;

                let rtv = Self::make_rtv(&device, &swap_chain)?;
                let staging = Self::make_staging(&device, width, height)?;

                Ok(Self {
                    device,
                    context,
                    swap_chain,
                    rtv,
                    width,
                    height,
                    staging,
                })
            }
        }

        unsafe fn make_rtv(
            device: &ID3D11Device,
            swap_chain: &IDXGISwapChain1,
        ) -> Result<ID3D11RenderTargetView> {
            unsafe {
                let back_buffer: ID3D11Texture2D = swap_chain.GetBuffer(0)?;
                let resource: ID3D11Resource = back_buffer.cast()?;
                let mut rtv: Option<ID3D11RenderTargetView> = None;
                device.CreateRenderTargetView(&resource, None, Some(&mut rtv))?;
                Ok(rtv.expect("CreateRenderTargetView yielded no view"))
            }
        }

        unsafe fn make_staging(
            device: &ID3D11Device,
            width: u32,
            height: u32,
        ) -> Result<ID3D11Texture2D> {
            use windows::Win32::Graphics::Direct3D11::{
                D3D11_CPU_ACCESS_WRITE, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
            };
            unsafe {
                let desc = D3D11_TEXTURE2D_DESC {
                    Width: width,
                    Height: height,
                    MipLevels: 1,
                    ArraySize: 1,
                    Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    SampleDesc: DXGI_SAMPLE_DESC {
                        Count: 1,
                        Quality: 0,
                    },
                    Usage: D3D11_USAGE_STAGING,
                    BindFlags: 0,
                    CPUAccessFlags: D3D11_CPU_ACCESS_WRITE.0 as u32,
                    MiscFlags: 0,
                };
                let mut staging: Option<ID3D11Texture2D> = None;
                device.CreateTexture2D(&desc, None, Some(&mut staging))?;
                Ok(staging.expect("CreateTexture2D yielded no staging texture"))
            }
        }

        unsafe fn render_frame(&self, frame_index: u64) -> Result<()> {
            use windows::Win32::Graphics::Direct3D11::D3D11_MAP_WRITE;
            unsafe {
                let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                self.context
                    .Map(&self.staging, 0, D3D11_MAP_WRITE, 0, Some(&mut mapped))?;
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
                        *px = b.saturating_add(luma / 4);
                        *px.add(1) = g;
                        *px.add(2) = r;
                        *px.add(3) = 255;
                    }
                }
                self.context.Unmap(&self.staging, 0);

                let back_buffer: ID3D11Texture2D = self.swap_chain.GetBuffer(0)?;
                let dst: ID3D11Resource = back_buffer.cast()?;
                let src: ID3D11Resource = self.staging.cast()?;
                self.context.CopyResource(&dst, &src);
                let _ = &self.rtv;
                self.swap_chain.Present(1, Default::default()).ok()?;
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
