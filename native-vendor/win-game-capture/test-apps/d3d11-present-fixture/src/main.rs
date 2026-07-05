// SPDX-License-Identifier: AGPL-3.0-or-later

#[cfg(not(windows))]
fn main() {
    eprintln!("d3d11-present-fixture is only functional on Windows");
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

#[cfg_attr(not(windows), allow(dead_code))]
mod cli {
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum PresentFormat {
        Bgra8,
        Rgba8,
        R10G10B10A2,
        Rgba16Float,
    }

    impl PresentFormat {
        fn parse(value: &str) -> Option<Self> {
            match value {
                "bgra8" | "b8g8r8a8" => Some(Self::Bgra8),
                "rgba8" | "r8g8b8a8" => Some(Self::Rgba8),
                "r10g10b10a2" | "rgb10a2" | "10bit" => Some(Self::R10G10B10A2),
                "rgba16f" | "r16g16b16a16f" | "fp16" => Some(Self::Rgba16Float),
                _ => None,
            }
        }
    }

    pub struct Options {
        pub frames: Option<u64>,
        pub width: u32,
        pub height: u32,
        pub borderless: bool,
        pub format: PresentFormat,
    }

    impl Default for Options {
        fn default() -> Self {
            Self {
                frames: None,
                width: 1280,
                height: 720,
                borderless: false,
                format: PresentFormat::Bgra8,
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
                    "--format" => {
                        if let Some(format) = args.next().and_then(|v| PresentFormat::parse(&v)) {
                            options.format = format;
                        }
                    }
                    _ => {}
                }
            }
            options
        }
    }

    #[cfg(test)]
    mod tests {
        use super::PresentFormat;

        #[test]
        fn parses_explicit_format_modes() {
            assert_eq!(PresentFormat::parse("bgra8"), Some(PresentFormat::Bgra8));
            assert_eq!(PresentFormat::parse("rgba8"), Some(PresentFormat::Rgba8));
            assert_eq!(
                PresentFormat::parse("r10g10b10a2"),
                Some(PresentFormat::R10G10B10A2)
            );
            assert_eq!(
                PresentFormat::parse("fp16"),
                Some(PresentFormat::Rgba16Float)
            );
            assert_eq!(PresentFormat::parse("unknown"), None);
        }
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::{
        cli::{Options, PresentFormat},
        pattern,
    };
    use windows::Win32::Foundation::{HMODULE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
    use windows::Win32::Graphics::Direct3D11::{
        D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION,
        D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11RenderTargetView,
        ID3D11Resource, ID3D11Texture2D,
    };
    use windows::Win32::Graphics::Dxgi::Common::{
        DXGI_ALPHA_MODE_IGNORE, DXGI_FORMAT, DXGI_FORMAT_B8G8R8A8_UNORM,
        DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_FORMAT_R10G10B10A2_UNORM, DXGI_FORMAT_R16G16B16A16_FLOAT,
        DXGI_SAMPLE_DESC,
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

    impl PresentFormat {
        fn dxgi(self) -> DXGI_FORMAT {
            match self {
                PresentFormat::Bgra8 => DXGI_FORMAT_B8G8R8A8_UNORM,
                PresentFormat::Rgba8 => DXGI_FORMAT_R8G8B8A8_UNORM,
                PresentFormat::R10G10B10A2 => DXGI_FORMAT_R10G10B10A2_UNORM,
                PresentFormat::Rgba16Float => DXGI_FORMAT_R16G16B16A16_FLOAT,
            }
        }

        fn bytes_per_pixel(self) -> usize {
            match self {
                PresentFormat::Bgra8 | PresentFormat::Rgba8 | PresentFormat::R10G10B10A2 => 4,
                PresentFormat::Rgba16Float => 8,
            }
        }
    }

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
            let class_name = w!("FluxerD3D11Fixture");
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
                w!("Fluxer D3D11 Present Fixture"),
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
        format: PresentFormat,
    }

    impl Renderer {
        unsafe fn new(hwnd: HWND, width: u32, height: u32, format: PresentFormat) -> Result<Self> {
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
                    Format: format.dxgi(),
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
                let staging = Self::make_staging(&device, width, height, format)?;

                Ok(Self {
                    device,
                    context,
                    swap_chain,
                    rtv,
                    width,
                    height,
                    staging,
                    format,
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
            format: PresentFormat,
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
                    Format: format.dxgi(),
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
                let bpp = self.format.bytes_per_pixel();
                for y in 0..self.height {
                    let row = base.add(y as usize * row_pitch);
                    for x in 0..self.width {
                        let (r, g, b) = if x < pattern::COUNTER_BLOCK && y < pattern::COUNTER_BLOCK
                        {
                            counter
                        } else {
                            pattern::bar_colour(x, self.width)
                        };
                        let px = row.add(x as usize * bpp);
                        write_pixel(self.format, px, r, g, b.saturating_add(luma / 4));
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

    unsafe fn write_pixel(format: PresentFormat, px: *mut u8, r: u8, g: u8, b: u8) {
        unsafe {
            match format {
                PresentFormat::Bgra8 => {
                    *px = b;
                    *px.add(1) = g;
                    *px.add(2) = r;
                    *px.add(3) = 255;
                }
                PresentFormat::Rgba8 => {
                    *px = r;
                    *px.add(1) = g;
                    *px.add(2) = b;
                    *px.add(3) = 255;
                }
                PresentFormat::R10G10B10A2 => {
                    let packed = scale8_to_10(r)
                        | (scale8_to_10(g) << 10)
                        | (scale8_to_10(b) << 20)
                        | (0x3 << 30);
                    std::ptr::copy_nonoverlapping(packed.to_le_bytes().as_ptr(), px, 4);
                }
                PresentFormat::Rgba16Float => {
                    let highlight = if r == 255 && g == 255 && b > 240 {
                        1.25
                    } else {
                        1.0
                    };
                    let values = [
                        f32_to_f16((r as f32 / 255.0) * highlight),
                        f32_to_f16((g as f32 / 255.0) * highlight),
                        f32_to_f16((b as f32 / 255.0) * highlight),
                        f32_to_f16(1.0),
                    ];
                    for (index, value) in values.iter().enumerate() {
                        std::ptr::copy_nonoverlapping(
                            value.to_le_bytes().as_ptr(),
                            px.add(index * 2),
                            2,
                        );
                    }
                }
            }
        }
    }

    fn scale8_to_10(value: u8) -> u32 {
        (value as u32 * 1023 + 127) / 255
    }

    fn f32_to_f16(value: f32) -> u16 {
        let value = value.clamp(0.0, 65504.0);
        if value == 0.0 {
            return 0;
        }
        let bits = value.to_bits();
        let exp = ((bits >> 23) & 0xFF) as i32 - 127 + 15;
        let mant = bits & 0x7F_FFFF;
        if exp <= 0 {
            return 0;
        }
        if exp >= 31 {
            return 0x7BFF;
        }
        ((exp as u16) << 10) | (((mant + 0x1000) >> 13) as u16)
    }

    pub fn run() -> Result<()> {
        let options = Options::from_env();
        unsafe {
            let hwnd = create_window(options.width, options.height, options.borderless)?;

            let mut rect = Default::default();
            let _ = GetClientRect(hwnd, &mut rect);
            let width = ((rect.right - rect.left).max(1)) as u32;
            let height = ((rect.bottom - rect.top).max(1)) as u32;

            let renderer = Renderer::new(hwnd, width, height, options.format)?;

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
