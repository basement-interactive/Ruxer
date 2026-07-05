// SPDX-License-Identifier: AGPL-3.0-or-later

#[cfg(not(windows))]
fn main() {
    eprintln!("opengl-swapbuffers-fixture is only functional on Windows");
}

#[cfg(windows)]
fn main() -> windows_core::Result<()> {
    windows_impl::run()
}

#[allow(dead_code)]
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

    pub fn bar_x_range(index: usize, width: u32) -> (u32, u32) {
        let width = width.max(1) as u64;
        let len = BARS.len() as u64;
        let start = (index as u64 * width) / len;
        let end = ((index as u64 + 1) * width) / len;
        (start as u32, end.min(width) as u32)
    }

    pub fn counter_colour(frame_index: u64) -> (u8, u8, u8) {
        let low = (frame_index & 0x00FF_FFFF) as u32;
        (
            (low & 0xFF) as u8,
            ((low >> 8) & 0xFF) as u8,
            ((low >> 16) & 0xFF) as u8,
        )
    }

    pub fn clear_colour(frame_index: u64) -> [f32; 3] {
        let (r, g, b) = BARS[(frame_index % BARS.len() as u64) as usize];
        [r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0]
    }
}

#[cfg(windows)]
mod cli {
    pub struct Options {
        pub frames: Option<u64>,
        pub width: u32,
        pub height: u32,
        pub borderless: bool,
        pub layer: bool,
        pub stress_pack_state: bool,
        pub resize_at: Option<u64>,
        pub frame_delay_ms: u64,
    }

    impl Default for Options {
        fn default() -> Self {
            Self {
                frames: None,
                width: 1280,
                height: 720,
                borderless: false,
                layer: false,
                stress_pack_state: false,
                resize_at: None,
                frame_delay_ms: 0,
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
                    "--layer" => options.layer = true,
                    "--stress-pack-state" => options.stress_pack_state = true,
                    "--resize-at" => {
                        if let Some(value) = args.next().and_then(|v| v.parse().ok()) {
                            options.resize_at = Some(value);
                        }
                    }
                    "--frame-delay-ms" => {
                        if let Some(value) = args.next().and_then(|v| v.parse().ok()) {
                            options.frame_delay_ms = value;
                        }
                    }
                    _ => {}
                }
            }
            options
        }
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::cli::Options;
    use super::pattern;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Gdi::{GetDC, HDC, ReleaseDC, WGL_SWAP_MAIN_PLANE};
    use windows::Win32::Graphics::OpenGL::{
        ChoosePixelFormat, GL_COLOR_BUFFER_BIT, GL_FRONT, GL_PACK_ALIGNMENT, GL_PACK_LSB_FIRST,
        GL_PACK_ROW_LENGTH, GL_PACK_SKIP_PIXELS, GL_PACK_SKIP_ROWS, GL_PACK_SWAP_BYTES,
        GL_READ_BUFFER, GL_SCISSOR_TEST, PFD_DOUBLEBUFFER, PFD_DRAW_TO_WINDOW, PFD_MAIN_PLANE,
        PFD_SUPPORT_OPENGL, PFD_TYPE_RGBA, PIXELFORMATDESCRIPTOR, SetPixelFormat, SwapBuffers,
        glClear, glClearColor, glDisable, glEnable, glGetIntegerv, glPixelStorei, glReadBuffer,
        glScissor, glViewport, wglCreateContext, wglDeleteContext, wglGetProcAddress,
        wglMakeCurrent, wglSwapLayerBuffers,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CS_HREDRAW, CS_OWNDC, CS_VREDRAW, CW_USEDEFAULT, CreateWindowExW, DefWindowProcW,
        DispatchMessageW, GetClientRect, MSG, MoveWindow, PM_REMOVE, PeekMessageW, PostQuitMessage,
        RegisterClassExW, SW_SHOW, ShowWindow, TranslateMessage, WM_DESTROY, WM_QUIT, WNDCLASSEXW,
        WS_OVERLAPPEDWINDOW, WS_POPUP, WS_VISIBLE,
    };
    use windows_core::{PCSTR, Result, w};

    const GL_PIXEL_PACK_BUFFER: u32 = 0x88EB;
    const GL_PIXEL_PACK_BUFFER_BINDING: u32 = 0x88ED;
    const GL_STREAM_READ: u32 = 0x88E1;

    type GlGenBuffersFn = unsafe extern "system" fn(i32, *mut u32);
    type GlBindBufferFn = unsafe extern "system" fn(u32, u32);
    type GlBufferDataFn = unsafe extern "system" fn(u32, isize, *const core::ffi::c_void, u32);
    type GlDeleteBuffersFn = unsafe extern "system" fn(i32, *const u32);

    #[derive(Clone, Copy)]
    struct BufferProcs {
        gen_buffers: GlGenBuffersFn,
        bind_buffer: GlBindBufferFn,
        buffer_data: GlBufferDataFn,
        delete_buffers: GlDeleteBuffersFn,
    }

    struct PackStateStress {
        procs: Option<BufferProcs>,
        pbo: u32,
    }

    impl PackStateStress {
        unsafe fn new() -> Self {
            let Some(procs) = (unsafe { BufferProcs::load() }) else {
                return Self {
                    procs: None,
                    pbo: 0,
                };
            };
            let mut pbo = 0u32;
            unsafe {
                (procs.gen_buffers)(1, &mut pbo);
            }
            if pbo != 0 {
                let storage = [0u8; 16];
                unsafe {
                    (procs.bind_buffer)(GL_PIXEL_PACK_BUFFER, pbo);
                    (procs.buffer_data)(
                        GL_PIXEL_PACK_BUFFER,
                        storage.len() as isize,
                        storage.as_ptr().cast(),
                        GL_STREAM_READ,
                    );
                    (procs.bind_buffer)(GL_PIXEL_PACK_BUFFER, 0);
                }
            }
            Self {
                procs: Some(procs),
                pbo,
            }
        }

        fn pbo(&self) -> Option<u32> {
            (self.pbo != 0).then_some(self.pbo)
        }
    }

    impl Drop for PackStateStress {
        fn drop(&mut self) {
            unsafe {
                if let Some(procs) = self.procs {
                    if self.pbo != 0 {
                        (procs.bind_buffer)(GL_PIXEL_PACK_BUFFER, 0);
                        (procs.delete_buffers)(1, &self.pbo);
                    }
                }
            }
        }
    }

    impl BufferProcs {
        unsafe fn load() -> Option<Self> {
            Some(Self {
                gen_buffers: unsafe { load_gl_proc(b"glGenBuffers\0")? },
                bind_buffer: unsafe { load_gl_proc(b"glBindBuffer\0")? },
                buffer_data: unsafe { load_gl_proc(b"glBufferData\0")? },
                delete_buffers: unsafe { load_gl_proc(b"glDeleteBuffers\0")? },
            })
        }
    }

    unsafe fn load_gl_proc<T>(name: &'static [u8]) -> Option<T> {
        let proc = unsafe { wglGetProcAddress(PCSTR(name.as_ptr()))? };
        let address = proc as usize;
        if address <= 3 || address == usize::MAX {
            return None;
        }
        Some(unsafe { std::mem::transmute_copy::<_, T>(&proc) })
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
            let class_name = w!("FluxerOpenGLFixture");
            let wc = WNDCLASSEXW {
                cbSize: size_of::<WNDCLASSEXW>() as u32,
                style: CS_HREDRAW | CS_VREDRAW | CS_OWNDC,
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
                w!("Fluxer OpenGL SwapBuffers Fixture"),
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

    unsafe fn set_pixel_format(hdc: HDC) -> Result<()> {
        unsafe {
            let mut pfd = PIXELFORMATDESCRIPTOR {
                nSize: size_of::<PIXELFORMATDESCRIPTOR>() as u16,
                nVersion: 1,
                dwFlags: PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER,
                iPixelType: PFD_TYPE_RGBA,
                cColorBits: 32,
                cDepthBits: 24,
                cStencilBits: 8,
                iLayerType: PFD_MAIN_PLANE.0 as u8,
                ..Default::default()
            };
            let format = ChoosePixelFormat(hdc, &pfd);
            if format == 0 {
                return Err(windows_core::Error::from_thread());
            }
            SetPixelFormat(hdc, format, &mut pfd)?;
            Ok(())
        }
    }

    unsafe fn clear_rect(colour: (u8, u8, u8)) {
        unsafe {
            let (r, g, b) = colour;
            glClearColor(r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, 1.0);
            glClear(GL_COLOR_BUFFER_BIT);
        }
    }

    unsafe fn render_pattern(frame_index: u64, width: u32, height: u32) {
        unsafe {
            glViewport(0, 0, width as i32, height as i32);

            glEnable(GL_SCISSOR_TEST);
            for index in 0..pattern::BARS.len() {
                let (start, end) = pattern::bar_x_range(index, width);
                if end <= start {
                    continue;
                }
                glScissor(start as i32, 0, (end - start) as i32, height as i32);
                clear_rect(pattern::BARS[index]);
            }

            let block = pattern::COUNTER_BLOCK.min(width).min(height);
            if block > 0 {
                let y = height - block;
                glScissor(0, y as i32, block as i32, block as i32);
                clear_rect(pattern::counter_colour(frame_index));
            }

            glDisable(GL_SCISSOR_TEST);
        }
    }

    unsafe fn client_size(hwnd: HWND) -> (u32, u32) {
        unsafe {
            let mut rect = Default::default();
            let _ = GetClientRect(hwnd, &mut rect);
            (
                ((rect.right - rect.left).max(1)) as u32,
                ((rect.bottom - rect.top).max(1)) as u32,
            )
        }
    }

    unsafe fn stress_pack_state(stress: &PackStateStress) {
        unsafe {
            glReadBuffer(GL_FRONT);
            glPixelStorei(GL_PACK_ALIGNMENT, 1);
            glPixelStorei(GL_PACK_ROW_LENGTH, 0);
            glPixelStorei(GL_PACK_SKIP_PIXELS, 0);
            glPixelStorei(GL_PACK_SKIP_ROWS, 0);
            glPixelStorei(GL_PACK_SWAP_BYTES, 1);
            glPixelStorei(GL_PACK_LSB_FIRST, 1);
            if let (Some(procs), Some(pbo)) = (stress.procs, stress.pbo()) {
                (procs.bind_buffer)(GL_PIXEL_PACK_BUFFER, pbo);
            }
        }
    }

    unsafe fn assert_stress_pack_state(stress: &PackStateStress) {
        unsafe {
            let mut read_buffer = 0i32;
            let mut pack_alignment = 0i32;
            let mut pack_row_length = 0i32;
            let mut pack_skip_pixels = 0i32;
            let mut pack_skip_rows = 0i32;
            let mut pack_swap_bytes = 0i32;
            let mut pack_lsb_first = 0i32;
            let mut pack_buffer = 0i32;

            glGetIntegerv(GL_READ_BUFFER, &mut read_buffer);
            glGetIntegerv(GL_PACK_ALIGNMENT, &mut pack_alignment);
            glGetIntegerv(GL_PACK_ROW_LENGTH, &mut pack_row_length);
            glGetIntegerv(GL_PACK_SKIP_PIXELS, &mut pack_skip_pixels);
            glGetIntegerv(GL_PACK_SKIP_ROWS, &mut pack_skip_rows);
            glGetIntegerv(GL_PACK_SWAP_BYTES, &mut pack_swap_bytes);
            glGetIntegerv(GL_PACK_LSB_FIRST, &mut pack_lsb_first);
            glGetIntegerv(GL_PIXEL_PACK_BUFFER_BINDING, &mut pack_buffer);

            assert_eq!(
                read_buffer as u32, GL_FRONT,
                "GL_READ_BUFFER was not restored"
            );
            assert_eq!(pack_alignment, 1, "GL_PACK_ALIGNMENT was not restored");
            assert_eq!(pack_row_length, 0, "GL_PACK_ROW_LENGTH was not restored");
            assert_eq!(pack_skip_pixels, 0, "GL_PACK_SKIP_PIXELS was not restored");
            assert_eq!(pack_skip_rows, 0, "GL_PACK_SKIP_ROWS was not restored");
            assert_eq!(pack_swap_bytes, 1, "GL_PACK_SWAP_BYTES was not restored");
            assert_eq!(pack_lsb_first, 1, "GL_PACK_LSB_FIRST was not restored");
            if let Some(pbo) = stress.pbo() {
                assert_eq!(
                    pack_buffer as u32, pbo,
                    "GL_PIXEL_PACK_BUFFER_BINDING was not restored"
                );
            }
        }
    }

    pub fn run() -> Result<()> {
        let options = Options::from_env();
        unsafe {
            let hwnd = create_window(options.width, options.height, options.borderless)?;

            println!("HWND={}", hwnd.0 as isize);
            use std::io::Write;
            let _ = std::io::stdout().flush();

            let hdc = GetDC(Some(hwnd));
            set_pixel_format(hdc)?;
            let context = wglCreateContext(hdc)?;
            wglMakeCurrent(hdc, context)?;
            let pack_state_stress = PackStateStress::new();

            let mut frame_index: u64 = 0;
            let mut msg = MSG::default();
            let mut resized = false;
            'render: loop {
                while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                    if msg.message == WM_QUIT {
                        break 'render;
                    }
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }

                if let Some(resize_at) = options.resize_at {
                    if !resized && frame_index >= resize_at {
                        let width = options.width.saturating_add(160).max(1) as i32;
                        let height = options.height.saturating_add(96).max(1) as i32;
                        let _ = MoveWindow(hwnd, 0, 0, width, height, true);
                        resized = true;
                    }
                }

                let (width, height) = client_size(hwnd);
                render_pattern(frame_index, width, height);
                if options.stress_pack_state {
                    stress_pack_state(&pack_state_stress);
                }

                if options.layer {
                    wglSwapLayerBuffers(hdc, WGL_SWAP_MAIN_PLANE)?;
                } else {
                    SwapBuffers(hdc)?;
                }

                if options.stress_pack_state {
                    assert_stress_pack_state(&pack_state_stress);
                }

                frame_index += 1;
                if options.frame_delay_ms > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(options.frame_delay_ms));
                }
                if let Some(limit) = options.frames {
                    if frame_index >= limit {
                        break 'render;
                    }
                }
            }

            let _ = wglMakeCurrent(
                HDC::default(),
                windows::Win32::Graphics::OpenGL::HGLRC::default(),
            );
            let _ = wglDeleteContext(context);
            ReleaseDC(Some(hwnd), hdc);
            Ok(())
        }
    }
}
