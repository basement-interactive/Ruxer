// SPDX-License-Identifier: AGPL-3.0-or-later

#[cfg(not(windows))]
fn main() {
    eprintln!("d3d12-present-fixture is only functional on Windows");
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
        pub backbuffers: u32,
        pub format: PresentFormat,
    }

    impl Default for Options {
        fn default() -> Self {
            Self {
                frames: None,
                width: 1280,
                height: 720,
                borderless: false,
                backbuffers: 2,
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
                    "--backbuffers" => {
                        if let Some(value) = args.next().and_then(|v| v.parse().ok()) {
                            options.backbuffers = value;
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
            options.backbuffers = options.backbuffers.max(2);
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
    use super::cli::{Options, PresentFormat};
    use super::pattern;
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0};
    use windows::Win32::Graphics::Direct3D12::{
        D3D12_COMMAND_LIST_TYPE_DIRECT, D3D12_COMMAND_QUEUE_DESC, D3D12_COMMAND_QUEUE_FLAG_NONE,
        D3D12_CPU_DESCRIPTOR_HANDLE, D3D12_DESCRIPTOR_HEAP_DESC, D3D12_DESCRIPTOR_HEAP_FLAG_NONE,
        D3D12_DESCRIPTOR_HEAP_TYPE_RTV, D3D12_FENCE_FLAG_NONE, D3D12_RESOURCE_BARRIER,
        D3D12_RESOURCE_BARRIER_0, D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES,
        D3D12_RESOURCE_BARRIER_FLAG_NONE, D3D12_RESOURCE_BARRIER_TYPE_TRANSITION,
        D3D12_RESOURCE_STATE_PRESENT, D3D12_RESOURCE_STATE_RENDER_TARGET,
        D3D12_RESOURCE_TRANSITION_BARRIER, D3D12CreateDevice, ID3D12CommandAllocator,
        ID3D12CommandQueue, ID3D12DescriptorHeap, ID3D12Device, ID3D12Fence,
        ID3D12GraphicsCommandList, ID3D12PipelineState, ID3D12Resource,
    };
    use windows::Win32::Graphics::Dxgi::Common::{
        DXGI_ALPHA_MODE_IGNORE, DXGI_FORMAT, DXGI_FORMAT_B8G8R8A8_UNORM,
        DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_FORMAT_R10G10B10A2_UNORM, DXGI_FORMAT_R16G16B16A16_FLOAT,
        DXGI_SAMPLE_DESC,
    };
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory2, DXGI_ADAPTER_FLAG, DXGI_ADAPTER_FLAG_SOFTWARE,
        DXGI_CREATE_FACTORY_FLAGS, DXGI_SCALING_STRETCH, DXGI_SWAP_CHAIN_DESC1,
        DXGI_SWAP_EFFECT_FLIP_DISCARD, DXGI_USAGE_RENDER_TARGET_OUTPUT, IDXGIAdapter1,
        IDXGIFactory4, IDXGISwapChain3,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::{CreateEventW, INFINITE, WaitForSingleObject};
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
            let class_name = w!("FluxerD3D12Fixture");
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
                w!("Fluxer D3D12 Present Fixture"),
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

    unsafe fn create_device(factory: &IDXGIFactory4) -> Result<ID3D12Device> {
        unsafe {
            let mut index = 0u32;
            while let Ok(adapter) = factory.EnumAdapters1(index) {
                let adapter: IDXGIAdapter1 = adapter;
                let desc = adapter.GetDesc1()?;
                let is_software =
                    (DXGI_ADAPTER_FLAG(desc.Flags as i32).0 & DXGI_ADAPTER_FLAG_SOFTWARE.0) != 0;
                if !is_software {
                    let mut device: Option<ID3D12Device> = None;
                    if D3D12CreateDevice(&adapter, D3D_FEATURE_LEVEL_11_0, &mut device).is_ok() {
                        if let Some(device) = device {
                            return Ok(device);
                        }
                    }
                }
                index += 1;
            }
            let mut device: Option<ID3D12Device> = None;
            let _ = D3D_DRIVER_TYPE_HARDWARE;
            D3D12CreateDevice(None, D3D_FEATURE_LEVEL_11_0, &mut device)?;
            device.ok_or_else(windows_core::Error::from_thread)
        }
    }

    struct Renderer {
        device: ID3D12Device,
        queue: ID3D12CommandQueue,
        swap_chain: IDXGISwapChain3,
        rtv_heap: ID3D12DescriptorHeap,
        rtv_descriptor_size: usize,
        render_targets: Vec<ID3D12Resource>,
        allocators: Vec<ID3D12CommandAllocator>,
        list: ID3D12GraphicsCommandList,
        fence: ID3D12Fence,
        fence_event: HANDLE,
        fence_value: u64,
        frame_fence_values: Vec<u64>,
        width: u32,
        height: u32,
        format: PresentFormat,
    }

    impl Renderer {
        unsafe fn new(
            hwnd: HWND,
            width: u32,
            height: u32,
            backbuffers: u32,
            format: PresentFormat,
        ) -> Result<Self> {
            unsafe {
                let factory: IDXGIFactory4 = CreateDXGIFactory2(DXGI_CREATE_FACTORY_FLAGS(0))?;
                let device = create_device(&factory)?;

                let queue_desc = D3D12_COMMAND_QUEUE_DESC {
                    Type: D3D12_COMMAND_LIST_TYPE_DIRECT,
                    Priority: 0,
                    Flags: D3D12_COMMAND_QUEUE_FLAG_NONE,
                    NodeMask: 0,
                };
                let queue: ID3D12CommandQueue = device.CreateCommandQueue(&queue_desc)?;

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
                    BufferCount: backbuffers,
                    Scaling: DXGI_SCALING_STRETCH,
                    SwapEffect: DXGI_SWAP_EFFECT_FLIP_DISCARD,
                    AlphaMode: DXGI_ALPHA_MODE_IGNORE,
                    Flags: 0,
                };
                let swap_chain1 =
                    factory.CreateSwapChainForHwnd(&queue, hwnd, &desc, None, None)?;
                let swap_chain: IDXGISwapChain3 = swap_chain1.cast()?;

                let rtv_heap_desc = D3D12_DESCRIPTOR_HEAP_DESC {
                    Type: D3D12_DESCRIPTOR_HEAP_TYPE_RTV,
                    NumDescriptors: backbuffers,
                    Flags: D3D12_DESCRIPTOR_HEAP_FLAG_NONE,
                    NodeMask: 0,
                };
                let rtv_heap: ID3D12DescriptorHeap = device.CreateDescriptorHeap(&rtv_heap_desc)?;
                let rtv_descriptor_size = device
                    .GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_RTV)
                    as usize;

                let heap_start = rtv_heap.GetCPUDescriptorHandleForHeapStart();
                let mut render_targets = Vec::with_capacity(backbuffers as usize);
                let mut allocators = Vec::with_capacity(backbuffers as usize);
                for i in 0..backbuffers {
                    let back_buffer: ID3D12Resource = swap_chain.GetBuffer(i)?;
                    let handle = D3D12_CPU_DESCRIPTOR_HANDLE {
                        ptr: heap_start.ptr + i as usize * rtv_descriptor_size,
                    };
                    device.CreateRenderTargetView(&back_buffer, None, handle);
                    render_targets.push(back_buffer);

                    let allocator: ID3D12CommandAllocator =
                        device.CreateCommandAllocator(D3D12_COMMAND_LIST_TYPE_DIRECT)?;
                    allocators.push(allocator);
                }

                let list: ID3D12GraphicsCommandList = device.CreateCommandList(
                    0,
                    D3D12_COMMAND_LIST_TYPE_DIRECT,
                    &allocators[0],
                    None::<&ID3D12PipelineState>,
                )?;
                list.Close()?;

                let fence: ID3D12Fence = device.CreateFence(0, D3D12_FENCE_FLAG_NONE)?;
                let fence_event = CreateEventW(None, false, false, None)?;

                Ok(Self {
                    device,
                    queue,
                    swap_chain,
                    rtv_heap,
                    rtv_descriptor_size,
                    render_targets,
                    frame_fence_values: vec![0; backbuffers as usize],
                    allocators,
                    list,
                    fence,
                    fence_event,
                    fence_value: 0,
                    width,
                    height,
                    format,
                })
            }
        }

        unsafe fn transition(
            resource: &ID3D12Resource,
            before: windows::Win32::Graphics::Direct3D12::D3D12_RESOURCE_STATES,
            after: windows::Win32::Graphics::Direct3D12::D3D12_RESOURCE_STATES,
        ) -> D3D12_RESOURCE_BARRIER {
            D3D12_RESOURCE_BARRIER {
                Type: D3D12_RESOURCE_BARRIER_TYPE_TRANSITION,
                Flags: D3D12_RESOURCE_BARRIER_FLAG_NONE,
                Anonymous: D3D12_RESOURCE_BARRIER_0 {
                    Transition: std::mem::ManuallyDrop::new(D3D12_RESOURCE_TRANSITION_BARRIER {
                        pResource: std::mem::ManuallyDrop::new(Some(resource.clone())),
                        Subresource: D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES,
                        StateBefore: before,
                        StateAfter: after,
                    }),
                },
            }
        }

        unsafe fn render_frame(&mut self, frame_index: u64) -> Result<()> {
            unsafe {
                let buffer_index = self.swap_chain.GetCurrentBackBufferIndex() as usize;

                self.wait_for_fence_value(self.frame_fence_values[buffer_index])?;

                let allocator = &self.allocators[buffer_index];
                let back_buffer = &self.render_targets[buffer_index];
                allocator.Reset()?;
                self.list.Reset(allocator, None::<&ID3D12PipelineState>)?;

                let to_rt = Self::transition(
                    back_buffer,
                    D3D12_RESOURCE_STATE_PRESENT,
                    D3D12_RESOURCE_STATE_RENDER_TARGET,
                );
                self.list.ResourceBarrier(&[to_rt]);

                let rtv = D3D12_CPU_DESCRIPTOR_HANDLE {
                    ptr: self.rtv_heap.GetCPUDescriptorHandleForHeapStart().ptr
                        + buffer_index * self.rtv_descriptor_size,
                };
                self.list.OMSetRenderTargets(1, Some(&rtv), false, None);

                self.paint_pattern(rtv, frame_index);

                let to_present = Self::transition(
                    back_buffer,
                    D3D12_RESOURCE_STATE_RENDER_TARGET,
                    D3D12_RESOURCE_STATE_PRESENT,
                );
                self.list.ResourceBarrier(&[to_present]);

                self.list.Close()?;

                let command_list: windows::Win32::Graphics::Direct3D12::ID3D12CommandList =
                    self.list.cast()?;
                self.queue.ExecuteCommandLists(&[Some(command_list)]);

                self.swap_chain.Present(1, Default::default()).ok()?;

                self.fence_value += 1;
                let signal = self.fence_value;
                self.queue.Signal(&self.fence, signal)?;
                self.frame_fence_values[buffer_index] = signal;

                Ok(())
            }
        }

        unsafe fn paint_pattern(&self, rtv: D3D12_CPU_DESCRIPTOR_HANDLE, frame_index: u64) {
            unsafe {
                let width = self.width.max(1);
                let height = self.height as i32;
                let luma = (frame_index & 0xFF) as u8;

                for bar in 0..pattern::BARS.len() as u32 {
                    let x0 = ((bar as u64 * width as u64) / pattern::BARS.len() as u64) as i32;
                    let x1 =
                        (((bar + 1) as u64 * width as u64) / pattern::BARS.len() as u64) as i32;
                    if x1 <= x0 {
                        continue;
                    }
                    let (r, g, b) = pattern::bar_colour(x0 as u32, width);
                    let colour = rgba(self.format, r, g, b.saturating_add(luma / 4));
                    let rect = RECT {
                        left: x0,
                        top: 0,
                        right: x1,
                        bottom: height,
                    };
                    self.list.ClearRenderTargetView(rtv, &colour, Some(&[rect]));
                }

                let (cr, cg, cb) = pattern::counter_colour(frame_index);
                let block = pattern::COUNTER_BLOCK as i32;
                let counter_rect = RECT {
                    left: 0,
                    top: 0,
                    right: block.min(self.width as i32),
                    bottom: block.min(height),
                };
                let counter_colour = rgba(self.format, cr, cg, cb);
                self.list
                    .ClearRenderTargetView(rtv, &counter_colour, Some(&[counter_rect]));
            }
        }

        unsafe fn wait_for_fence_value(&self, value: u64) -> Result<()> {
            unsafe {
                if value == 0 || self.fence.GetCompletedValue() >= value {
                    return Ok(());
                }
                self.fence.SetEventOnCompletion(value, self.fence_event)?;
                WaitForSingleObject(self.fence_event, INFINITE);
                Ok(())
            }
        }

        unsafe fn flush(&mut self) -> Result<()> {
            unsafe {
                self.fence_value += 1;
                let signal = self.fence_value;
                self.queue.Signal(&self.fence, signal)?;
                self.wait_for_fence_value(signal)
            }
        }
    }

    impl Drop for Renderer {
        fn drop(&mut self) {
            unsafe {
                let _ = self.flush();
                let _ = CloseHandle(self.fence_event);
                let _ = &self.device;
            }
        }
    }

    fn rgba(format: PresentFormat, r: u8, g: u8, b: u8) -> [f32; 4] {
        let highlight =
            if matches!(format, PresentFormat::Rgba16Float) && r == 255 && g == 255 && b > 240 {
                1.25
            } else {
                1.0
            };
        [
            (r as f32 / 255.0) * highlight,
            (g as f32 / 255.0) * highlight,
            (b as f32 / 255.0) * highlight,
            1.0,
        ]
    }

    pub fn run() -> Result<()> {
        let options = Options::from_env();
        unsafe {
            let hwnd = create_window(options.width, options.height, options.borderless)?;

            let mut rect = Default::default();
            let _ = GetClientRect(hwnd, &mut rect);
            let width = ((rect.right - rect.left).max(1)) as u32;
            let height = ((rect.bottom - rect.top).max(1)) as u32;

            let mut renderer =
                Renderer::new(hwnd, width, height, options.backbuffers, options.format)?;

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
