// SPDX-License-Identifier: AGPL-3.0-or-later

#[cfg(not(windows))]
fn main() {
    eprintln!("d3d9-present-fixture is only functional on Windows");
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
    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    pub enum PresentMode {
        Device,
        SwapChain,
    }

    pub struct Options {
        pub frames: Option<u64>,
        pub width: u32,
        pub height: u32,
        pub borderless: bool,
        pub multisample: bool,
        pub present_mode: PresentMode,
    }

    impl Default for Options {
        fn default() -> Self {
            Self {
                frames: None,
                width: 1280,
                height: 720,
                borderless: false,
                multisample: false,
                present_mode: PresentMode::Device,
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
                    "--multisample" => options.multisample = true,
                    "--no-multisample" => options.multisample = false,
                    "--swapchain-present" => options.present_mode = PresentMode::SwapChain,
                    "--device-present" => options.present_mode = PresentMode::Device,
                    _ => {}
                }
            }
            options
        }
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::{
        cli::{Options, PresentMode},
        pattern,
    };
    use std::ptr::null;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Direct3D9::{
        D3D_SDK_VERSION, D3DADAPTER_DEFAULT, D3DCLEAR_TARGET, D3DCREATE_HARDWARE_VERTEXPROCESSING,
        D3DCREATE_SOFTWARE_VERTEXPROCESSING, D3DDEVTYPE_HAL, D3DFMT_X8R8G8B8,
        D3DMULTISAMPLE_2_SAMPLES, D3DMULTISAMPLE_NONE, D3DPRESENT_PARAMETERS, D3DRECT,
        D3DSWAPEFFECT_DISCARD, Direct3DCreate9, IDirect3D9, IDirect3DDevice9,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, CreateWindowExW, DefWindowProcW, DispatchMessageW,
        GetClientRect, MSG, PM_REMOVE, PeekMessageW, PostQuitMessage, RegisterClassExW, SW_SHOW,
        ShowWindow, TranslateMessage, WM_DESTROY, WM_QUIT, WNDCLASSEXW, WS_OVERLAPPEDWINDOW,
        WS_POPUP, WS_VISIBLE,
    };
    use windows_core::{BOOL, Result, w};

    const D3DERR_DEVICELOST: i32 = 0x8876_0868u32 as i32;

    fn d3dcolor_xrgb(r: u8, g: u8, b: u8) -> u32 {
        0xFF00_0000 | ((r as u32) << 16) | ((g as u32) << 8) | (b as u32)
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
            let class_name = w!("FluxerD3D9Fixture");
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
                w!("Fluxer D3D9 Present Fixture"),
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

    fn present_params(
        hwnd: HWND,
        width: u32,
        height: u32,
        multisample: bool,
    ) -> D3DPRESENT_PARAMETERS {
        D3DPRESENT_PARAMETERS {
            BackBufferWidth: width,
            BackBufferHeight: height,
            BackBufferFormat: D3DFMT_X8R8G8B8,
            BackBufferCount: 1,
            MultiSampleType: if multisample {
                D3DMULTISAMPLE_2_SAMPLES
            } else {
                D3DMULTISAMPLE_NONE
            },
            MultiSampleQuality: 0,
            SwapEffect: D3DSWAPEFFECT_DISCARD,
            hDeviceWindow: hwnd,
            Windowed: BOOL(1),
            EnableAutoDepthStencil: BOOL(0),
            ..Default::default()
        }
    }

    struct Renderer {
        _d3d9: IDirect3D9,
        device: IDirect3DDevice9,
        hwnd: HWND,
        width: u32,
        height: u32,
        device_lost: bool,
        multisample: bool,
        present_mode: PresentMode,
    }

    impl Renderer {
        unsafe fn new(
            hwnd: HWND,
            width: u32,
            height: u32,
            multisample: bool,
            present_mode: PresentMode,
        ) -> Result<Self> {
            unsafe {
                let d3d9 = Direct3DCreate9(D3D_SDK_VERSION)
                    .ok_or_else(|| windows_core::Error::from_thread())?;

                let mut params = present_params(hwnd, width, height, multisample);

                let mut device: Option<IDirect3DDevice9> = None;
                let mut created = d3d9
                    .CreateDevice(
                        D3DADAPTER_DEFAULT,
                        D3DDEVTYPE_HAL,
                        hwnd,
                        D3DCREATE_HARDWARE_VERTEXPROCESSING as u32,
                        &mut params,
                        &mut device,
                    )
                    .is_ok();
                if !created {
                    created = d3d9
                        .CreateDevice(
                            D3DADAPTER_DEFAULT,
                            D3DDEVTYPE_HAL,
                            hwnd,
                            D3DCREATE_SOFTWARE_VERTEXPROCESSING as u32,
                            &mut params,
                            &mut device,
                        )
                        .is_ok();
                }
                let device = if created {
                    device.ok_or_else(|| windows_core::Error::from_thread())?
                } else {
                    return Err(windows_core::Error::from_thread());
                };

                Ok(Self {
                    _d3d9: d3d9,
                    device,
                    hwnd,
                    width,
                    height,
                    device_lost: false,
                    multisample,
                    present_mode,
                })
            }
        }

        unsafe fn try_reset(&mut self) {
            unsafe {
                let mut params =
                    present_params(self.hwnd, self.width, self.height, self.multisample);
                if self.device.Reset(&mut params).is_ok() {
                    self.device_lost = false;
                }
            }
        }

        unsafe fn render_frame(&mut self, frame_index: u64) -> Result<()> {
            unsafe {
                if self.device_lost {
                    self.try_reset();
                    if self.device_lost {
                        return self.present();
                    }
                }

                let width = self.width.max(1);
                let height = self.height as i32;

                let bars = pattern::BARS.len() as u32;
                for bar in 0..bars {
                    let x1 = ((bar as u64 * width as u64) / bars as u64) as i32;
                    let x2 = (((bar + 1) as u64 * width as u64) / bars as u64) as i32;
                    if x2 <= x1 {
                        continue;
                    }
                    let mid = ((x1 + x2) / 2).max(0) as u32;
                    let (r, g, b) = pattern::bar_colour(mid, width);
                    let rect = D3DRECT {
                        x1,
                        y1: 0,
                        x2,
                        y2: height,
                    };
                    self.device.Clear(
                        1,
                        &rect,
                        D3DCLEAR_TARGET as u32,
                        d3dcolor_xrgb(r, g, b),
                        1.0,
                        0,
                    )?;
                }

                let block = pattern::COUNTER_BLOCK as i32;
                let block_x2 = block.min(width as i32);
                let block_y2 = block.min(height);
                if block_x2 > 0 && block_y2 > 0 {
                    let (r, g, b) = pattern::counter_colour(frame_index);
                    let rect = D3DRECT {
                        x1: 0,
                        y1: 0,
                        x2: block_x2,
                        y2: block_y2,
                    };
                    self.device.Clear(
                        1,
                        &rect,
                        D3DCLEAR_TARGET as u32,
                        d3dcolor_xrgb(r, g, b),
                        1.0,
                        0,
                    )?;
                }

                self.present()
            }
        }

        unsafe fn present(&mut self) -> Result<()> {
            unsafe {
                let result = match self.present_mode {
                    PresentMode::Device => {
                        self.device.Present(null(), null(), HWND::default(), null())
                    }
                    PresentMode::SwapChain => self.device.GetSwapChain(0).and_then(|swap_chain| {
                        swap_chain.Present(null(), null(), HWND::default(), null(), 0)
                    }),
                };
                match result {
                    Ok(()) => Ok(()),
                    Err(err) if err.code().0 == D3DERR_DEVICELOST => {
                        self.device_lost = true;
                        Ok(())
                    }
                    Err(err) => Err(err),
                }
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

            let mut renderer = Renderer::new(
                hwnd,
                width,
                height,
                options.multisample,
                options.present_mode,
            )?;

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
