// SPDX-License-Identifier: AGPL-3.0-or-later

#[cfg(not(windows))]
fn main() {
    eprintln!("vulkan-present-fixture is only functional on Windows");
}

#[cfg(windows)]
fn main() {
    if let Err(error) = windows_impl::run() {
        eprintln!("vulkan-present-fixture failed: {error}");
        std::process::exit(1);
    }
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

    pub fn clear_colour(frame_index: u64) -> [f32; 4] {
        let (r, g, b) = BARS[(frame_index % BARS.len() as u64) as usize];
        [r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, 1.0]
    }
}

#[cfg(windows)]
mod cli {
    #[derive(Clone, Copy, PartialEq, Eq)]
    pub enum FormatChoice {
        Bgra,
        Rgba,
    }

    #[derive(Clone, Copy, PartialEq, Eq)]
    pub enum PresentModeChoice {
        Fifo,
        Mailbox,
        Immediate,
    }

    #[derive(Clone, Copy, PartialEq, Eq)]
    pub enum PresentWaitChoice {
        Semaphore,
        None,
    }

    pub struct Options {
        pub frames: Option<u64>,
        pub width: u32,
        pub height: u32,
        pub borderless: bool,
        pub format: FormatChoice,
        pub present_mode: PresentModeChoice,
        pub present_wait: PresentWaitChoice,
        pub resize_at: Option<u64>,
        pub resize_width: Option<u32>,
        pub resize_height: Option<u32>,
    }

    impl Default for Options {
        fn default() -> Self {
            Self {
                frames: None,
                width: 1280,
                height: 720,
                borderless: false,
                format: FormatChoice::Bgra,
                present_mode: PresentModeChoice::Fifo,
                present_wait: PresentWaitChoice::Semaphore,
                resize_at: None,
                resize_width: None,
                resize_height: None,
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
                        if let Some(value) = args.next() {
                            options.format = match value.to_ascii_lowercase().as_str() {
                                "rgba" => FormatChoice::Rgba,
                                _ => FormatChoice::Bgra,
                            };
                        }
                    }
                    "--present-mode" => {
                        if let Some(value) = args.next() {
                            options.present_mode = match value.to_ascii_lowercase().as_str() {
                                "mailbox" => PresentModeChoice::Mailbox,
                                "immediate" => PresentModeChoice::Immediate,
                                _ => PresentModeChoice::Fifo,
                            };
                        }
                    }
                    "--present-wait" => {
                        if let Some(value) = args.next() {
                            options.present_wait = match value.to_ascii_lowercase().as_str() {
                                "none" => PresentWaitChoice::None,
                                _ => PresentWaitChoice::Semaphore,
                            };
                        }
                    }
                    "--resize-at" => {
                        if let Some(value) = args.next().and_then(|v| v.parse().ok()) {
                            options.resize_at = Some(value);
                        }
                    }
                    "--resize-width" => {
                        if let Some(value) = args.next().and_then(|v| v.parse().ok()) {
                            options.resize_width = Some(value);
                        }
                    }
                    "--resize-height" => {
                        if let Some(value) = args.next().and_then(|v| v.parse().ok()) {
                            options.resize_height = Some(value);
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
    use super::cli::{FormatChoice, Options, PresentModeChoice, PresentWaitChoice};
    use super::pattern;
    use ash::{khr, vk};
    use std::error::Error;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, CreateWindowExW, DefWindowProcW, DispatchMessageW,
        GetClientRect, MSG, MoveWindow, PM_REMOVE, PeekMessageW, PostQuitMessage, RegisterClassExW,
        SW_SHOW, ShowWindow, TranslateMessage, WM_DESTROY, WM_QUIT, WNDCLASSEXW,
        WS_OVERLAPPEDWINDOW, WS_POPUP, WS_VISIBLE,
    };
    use windows::core::w;

    type DynError = Box<dyn Error>;

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

    unsafe fn create_window(
        width: u32,
        height: u32,
        borderless: bool,
    ) -> Result<(HWND, isize), DynError> {
        unsafe {
            let instance = GetModuleHandleW(None)?;
            let class_name = w!("FluxerVulkanFixture");
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
                w!("Fluxer Vulkan Present Fixture"),
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
            Ok((hwnd, instance.0 as isize))
        }
    }

    unsafe fn client_extent(hwnd: HWND) -> vk::Extent2D {
        unsafe {
            let mut rect = RECT::default();
            let _ = GetClientRect(hwnd, &mut rect);
            vk::Extent2D {
                width: (rect.right - rect.left).max(1) as u32,
                height: (rect.bottom - rect.top).max(1) as u32,
            }
        }
    }

    unsafe fn resize_window(hwnd: HWND, width: u32, height: u32) {
        unsafe {
            let _ = MoveWindow(hwnd, 0, 0, width as i32, height as i32, true);
        }
    }

    fn pick_surface_format(
        formats: &[vk::SurfaceFormatKHR],
        choice: FormatChoice,
    ) -> Result<vk::SurfaceFormatKHR, DynError> {
        let preferred: [vk::Format; 2] = match choice {
            FormatChoice::Bgra => [vk::Format::B8G8R8A8_UNORM, vk::Format::B8G8R8A8_SRGB],
            FormatChoice::Rgba => [vk::Format::R8G8B8A8_UNORM, vk::Format::R8G8B8A8_SRGB],
        };
        let any_8bit = [
            vk::Format::B8G8R8A8_UNORM,
            vk::Format::R8G8B8A8_UNORM,
            vk::Format::B8G8R8A8_SRGB,
            vk::Format::R8G8B8A8_SRGB,
        ];
        formats
            .iter()
            .copied()
            .find(|f| preferred.contains(&f.format))
            .or_else(|| {
                formats
                    .iter()
                    .copied()
                    .find(|f| any_8bit.contains(&f.format))
            })
            .or_else(|| formats.first().copied())
            .ok_or_else(|| "surface advertised no formats".into())
    }

    fn pick_present_mode(
        available: &[vk::PresentModeKHR],
        choice: PresentModeChoice,
    ) -> vk::PresentModeKHR {
        let wanted = match choice {
            PresentModeChoice::Fifo => vk::PresentModeKHR::FIFO,
            PresentModeChoice::Mailbox => vk::PresentModeKHR::MAILBOX,
            PresentModeChoice::Immediate => vk::PresentModeKHR::IMMEDIATE,
        };
        if available.contains(&wanted) {
            wanted
        } else {
            vk::PresentModeKHR::FIFO
        }
    }

    struct Swapchain {
        handle: vk::SwapchainKHR,
        images: Vec<vk::Image>,
        command_buffers: Vec<vk::CommandBuffer>,
        extent: vk::Extent2D,
        format: vk::Format,
    }

    impl Swapchain {
        #[allow(clippy::too_many_arguments)]
        unsafe fn create(
            device: &ash::Device,
            swapchain_device: &khr::swapchain::Device,
            surface_instance: &khr::surface::Instance,
            physical_device: vk::PhysicalDevice,
            surface: vk::SurfaceKHR,
            command_pool: vk::CommandPool,
            surface_format: vk::SurfaceFormatKHR,
            present_mode: vk::PresentModeKHR,
            requested_extent: vk::Extent2D,
            old: vk::SwapchainKHR,
        ) -> Result<Self, DynError> {
            unsafe {
                let surface_caps = surface_instance
                    .get_physical_device_surface_capabilities(physical_device, surface)?;

                let extent = if surface_caps.current_extent.width != u32::MAX {
                    surface_caps.current_extent
                } else {
                    vk::Extent2D {
                        width: requested_extent.width.clamp(
                            surface_caps.min_image_extent.width,
                            surface_caps.max_image_extent.width,
                        ),
                        height: requested_extent.height.clamp(
                            surface_caps.min_image_extent.height,
                            surface_caps.max_image_extent.height,
                        ),
                    }
                };

                let image_count =
                    surface_caps
                        .min_image_count
                        .max(2)
                        .min(if surface_caps.max_image_count == 0 {
                            u32::MAX
                        } else {
                            surface_caps.max_image_count
                        });

                let swapchain_info = vk::SwapchainCreateInfoKHR::default()
                    .surface(surface)
                    .min_image_count(image_count)
                    .image_format(surface_format.format)
                    .image_color_space(surface_format.color_space)
                    .image_extent(extent)
                    .image_array_layers(1)
                    .image_usage(
                        vk::ImageUsageFlags::COLOR_ATTACHMENT | vk::ImageUsageFlags::TRANSFER_DST,
                    )
                    .image_sharing_mode(vk::SharingMode::EXCLUSIVE)
                    .pre_transform(surface_caps.current_transform)
                    .composite_alpha(vk::CompositeAlphaFlagsKHR::OPAQUE)
                    .present_mode(present_mode)
                    .clipped(true)
                    .old_swapchain(old);
                let handle = swapchain_device.create_swapchain(&swapchain_info, None)?;
                let images = swapchain_device.get_swapchain_images(handle)?;

                let alloc_info = vk::CommandBufferAllocateInfo::default()
                    .command_pool(command_pool)
                    .level(vk::CommandBufferLevel::PRIMARY)
                    .command_buffer_count(images.len() as u32);
                let command_buffers = device.allocate_command_buffers(&alloc_info)?;

                Ok(Self {
                    handle,
                    images,
                    command_buffers,
                    extent,
                    format: surface_format.format,
                })
            }
        }

        unsafe fn destroy(
            self,
            device: &ash::Device,
            swapchain_device: &khr::swapchain::Device,
            command_pool: vk::CommandPool,
        ) {
            unsafe {
                if !self.command_buffers.is_empty() {
                    device.free_command_buffers(command_pool, &self.command_buffers);
                }
                swapchain_device.destroy_swapchain(self.handle, None);
            }
        }
    }

    pub fn run() -> Result<(), DynError> {
        let options = Options::from_env();
        unsafe {
            let (hwnd, hinstance) =
                create_window(options.width, options.height, options.borderless)?;

            println!("HWND={}", hwnd.0 as isize);
            use std::io::Write;
            let _ = std::io::stdout().flush();

            let entry = ash::Entry::load()?;

            let app_name = c"fluxer-vulkan-present-fixture";
            let app_info = vk::ApplicationInfo::default()
                .application_name(app_name)
                .api_version(vk::API_VERSION_1_1);
            let instance_extensions = [
                khr::surface::NAME.as_ptr(),
                khr::win32_surface::NAME.as_ptr(),
            ];
            let instance_info = vk::InstanceCreateInfo::default()
                .application_info(&app_info)
                .enabled_extension_names(&instance_extensions);
            let instance = entry.create_instance(&instance_info, None)?;

            let surface_instance = khr::surface::Instance::new(&entry, &instance);
            let win32_surface = khr::win32_surface::Instance::new(&entry, &instance);

            let surface_info = vk::Win32SurfaceCreateInfoKHR::default()
                .hinstance(hinstance)
                .hwnd(hwnd.0 as isize);
            let surface = win32_surface.create_win32_surface(&surface_info, None)?;

            let physical_devices = instance.enumerate_physical_devices()?;
            let (physical_device, queue_family_index) = physical_devices
                .iter()
                .find_map(|&physical_device| {
                    let families =
                        instance.get_physical_device_queue_family_properties(physical_device);
                    families.iter().enumerate().find_map(|(index, family)| {
                        let index = index as u32;
                        let graphics = family.queue_flags.contains(vk::QueueFlags::GRAPHICS);
                        let present = surface_instance
                            .get_physical_device_surface_support(physical_device, index, surface)
                            .unwrap_or(false);
                        (graphics && present).then_some((physical_device, index))
                    })
                })
                .ok_or("no Vulkan device with a graphics+present queue family")?;

            let queue_priorities = [1.0_f32];
            let queue_info = vk::DeviceQueueCreateInfo::default()
                .queue_family_index(queue_family_index)
                .queue_priorities(&queue_priorities);
            let device_extensions = [khr::swapchain::NAME.as_ptr()];
            let queue_infos = [queue_info];
            let device_info = vk::DeviceCreateInfo::default()
                .queue_create_infos(&queue_infos)
                .enabled_extension_names(&device_extensions);
            let device = instance.create_device(physical_device, &device_info, None)?;
            let queue = device.get_device_queue(queue_family_index, 0);
            let swapchain_device = khr::swapchain::Device::new(&instance, &device);

            let formats =
                surface_instance.get_physical_device_surface_formats(physical_device, surface)?;
            let surface_format = pick_surface_format(&formats, options.format)?;
            let available_present_modes = surface_instance
                .get_physical_device_surface_present_modes(physical_device, surface)?;
            let present_mode = pick_present_mode(&available_present_modes, options.present_mode);
            eprintln!(
                "vulkan-present-fixture: vkFormat={} vkColorSpace={} vkPresentMode={}",
                surface_format.format.as_raw(),
                surface_format.color_space.as_raw(),
                present_mode.as_raw()
            );

            let pool_info = vk::CommandPoolCreateInfo::default()
                .queue_family_index(queue_family_index)
                .flags(vk::CommandPoolCreateFlags::RESET_COMMAND_BUFFER);
            let command_pool = device.create_command_pool(&pool_info, None)?;

            let mut swapchain = Swapchain::create(
                &device,
                &swapchain_device,
                &surface_instance,
                physical_device,
                surface,
                command_pool,
                surface_format,
                present_mode,
                client_extent(hwnd),
                vk::SwapchainKHR::null(),
            )?;

            let image_available =
                device.create_semaphore(&vk::SemaphoreCreateInfo::default(), None)?;
            let render_finished =
                device.create_semaphore(&vk::SemaphoreCreateInfo::default(), None)?;
            let in_flight = device.create_fence(
                &vk::FenceCreateInfo::default().flags(vk::FenceCreateFlags::SIGNALED),
                None,
            )?;

            let subresource_range = vk::ImageSubresourceRange {
                aspect_mask: vk::ImageAspectFlags::COLOR,
                base_mip_level: 0,
                level_count: 1,
                base_array_layer: 0,
                layer_count: 1,
            };

            let recreate_swapchain = |swapchain: &mut Swapchain| -> Result<(), DynError> {
                device.device_wait_idle()?;
                let new = Swapchain::create(
                    &device,
                    &swapchain_device,
                    &surface_instance,
                    physical_device,
                    surface,
                    command_pool,
                    surface_format,
                    present_mode,
                    client_extent(hwnd),
                    swapchain.handle,
                )?;
                eprintln!(
                    "vulkan-present-fixture: swapchain recreated extent={}x{} vkFormat={}",
                    new.extent.width,
                    new.extent.height,
                    new.format.as_raw()
                );
                let old = std::mem::replace(swapchain, new);
                old.destroy(&device, &swapchain_device, command_pool);
                Ok(())
            };

            let mut frame_index: u64 = 0;
            let mut resized = false;
            let mut msg = MSG::default();
            'render: loop {
                while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                    if msg.message == WM_QUIT {
                        break 'render;
                    }
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }

                if let Some(at) = options.resize_at {
                    if !resized && frame_index >= at {
                        if let (Some(width), Some(height)) =
                            (options.resize_width, options.resize_height)
                        {
                            resize_window(hwnd, width, height);
                        }
                        recreate_swapchain(&mut swapchain)?;
                        resized = true;
                    }
                }

                device.wait_for_fences(&[in_flight], true, u64::MAX)?;

                let (image_index, suboptimal) = match swapchain_device.acquire_next_image(
                    swapchain.handle,
                    u64::MAX,
                    image_available,
                    vk::Fence::null(),
                ) {
                    Ok(value) => value,
                    Err(vk::Result::ERROR_OUT_OF_DATE_KHR) => {
                        recreate_swapchain(&mut swapchain)?;
                        continue;
                    }
                    Err(error) => return Err(error.into()),
                };

                device.reset_fences(&[in_flight])?;

                let command_buffer = swapchain.command_buffers[image_index as usize];
                let image = swapchain.images[image_index as usize];
                device
                    .reset_command_buffer(command_buffer, vk::CommandBufferResetFlags::empty())?;
                device.begin_command_buffer(
                    command_buffer,
                    &vk::CommandBufferBeginInfo::default()
                        .flags(vk::CommandBufferUsageFlags::ONE_TIME_SUBMIT),
                )?;

                let to_transfer = vk::ImageMemoryBarrier::default()
                    .src_access_mask(vk::AccessFlags::empty())
                    .dst_access_mask(vk::AccessFlags::TRANSFER_WRITE)
                    .old_layout(vk::ImageLayout::UNDEFINED)
                    .new_layout(vk::ImageLayout::TRANSFER_DST_OPTIMAL)
                    .src_queue_family_index(vk::QUEUE_FAMILY_IGNORED)
                    .dst_queue_family_index(vk::QUEUE_FAMILY_IGNORED)
                    .image(image)
                    .subresource_range(subresource_range);
                device.cmd_pipeline_barrier(
                    command_buffer,
                    vk::PipelineStageFlags::TOP_OF_PIPE,
                    vk::PipelineStageFlags::TRANSFER,
                    vk::DependencyFlags::empty(),
                    &[],
                    &[],
                    &[to_transfer],
                );

                let clear = pattern::clear_colour(frame_index);
                let clear_value = vk::ClearColorValue { float32: clear };
                device.cmd_clear_color_image(
                    command_buffer,
                    image,
                    vk::ImageLayout::TRANSFER_DST_OPTIMAL,
                    &clear_value,
                    &[subresource_range],
                );

                let to_present = vk::ImageMemoryBarrier::default()
                    .src_access_mask(vk::AccessFlags::TRANSFER_WRITE)
                    .dst_access_mask(vk::AccessFlags::empty())
                    .old_layout(vk::ImageLayout::TRANSFER_DST_OPTIMAL)
                    .new_layout(vk::ImageLayout::PRESENT_SRC_KHR)
                    .src_queue_family_index(vk::QUEUE_FAMILY_IGNORED)
                    .dst_queue_family_index(vk::QUEUE_FAMILY_IGNORED)
                    .image(image)
                    .subresource_range(subresource_range);
                device.cmd_pipeline_barrier(
                    command_buffer,
                    vk::PipelineStageFlags::TRANSFER,
                    vk::PipelineStageFlags::BOTTOM_OF_PIPE,
                    vk::DependencyFlags::empty(),
                    &[],
                    &[],
                    &[to_present],
                );
                device.end_command_buffer(command_buffer)?;

                let wait_semaphores = [image_available];
                let wait_stages = [vk::PipelineStageFlags::TRANSFER];
                let command_buffers = [command_buffer];
                let mut submit = vk::SubmitInfo::default()
                    .wait_semaphores(&wait_semaphores)
                    .wait_dst_stage_mask(&wait_stages)
                    .command_buffers(&command_buffers);
                let signal_semaphores = [render_finished];
                if options.present_wait == PresentWaitChoice::Semaphore {
                    submit = submit.signal_semaphores(&signal_semaphores);
                }
                device.queue_submit(queue, &[submit], in_flight)?;

                let swapchains = [swapchain.handle];
                let image_indices = [image_index];
                if options.present_wait == PresentWaitChoice::None {
                    device.wait_for_fences(&[in_flight], true, u64::MAX)?;
                }
                let mut present_info = vk::PresentInfoKHR::default()
                    .swapchains(&swapchains)
                    .image_indices(&image_indices);
                if options.present_wait == PresentWaitChoice::Semaphore {
                    present_info = present_info.wait_semaphores(&signal_semaphores);
                }
                let present_result = swapchain_device.queue_present(queue, &present_info);
                let needs_recreate = match present_result {
                    Ok(present_suboptimal) => present_suboptimal || suboptimal,
                    Err(vk::Result::ERROR_OUT_OF_DATE_KHR) => true,
                    Err(error) => return Err(error.into()),
                };
                if needs_recreate {
                    recreate_swapchain(&mut swapchain)?;
                }

                frame_index += 1;
                if let Some(limit) = options.frames {
                    if frame_index >= limit {
                        break 'render;
                    }
                }
            }

            let _ = device.device_wait_idle();
            device.destroy_fence(in_flight, None);
            device.destroy_semaphore(render_finished, None);
            device.destroy_semaphore(image_available, None);
            swapchain.destroy(&device, &swapchain_device, command_pool);
            device.destroy_command_pool(command_pool, None);
            surface_instance.destroy_surface(surface, None);
            device.destroy_device(None);
            instance.destroy_instance(None);
            Ok(())
        }
    }
}
