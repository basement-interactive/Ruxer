// SPDX-License-Identifier: AGPL-3.0-or-later

#![cfg(target_os = "windows")]
#![allow(non_snake_case)]
#![allow(unsafe_op_in_unsafe_fn)]

#[path = "../../src/game_capture_abi.rs"]
mod game_capture_abi;

mod d3d11_interop;

use ash::{khr, vk};
use ash_layer::{
    LayerFunction, NegotiateLayerInterface, PFN_vk_layerGetPhysicalDeviceProcAddr,
    PFN_vkNegotiateLoaderLayerInterfaceVersion, get_device_chain_info, get_instance_chain_info,
};
use d3d11_interop::{D3d11Device, InteropFormat, SharedTexture, interop_format};
use dashmap::DashMap;
use game_capture_abi::{
    ENV_FORCE_CPU, ENV_FORCE_SHARED_TEXTURE, GAME_CAPTURE_API_VULKAN, GAME_CAPTURE_BUFFER_COUNT,
    GAME_CAPTURE_FALLBACK_EXTERNAL_MEMORY_UNSUPPORTED, GAME_CAPTURE_FALLBACK_FORCED_CPU,
    GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED, GAME_CAPTURE_FALLBACK_NONE, GAME_CAPTURE_FLAG_HDR,
    GAME_CAPTURE_FLAG_TEN_BIT, GAME_CAPTURE_FRAME_PREFIX, GAME_CAPTURE_INFO_PREFIX,
    GAME_CAPTURE_KEEPALIVE_PREFIX, GAME_CAPTURE_MAGIC, GAME_CAPTURE_PRESENT_CLOCK_QPC,
    GAME_CAPTURE_READY_PREFIX, GAME_CAPTURE_STATE_ACTIVE, GAME_CAPTURE_STATE_ERROR,
    GAME_CAPTURE_STATE_RESIZE_REQUIRED, GAME_CAPTURE_STATE_STOPPED, GAME_CAPTURE_STOP_PREFIX,
    GAME_CAPTURE_TRANSPORT_MEMORY, GAME_CAPTURE_TRANSPORT_SHARED_TEXTURE, GameCaptureSharedInfo,
    env_flag_enabled, frame_buffer_size, host_supports_present_clock, mutex_name, object_name,
    qpc_now_us,
};
use once_cell::sync::{Lazy, OnceCell};
use std::{
    ffi::{CStr, c_char},
    mem,
    ptr::{null, null_mut},
    sync::Mutex,
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE, WAIT_ABANDONED, WAIT_OBJECT_0},
    System::{
        Memory::{
            FILE_MAP_ALL_ACCESS, MEMORY_MAPPED_VIEW_ADDRESS, MapViewOfFile, OpenFileMappingW,
            UnmapViewOfFile,
        },
        Threading::{
            EVENT_ALL_ACCESS, MUTEX_ALL_ACCESS, OpenEventW, OpenMutexW, ReleaseMutex,
            SYNCHRONIZATION_SYNCHRONIZE, SetEvent, WaitForSingleObject,
        },
    },
};

const LAYER_NAME: &[u8] = b"VK_LAYER_FLUXER_game_capture\0";
const FRAME_MUTEX_WAIT_MS: u32 = 0;
const CAPTURE_FENCE_TIMEOUT_NS: u64 = 250_000_000;

const DEVICE_EXT_EXTERNAL_MEMORY: &[u8] = b"VK_KHR_external_memory\0";
const DEVICE_EXT_EXTERNAL_MEMORY_WIN32: &[u8] = b"VK_KHR_external_memory_win32\0";
const DEVICE_EXT_DEDICATED_ALLOCATION: &[u8] = b"VK_KHR_dedicated_allocation\0";
const DEVICE_EXT_GET_MEMORY_REQUIREMENTS2: &[u8] = b"VK_KHR_get_memory_requirements2\0";

const INSTANCE_EXT_PHYSICAL_DEVICE_PROPERTIES2: &[u8] = b"VK_KHR_get_physical_device_properties2\0";
const INSTANCE_EXT_EXTERNAL_MEMORY_CAPABILITIES: &[u8] = b"VK_KHR_external_memory_capabilities\0";

const SHARED_HANDLE_TYPE: vk::ExternalMemoryHandleTypeFlags =
    vk::ExternalMemoryHandleTypeFlags::D3D11_TEXTURE_KMT;

static VERBOSE: Lazy<bool> =
    Lazy::new(|| game_capture_abi::env_flag_enabled(game_capture_abi::ENV_VERBOSE));

macro_rules! vlog {
    ($($arg:tt)*) => {
        if *VERBOSE {
            eprintln!("[fluxer-vk-layer] {}", format!($($arg)*));
        }
    };
}

static GIPA: OnceCell<vk::PFN_vkGetInstanceProcAddr> = OnceCell::new();
static GPHYPA: OnceCell<PFN_vk_layerGetPhysicalDeviceProcAddr> = OnceCell::new();
static ENTRY: OnceCell<ash::Entry> = OnceCell::new();

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum CaptureMode {
    Auto,
    ForceCpu,
    ForceSharedTexture,
}

fn capture_mode() -> CaptureMode {
    static MODE: OnceCell<u8> = OnceCell::new();
    let value = *MODE.get_or_init(|| {
        if env_flag_enabled(ENV_FORCE_CPU) {
            0
        } else if env_flag_enabled(ENV_FORCE_SHARED_TEXTURE) {
            2
        } else {
            1
        }
    });
    match value {
        0 => CaptureMode::ForceCpu,
        2 => CaptureMode::ForceSharedTexture,
        _ => CaptureMode::Auto,
    }
}

static INSTANCE_MAP: Lazy<DashMap<vk::Instance, LayerInstance>> = Lazy::new(DashMap::new);
static PHY_TO_INSTANCE_MAP: Lazy<DashMap<vk::PhysicalDevice, vk::Instance>> =
    Lazy::new(DashMap::new);
static GDPA_MAP: Lazy<DashMap<vk::Device, vk::PFN_vkGetDeviceProcAddr>> = Lazy::new(DashMap::new);
static DEVICE_MAP: Lazy<DashMap<vk::Device, LayerDevice>> = Lazy::new(DashMap::new);
static SURFACE_MAP: Lazy<DashMap<vk::SurfaceKHR, SurfaceState>> = Lazy::new(DashMap::new);
static SWAPCHAIN_MAP: Lazy<DashMap<vk::SwapchainKHR, SwapchainState>> = Lazy::new(DashMap::new);
static QUEUE_MAP: Lazy<DashMap<vk::Queue, QueueState>> = Lazy::new(DashMap::new);
static IPC_STATE: Lazy<Mutex<Option<IpcState>>> = Lazy::new(|| Mutex::new(None));
static D3D11_DEVICE: Lazy<Mutex<Option<D3d11Device>>> = Lazy::new(|| Mutex::new(None));
static FAST_PATH_DISABLED: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));

#[derive(Clone)]
struct LayerInstance {
    ash_instance: ash::Instance,
    khr_surface: khr::surface::Instance,
    khr_win32_surface: khr::win32_surface::Instance,
}

#[derive(Clone)]
struct LayerDevice {
    instance: vk::Instance,
    physical_device: vk::PhysicalDevice,
    ash_device: ash::Device,
    khr_swapchain: khr::swapchain::Device,
    queue_families: Vec<vk::QueueFamilyProperties>,
    khr_external_memory_win32: Option<khr::external_memory_win32::Device>,
    external_memory_enabled: bool,
    dedicated_allocation_enabled: bool,
}

#[derive(Clone, Copy)]
struct SurfaceState {
    instance: vk::Instance,
    hwnd: vk::HWND,
}

#[derive(Clone)]
struct SwapchainState {
    device: vk::Device,
    hwnd: vk::HWND,
    extent: vk::Extent2D,
    format: vk::Format,
    images: Vec<vk::Image>,
    can_capture: bool,
    present_layout: vk::ImageLayout,
    shared_texture_allowed: bool,
}

struct QueueState {
    device: vk::Device,
    family_index: u32,
    supports_transfer: bool,
    resources: Mutex<Option<ReadbackResources>>,
    shared: Mutex<Option<SharedTextureResources>>,
}

struct ReadbackResources {
    width: u32,
    height: u32,
    format_mode: FormatMode,
    buffer: vk::Buffer,
    memory: vk::DeviceMemory,
    command_pool: vk::CommandPool,
    command_buffer: vk::CommandBuffer,
    fence: vk::Fence,
    present_wait_semaphore: vk::Semaphore,
    size: vk::DeviceSize,
}

struct SharedTextureResources {
    width: u32,
    height: u32,
    format: InteropFormat,
    shared_texture: SharedTexture,
    image: vk::Image,
    memory: vk::DeviceMemory,
    command_pool: vk::CommandPool,
    command_buffer: vk::CommandBuffer,
    fence: vk::Fence,
    present_wait_semaphore: vk::Semaphore,
    initialised: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum FormatMode {
    Bgra,
    Rgba,
}

struct CaptureSubmit {
    chained_wait: Option<vk::Semaphore>,
}

impl CaptureSubmit {
    fn none() -> Self {
        Self { chained_wait: None }
    }
}

struct IpcState {
    info_map: HANDLE,
    frame_map: HANDLE,
    ready_event: HANDLE,
    stop_event: HANDLE,
    mutexes: [HANDLE; GAME_CAPTURE_BUFFER_COUNT],
    info: *mut GameCaptureSharedInfo,
    frame_base: *mut u8,
    frame_buffer_capacity: usize,
    next_frame_index: usize,
    last_frame_ns: u64,
    keepalive_name: Vec<u16>,
}

unsafe impl Send for IpcState {}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

struct AugmentedExtensions {
    pointers: Vec<*const c_char>,
}

impl AugmentedExtensions {
    unsafe fn build(
        existing: *const *const c_char,
        existing_count: u32,
        extra: &[&'static [u8]],
    ) -> Self {
        let mut pointers: Vec<*const c_char> = Vec::new();
        let mut present: Vec<&CStr> = Vec::new();
        if !existing.is_null() {
            let slice = std::slice::from_raw_parts(existing, existing_count as usize);
            for &ptr in slice {
                pointers.push(ptr);
                if !ptr.is_null() {
                    present.push(CStr::from_ptr(ptr));
                }
            }
        }
        for &name in extra {
            let cstr = CStr::from_bytes_with_nul_unchecked(name);
            if !present.contains(&cstr) {
                pointers.push(cstr.as_ptr());
            }
        }
        Self { pointers }
    }

    fn count(&self) -> u32 {
        self.pointers.len() as u32
    }

    fn as_ptr(&self) -> *const *const c_char {
        self.pointers.as_ptr()
    }
}

unsafe fn extension_in_list(list: *const *const c_char, count: u32, name: &'static [u8]) -> bool {
    if list.is_null() {
        return false;
    }
    let target = CStr::from_bytes_with_nul_unchecked(name);
    std::slice::from_raw_parts(list, count as usize)
        .iter()
        .any(|&ptr| !ptr.is_null() && CStr::from_ptr(ptr) == target)
}

fn current_pid() -> u32 {
    std::process::id()
}

fn now_ns() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as u64)
        .unwrap_or(0)
}

fn now_us() -> i64 {
    (now_ns() / 1_000) as i64
}

unsafe fn close_handle(handle: &mut HANDLE) {
    if !handle.is_null() && *handle != INVALID_HANDLE_VALUE {
        CloseHandle(*handle);
        *handle = null_mut();
    }
}

unsafe fn open_event(prefix: &str, pid: u32) -> HANDLE {
    let name = wide(&object_name(prefix, pid));
    OpenEventW(EVENT_ALL_ACCESS, 0, name.as_ptr())
}

unsafe fn open_mutex(name: &str) -> HANDLE {
    let name = wide(name);
    OpenMutexW(MUTEX_ALL_ACCESS, 0, name.as_ptr())
}

unsafe fn parent_alive(keepalive_name: &[u16]) -> bool {
    let handle = OpenMutexW(SYNCHRONIZATION_SYNCHRONIZE, 0, keepalive_name.as_ptr());
    if handle.is_null() {
        return false;
    }
    CloseHandle(handle);
    true
}

unsafe fn map_view<T>(handle: HANDLE, size: usize) -> *mut T {
    let view = MapViewOfFile(handle, FILE_MAP_ALL_ACCESS, 0, 0, size);
    view.Value.cast()
}

unsafe fn free_ipc_state(state: &mut IpcState) {
    if !state.info.is_null() {
        UnmapViewOfFile(MEMORY_MAPPED_VIEW_ADDRESS {
            Value: state.info.cast(),
        });
        state.info = null_mut();
    }
    if !state.frame_base.is_null() {
        UnmapViewOfFile(MEMORY_MAPPED_VIEW_ADDRESS {
            Value: state.frame_base.cast(),
        });
        state.frame_base = null_mut();
    }
    close_handle(&mut state.mutexes[0]);
    close_handle(&mut state.mutexes[1]);
    close_handle(&mut state.stop_event);
    close_handle(&mut state.ready_event);
    close_handle(&mut state.frame_map);
    close_handle(&mut state.info_map);
}

unsafe fn open_ipc() -> Option<IpcState> {
    let pid = current_pid();
    let info_name = wide(&object_name(GAME_CAPTURE_INFO_PREFIX, pid));
    let frame_name = wide(&object_name(GAME_CAPTURE_FRAME_PREFIX, pid));
    let info_map = OpenFileMappingW(FILE_MAP_ALL_ACCESS, 0, info_name.as_ptr());
    if info_map.is_null() {
        return None;
    }
    let frame_map = OpenFileMappingW(FILE_MAP_ALL_ACCESS, 0, frame_name.as_ptr());
    if frame_map.is_null() {
        let mut handle = info_map;
        close_handle(&mut handle);
        return None;
    }
    let info = map_view::<GameCaptureSharedInfo>(info_map, mem::size_of::<GameCaptureSharedInfo>());
    if info.is_null() || (*info).magic != GAME_CAPTURE_MAGIC {
        let mut info_map = info_map;
        let mut frame_map = frame_map;
        close_handle(&mut frame_map);
        close_handle(&mut info_map);
        return None;
    }
    let frame_buffer_capacity = frame_buffer_size((*info).max_width, (*info).max_height)?;
    let frame_map_size = frame_buffer_capacity.checked_mul(GAME_CAPTURE_BUFFER_COUNT)?;
    let frame_base = map_view::<u8>(frame_map, frame_map_size);
    if frame_base.is_null() {
        let mut info_map = info_map;
        let mut frame_map = frame_map;
        close_handle(&mut frame_map);
        close_handle(&mut info_map);
        return None;
    }

    let ready_event = open_event(GAME_CAPTURE_READY_PREFIX, pid);
    let stop_event = open_event(GAME_CAPTURE_STOP_PREFIX, pid);
    let mutex_names = [mutex_name(pid, 0), mutex_name(pid, 1)];
    let mutexes = [open_mutex(&mutex_names[0]), open_mutex(&mutex_names[1])];
    if ready_event.is_null()
        || stop_event.is_null()
        || mutexes.iter().any(|handle| handle.is_null())
    {
        let mut state = IpcState {
            info_map,
            frame_map,
            ready_event,
            stop_event,
            mutexes,
            info,
            frame_base,
            frame_buffer_capacity,
            next_frame_index: 0,
            last_frame_ns: 0,
            keepalive_name: wide(&object_name(GAME_CAPTURE_KEEPALIVE_PREFIX, pid)),
        };
        free_ipc_state(&mut state);
        return None;
    }

    Some(IpcState {
        info_map,
        frame_map,
        ready_event,
        stop_event,
        mutexes,
        info,
        frame_base,
        frame_buffer_capacity,
        next_frame_index: 0,
        last_frame_ns: 0,
        keepalive_name: wide(&object_name(GAME_CAPTURE_KEEPALIVE_PREFIX, pid)),
    })
}

unsafe fn capture_should_run(state: &mut IpcState) -> bool {
    if WaitForSingleObject(state.stop_event, 0) == WAIT_OBJECT_0 {
        (*state.info).state = GAME_CAPTURE_STATE_STOPPED;
        return false;
    }
    if !parent_alive(&state.keepalive_name) {
        (*state.info).state = GAME_CAPTURE_STATE_STOPPED;
        return false;
    }
    true
}

unsafe fn frame_due(state: &mut IpcState) -> bool {
    let interval = (*state.info).target_frame_interval_ns;
    if interval == 0 {
        return true;
    }
    let now = now_ns();
    if now.saturating_sub(state.last_frame_ns) < interval {
        return false;
    }
    state.last_frame_ns = now;
    true
}

unsafe fn target_matches(state: &IpcState, hwnd: vk::HWND) -> bool {
    let target = (*state.info).hwnd;
    target == 0 || hwnd == 0 || target == hwnd as u64
}

unsafe fn write_rows_to_shared_memory(
    state: &mut IpcState,
    hwnd: vk::HWND,
    width: u32,
    height: u32,
    src_base: *const u8,
    src_row_pitch: usize,
    format_mode: FormatMode,
    fallback_reason: u32,
) -> bool {
    if src_base.is_null() {
        (*state.info).state = GAME_CAPTURE_STATE_ERROR;
        (*state.info).last_error = 60;
        return false;
    }
    let max_width = (*state.info).max_width;
    let max_height = (*state.info).max_height;
    if width == 0 || height == 0 || width > max_width || height > max_height {
        (*state.info).state = GAME_CAPTURE_STATE_RESIZE_REQUIRED;
        (*state.info).width = width;
        (*state.info).height = height;
        return false;
    }
    let Some(bytes) = frame_buffer_size(width, height) else {
        (*state.info).state = GAME_CAPTURE_STATE_ERROR;
        (*state.info).last_error = 61;
        return false;
    };
    if bytes > state.frame_buffer_capacity {
        (*state.info).state = GAME_CAPTURE_STATE_RESIZE_REQUIRED;
        (*state.info).width = width;
        (*state.info).height = height;
        return false;
    }

    let mut index = state.next_frame_index;
    let mut mutex = state.mutexes[index];
    let mut wait = WaitForSingleObject(mutex, FRAME_MUTEX_WAIT_MS);
    if wait != WAIT_OBJECT_0 && wait != WAIT_ABANDONED {
        index = (index + 1) % GAME_CAPTURE_BUFFER_COUNT;
        mutex = state.mutexes[index];
        wait = WaitForSingleObject(mutex, FRAME_MUTEX_WAIT_MS);
    }
    if wait != WAIT_OBJECT_0 && wait != WAIT_ABANDONED {
        return false;
    }

    let row_bytes = (width * 4) as usize;
    let dst_base = state.frame_base.add(state.frame_buffer_capacity * index);
    for y in 0..height as usize {
        let src = src_base.add(y * src_row_pitch);
        let dst = dst_base.add(y * row_bytes);
        match format_mode {
            FormatMode::Bgra => std::ptr::copy_nonoverlapping(src, dst, row_bytes),
            FormatMode::Rgba => {
                for x in 0..width as usize {
                    let src_px = src.add(x * 4);
                    let dst_px = dst.add(x * 4);
                    *dst_px.add(0) = *src_px.add(2);
                    *dst_px.add(1) = *src_px.add(1);
                    *dst_px.add(2) = *src_px.add(0);
                    *dst_px.add(3) = *src_px.add(3);
                }
            }
        }
    }

    let info = &mut *state.info;
    info.hwnd = hwnd as u64;
    info.width = width;
    info.height = height;
    info.pitch = width * 4;
    info.frame_index = index as u32;
    info.frame_counter = info.frame_counter.wrapping_add(1);
    info.timestamp_us = now_us();
    info.transport = GAME_CAPTURE_TRANSPORT_MEMORY;
    info.dxgi_format = 0;
    info.texture_handle = 0;
    info.api_type = GAME_CAPTURE_API_VULKAN;
    info.fallback_reason = fallback_reason;
    info.capture_flags = 0;
    info.state = GAME_CAPTURE_STATE_ACTIVE;
    state.next_frame_index = (index + 1) % GAME_CAPTURE_BUFFER_COUNT;

    ReleaseMutex(mutex);
    SetEvent(state.ready_event);
    true
}

fn format_mode(format: vk::Format) -> Option<FormatMode> {
    match format {
        vk::Format::B8G8R8A8_UNORM | vk::Format::B8G8R8A8_SRGB => Some(FormatMode::Bgra),
        vk::Format::R8G8B8A8_UNORM | vk::Format::R8G8B8A8_SRGB => Some(FormatMode::Rgba),
        _ => None,
    }
}

fn hdr_format_flags(format: vk::Format) -> u32 {
    match format {
        vk::Format::A2B10G10R10_UNORM_PACK32
        | vk::Format::A2R10G10B10_UNORM_PACK32
        | vk::Format::A2B10G10R10_SNORM_PACK32
        | vk::Format::A2R10G10B10_SNORM_PACK32 => GAME_CAPTURE_FLAG_TEN_BIT | GAME_CAPTURE_FLAG_HDR,
        vk::Format::R16G16B16A16_SFLOAT | vk::Format::R16G16B16A16_UNORM => GAME_CAPTURE_FLAG_HDR,
        _ => 0,
    }
}

unsafe fn destroy_shared_texture_resources(
    device: &ash::Device,
    resources: &mut SharedTextureResources,
) {
    let _ = device.wait_for_fences(&[resources.fence], true, CAPTURE_FENCE_TIMEOUT_NS);
    device.destroy_fence(resources.fence, None);
    if resources.present_wait_semaphore != vk::Semaphore::null() {
        device.destroy_semaphore(resources.present_wait_semaphore, None);
        resources.present_wait_semaphore = vk::Semaphore::null();
    }
    device.destroy_command_pool(resources.command_pool, None);
    device.destroy_image(resources.image, None);
    device.free_memory(resources.memory, None);
    resources.fence = vk::Fence::null();
    resources.command_pool = vk::CommandPool::null();
    resources.image = vk::Image::null();
    resources.memory = vk::DeviceMemory::null();
}

unsafe fn query_external_image_support(
    instance: &ash::Instance,
    physical_device: vk::PhysicalDevice,
    format: vk::Format,
) -> Result<bool, vk::Result> {
    let mut external_info =
        vk::PhysicalDeviceExternalImageFormatInfo::default().handle_type(SHARED_HANDLE_TYPE);
    let format_info = vk::PhysicalDeviceImageFormatInfo2::default()
        .format(format)
        .ty(vk::ImageType::TYPE_2D)
        .tiling(vk::ImageTiling::OPTIMAL)
        .usage(vk::ImageUsageFlags::TRANSFER_DST)
        .flags(vk::ImageCreateFlags::empty())
        .push_next(&mut external_info);
    let mut external_props = vk::ExternalImageFormatProperties::default();
    let mut props = vk::ImageFormatProperties2::default().push_next(&mut external_props);
    instance.get_physical_device_image_format_properties2(
        physical_device,
        &format_info,
        &mut props,
    )?;

    let features = external_props
        .external_memory_properties
        .external_memory_features;
    if !features.contains(vk::ExternalMemoryFeatureFlags::IMPORTABLE) {
        return Err(vk::Result::ERROR_FORMAT_NOT_SUPPORTED);
    }
    Ok(features.contains(vk::ExternalMemoryFeatureFlags::DEDICATED_ONLY))
}

unsafe fn create_shared_texture_resources(
    device_state: &LayerDevice,
    queue_family_index: u32,
    width: u32,
    height: u32,
    format: InteropFormat,
) -> Result<SharedTextureResources, vk::Result> {
    if !device_state.external_memory_enabled || device_state.khr_external_memory_win32.is_none() {
        return Err(vk::Result::ERROR_EXTENSION_NOT_PRESENT);
    }
    let device = &device_state.ash_device;
    let Some(instance_state) = INSTANCE_MAP.get(&device_state.instance) else {
        return Err(vk::Result::ERROR_INITIALIZATION_FAILED);
    };
    let instance = instance_state.ash_instance.clone();
    drop(instance_state);

    let dedicated_required = match query_external_image_support(
        &instance,
        device_state.physical_device,
        format.vk_format,
    ) {
        Ok(v) => {
            vlog!("step query_external_image_support OK (dedicated_required={v})");
            v
        }
        Err(e) => {
            vlog!(
                "step query_external_image_support advisory-fail {e:?} (handle_type=D3D11_TEXTURE_KMT, format={:?}); attempting import anyway",
                format.vk_format
            );
            true
        }
    };

    let shared_texture = {
        let mut guard = D3D11_DEVICE
            .lock()
            .map_err(|_| vk::Result::ERROR_INITIALIZATION_FAILED)?;
        if guard.is_none() {
            *guard = D3d11Device::create();
        }
        let d3d11 = guard
            .as_ref()
            .ok_or(vk::Result::ERROR_INITIALIZATION_FAILED)?;
        match d3d11.create_shared_texture(width, height, format) {
            Some(tex) => {
                vlog!("step create_shared_texture OK (handle={:#x})", tex.handle);
                tex
            }
            None => {
                vlog!("step create_shared_texture FAILED (D3D11 CreateTexture2D/GetSharedHandle)");
                return Err(vk::Result::ERROR_OUT_OF_DEVICE_MEMORY);
            }
        }
    };

    let mut external_image_info =
        vk::ExternalMemoryImageCreateInfo::default().handle_types(SHARED_HANDLE_TYPE);
    let image_info = vk::ImageCreateInfo {
        image_type: vk::ImageType::TYPE_2D,
        format: format.vk_format,
        extent: vk::Extent3D {
            width,
            height,
            depth: 1,
        },
        mip_levels: 1,
        array_layers: 1,
        samples: vk::SampleCountFlags::TYPE_1,
        tiling: vk::ImageTiling::OPTIMAL,
        usage: vk::ImageUsageFlags::TRANSFER_DST,
        sharing_mode: vk::SharingMode::EXCLUSIVE,
        initial_layout: vk::ImageLayout::UNDEFINED,
        ..Default::default()
    }
    .push_next(&mut external_image_info);
    let image = match device.create_image(&image_info, None) {
        Ok(image) => image,
        Err(e) => {
            vlog!("step create_image (external) FAILED {e:?}");
            return Err(e);
        }
    };

    let cleanup_image = |device: &ash::Device, image: vk::Image, shared: SharedTexture| {
        device.destroy_image(image, None);
        drop(shared);
    };

    let requirements = device.get_image_memory_requirements(image);
    let Some(instance_state) = INSTANCE_MAP.get(&device_state.instance) else {
        cleanup_image(device, image, shared_texture);
        return Err(vk::Result::ERROR_INITIALIZATION_FAILED);
    };
    let memory_properties = instance_state
        .ash_instance
        .get_physical_device_memory_properties(device_state.physical_device);
    drop(instance_state);
    let Some(memory_type_index) = find_memory_type(
        &memory_properties,
        requirements.memory_type_bits,
        vk::MemoryPropertyFlags::DEVICE_LOCAL,
    )
    .or_else(|| {
        find_memory_type(
            &memory_properties,
            requirements.memory_type_bits,
            vk::MemoryPropertyFlags::empty(),
        )
    }) else {
        cleanup_image(device, image, shared_texture);
        return Err(vk::Result::ERROR_FEATURE_NOT_PRESENT);
    };

    let want_dedicated = dedicated_required || device_state.dedicated_allocation_enabled;
    let mut dedicated_info = vk::MemoryDedicatedAllocateInfo::default().image(image);
    let mut import_info = vk::ImportMemoryWin32HandleInfoKHR {
        handle_type: SHARED_HANDLE_TYPE,
        handle: shared_texture.handle as usize as vk::HANDLE,
        ..Default::default()
    };
    let mut allocate_info = vk::MemoryAllocateInfo {
        allocation_size: requirements.size,
        memory_type_index,
        ..Default::default()
    }
    .push_next(&mut import_info);
    if want_dedicated {
        allocate_info = allocate_info.push_next(&mut dedicated_info);
    }
    let memory = match device.allocate_memory(&allocate_info, None) {
        Ok(memory) => memory,
        Err(error) => {
            vlog!(
                "step allocate_memory (import KMT handle) FAILED {error:?} (want_dedicated={want_dedicated}, mem_type={memory_type_index})"
            );
            cleanup_image(device, image, shared_texture);
            return Err(error);
        }
    };
    if let Err(error) = device.bind_image_memory(image, memory, 0) {
        vlog!("step bind_image_memory FAILED {error:?}");
        device.free_memory(memory, None);
        cleanup_image(device, image, shared_texture);
        return Err(error);
    }
    vlog!("shared-texture resources created OK (fast path live)");

    let pool_info = vk::CommandPoolCreateInfo {
        flags: vk::CommandPoolCreateFlags::RESET_COMMAND_BUFFER,
        queue_family_index,
        ..Default::default()
    };
    let command_pool = match device.create_command_pool(&pool_info, None) {
        Ok(pool) => pool,
        Err(error) => {
            device.free_memory(memory, None);
            cleanup_image(device, image, shared_texture);
            return Err(error);
        }
    };
    let alloc_info = vk::CommandBufferAllocateInfo {
        command_pool,
        level: vk::CommandBufferLevel::PRIMARY,
        command_buffer_count: 1,
        ..Default::default()
    };
    let command_buffer = match device.allocate_command_buffers(&alloc_info) {
        Ok(mut buffers) => buffers.remove(0),
        Err(error) => {
            device.destroy_command_pool(command_pool, None);
            device.free_memory(memory, None);
            cleanup_image(device, image, shared_texture);
            return Err(error);
        }
    };
    let fence = match device.create_fence(&vk::FenceCreateInfo::default(), None) {
        Ok(fence) => fence,
        Err(error) => {
            device.destroy_command_pool(command_pool, None);
            device.free_memory(memory, None);
            cleanup_image(device, image, shared_texture);
            return Err(error);
        }
    };
    let present_wait_semaphore =
        match device.create_semaphore(&vk::SemaphoreCreateInfo::default(), None) {
            Ok(semaphore) => semaphore,
            Err(error) => {
                device.destroy_fence(fence, None);
                device.destroy_command_pool(command_pool, None);
                device.free_memory(memory, None);
                cleanup_image(device, image, shared_texture);
                return Err(error);
            }
        };

    Ok(SharedTextureResources {
        width,
        height,
        format,
        shared_texture,
        image,
        memory,
        command_pool,
        command_buffer,
        fence,
        present_wait_semaphore,
        initialised: false,
    })
}

unsafe fn ensure_shared_texture_resources<'a>(
    device_state: &LayerDevice,
    queue_state: &'a QueueState,
    width: u32,
    height: u32,
    format: InteropFormat,
) -> Result<std::sync::MutexGuard<'a, Option<SharedTextureResources>>, vk::Result> {
    let mut guard = queue_state
        .shared
        .lock()
        .map_err(|_| vk::Result::ERROR_INITIALIZATION_FAILED)?;
    let recreate = guard
        .as_ref()
        .map(|resources| {
            resources.width != width
                || resources.height != height
                || resources.format.vk_format != format.vk_format
        })
        .unwrap_or(true);
    if recreate {
        if let Some(mut old) = guard.take() {
            destroy_shared_texture_resources(&device_state.ash_device, &mut old);
        }
        *guard = Some(create_shared_texture_resources(
            device_state,
            queue_state.family_index,
            width,
            height,
            format,
        )?);
    }
    Ok(guard)
}

unsafe fn capture_swapchain_image_shared(
    device_state: &LayerDevice,
    queue_state: &QueueState,
    queue: vk::Queue,
    swapchain: &SwapchainState,
    image_index: u32,
    present_info: &vk::PresentInfoKHR,
    ipc: &mut IpcState,
) -> Result<CaptureSubmit, vk::Result> {
    if !swapchain.can_capture || !queue_state.supports_transfer {
        return Err(vk::Result::ERROR_FEATURE_NOT_PRESENT);
    }
    if !device_state.external_memory_enabled {
        return Err(vk::Result::ERROR_EXTENSION_NOT_PRESENT);
    }
    let Some(format) = interop_format(swapchain.format) else {
        return Err(vk::Result::ERROR_FORMAT_NOT_SUPPORTED);
    };
    let Some(&image) = swapchain.images.get(image_index as usize) else {
        return Err(vk::Result::ERROR_OUT_OF_DATE_KHR);
    };
    let width = swapchain.extent.width;
    let height = swapchain.extent.height;
    if width == 0 || height == 0 {
        return Err(vk::Result::ERROR_OUT_OF_DATE_KHR);
    }

    let mut resources_guard =
        ensure_shared_texture_resources(device_state, queue_state, width, height, format)?;
    let resources = resources_guard
        .as_mut()
        .ok_or(vk::Result::ERROR_INITIALIZATION_FAILED)?;
    let device = &device_state.ash_device;
    let dst_image = resources.image;
    let shared_handle = resources.shared_texture.handle;

    device.reset_fences(&[resources.fence])?;
    device.reset_command_pool(resources.command_pool, vk::CommandPoolResetFlags::empty())?;
    let begin_info = vk::CommandBufferBeginInfo {
        flags: vk::CommandBufferUsageFlags::ONE_TIME_SUBMIT,
        ..Default::default()
    };
    device.begin_command_buffer(resources.command_buffer, &begin_info)?;

    let range = vk::ImageSubresourceRange {
        aspect_mask: vk::ImageAspectFlags::COLOR,
        base_mip_level: 0,
        level_count: 1,
        base_array_layer: 0,
        layer_count: 1,
    };

    let present_layout = swapchain.present_layout;
    let shared_present = present_layout == vk::ImageLayout::SHARED_PRESENT_KHR;
    let src_copy_layout = if shared_present {
        vk::ImageLayout::SHARED_PRESENT_KHR
    } else {
        vk::ImageLayout::TRANSFER_SRC_OPTIMAL
    };
    let mut pre_barriers: Vec<vk::ImageMemoryBarrier> = Vec::with_capacity(2);
    if !shared_present {
        pre_barriers.push(vk::ImageMemoryBarrier {
            src_access_mask: vk::AccessFlags::MEMORY_READ,
            dst_access_mask: vk::AccessFlags::TRANSFER_READ,
            old_layout: present_layout,
            new_layout: vk::ImageLayout::TRANSFER_SRC_OPTIMAL,
            src_queue_family_index: vk::QUEUE_FAMILY_IGNORED,
            dst_queue_family_index: vk::QUEUE_FAMILY_IGNORED,
            image,
            subresource_range: range,
            ..Default::default()
        });
    }
    let dst_old_layout = if resources.initialised {
        vk::ImageLayout::GENERAL
    } else {
        vk::ImageLayout::UNDEFINED
    };
    let (dst_pre_src_queue_family, dst_pre_dst_queue_family) =
        shared_texture_dst_pre_queue_families(resources.initialised, queue_state.family_index);
    pre_barriers.push(vk::ImageMemoryBarrier {
        src_access_mask: vk::AccessFlags::empty(),
        dst_access_mask: vk::AccessFlags::TRANSFER_WRITE,
        old_layout: dst_old_layout,
        new_layout: vk::ImageLayout::TRANSFER_DST_OPTIMAL,
        src_queue_family_index: dst_pre_src_queue_family,
        dst_queue_family_index: dst_pre_dst_queue_family,
        image: dst_image,
        subresource_range: range,
        ..Default::default()
    });
    device.cmd_pipeline_barrier(
        resources.command_buffer,
        vk::PipelineStageFlags::BOTTOM_OF_PIPE,
        vk::PipelineStageFlags::TRANSFER,
        vk::DependencyFlags::empty(),
        &[],
        &[],
        &pre_barriers,
    );

    let copy = vk::ImageCopy {
        src_subresource: vk::ImageSubresourceLayers {
            aspect_mask: vk::ImageAspectFlags::COLOR,
            mip_level: 0,
            base_array_layer: 0,
            layer_count: 1,
        },
        src_offset: vk::Offset3D { x: 0, y: 0, z: 0 },
        dst_subresource: vk::ImageSubresourceLayers {
            aspect_mask: vk::ImageAspectFlags::COLOR,
            mip_level: 0,
            base_array_layer: 0,
            layer_count: 1,
        },
        dst_offset: vk::Offset3D { x: 0, y: 0, z: 0 },
        extent: vk::Extent3D {
            width,
            height,
            depth: 1,
        },
    };
    device.cmd_copy_image(
        resources.command_buffer,
        image,
        src_copy_layout,
        dst_image,
        vk::ImageLayout::TRANSFER_DST_OPTIMAL,
        &[copy],
    );

    let mut post_barriers: Vec<vk::ImageMemoryBarrier> = Vec::with_capacity(2);
    if !shared_present {
        post_barriers.push(vk::ImageMemoryBarrier {
            src_access_mask: vk::AccessFlags::TRANSFER_READ,
            dst_access_mask: vk::AccessFlags::MEMORY_READ,
            old_layout: vk::ImageLayout::TRANSFER_SRC_OPTIMAL,
            new_layout: present_layout,
            src_queue_family_index: vk::QUEUE_FAMILY_IGNORED,
            dst_queue_family_index: vk::QUEUE_FAMILY_IGNORED,
            image,
            subresource_range: range,
            ..Default::default()
        });
    }
    post_barriers.push(vk::ImageMemoryBarrier {
        src_access_mask: vk::AccessFlags::TRANSFER_WRITE,
        dst_access_mask: vk::AccessFlags::empty(),
        old_layout: vk::ImageLayout::TRANSFER_DST_OPTIMAL,
        new_layout: vk::ImageLayout::GENERAL,
        src_queue_family_index: queue_state.family_index,
        dst_queue_family_index: vk::QUEUE_FAMILY_EXTERNAL,
        image: dst_image,
        subresource_range: range,
        ..Default::default()
    });
    device.cmd_pipeline_barrier(
        resources.command_buffer,
        vk::PipelineStageFlags::TRANSFER,
        vk::PipelineStageFlags::BOTTOM_OF_PIPE,
        vk::DependencyFlags::empty(),
        &[],
        &[],
        &post_barriers,
    );
    device.end_command_buffer(resources.command_buffer)?;

    let chained_wait = submit_capture(
        device,
        queue,
        resources.command_buffer,
        resources.fence,
        resources.present_wait_semaphore,
        present_info,
    )?;
    resources.initialised = true;

    if device
        .wait_for_fences(&[resources.fence], true, CAPTURE_FENCE_TIMEOUT_NS)
        .is_err()
    {
        (*ipc.info).dropped_frame_counter = (*ipc.info).dropped_frame_counter.wrapping_add(1);
        return Ok(CaptureSubmit { chained_wait });
    }

    publish_shared_texture(ipc, swapchain.hwnd, width, height, format, shared_handle);
    Ok(CaptureSubmit { chained_wait })
}

fn shared_texture_dst_pre_queue_families(initialised: bool, queue_family_index: u32) -> (u32, u32) {
    if initialised {
        (vk::QUEUE_FAMILY_EXTERNAL, queue_family_index)
    } else {
        (vk::QUEUE_FAMILY_IGNORED, vk::QUEUE_FAMILY_IGNORED)
    }
}

unsafe fn submit_capture(
    device: &ash::Device,
    queue: vk::Queue,
    command_buffer: vk::CommandBuffer,
    fence: vk::Fence,
    signal_semaphore: vk::Semaphore,
    present_info: &vk::PresentInfoKHR,
) -> Result<Option<vk::Semaphore>, vk::Result> {
    let wait_semaphores = present_wait_semaphores(present_info);
    let wait_stages = vec![vk::PipelineStageFlags::TRANSFER; wait_semaphores.len()];
    let chain = !wait_semaphores.is_empty();
    let signal = if chain {
        [signal_semaphore]
    } else {
        [vk::Semaphore::null(); 1]
    };
    let submit = vk::SubmitInfo {
        wait_semaphore_count: wait_semaphores.len() as u32,
        p_wait_semaphores: wait_semaphores.as_ptr(),
        p_wait_dst_stage_mask: wait_stages.as_ptr(),
        command_buffer_count: 1,
        p_command_buffers: &command_buffer,
        signal_semaphore_count: if chain { 1 } else { 0 },
        p_signal_semaphores: if chain { signal.as_ptr() } else { null() },
        ..Default::default()
    };
    device.queue_submit(queue, &[submit], fence)?;
    Ok(chain.then_some(signal_semaphore))
}

unsafe fn present_wait_semaphores<'a>(
    present_info: &vk::PresentInfoKHR<'a>,
) -> &'a [vk::Semaphore] {
    if present_info.wait_semaphore_count > 0 && !present_info.p_wait_semaphores.is_null() {
        std::slice::from_raw_parts(
            present_info.p_wait_semaphores,
            present_info.wait_semaphore_count as usize,
        )
    } else {
        &[]
    }
}

unsafe fn publish_shared_texture(
    state: &mut IpcState,
    hwnd: vk::HWND,
    width: u32,
    height: u32,
    format: InteropFormat,
    shared_handle: u64,
) {
    let info = &mut *state.info;
    info.hwnd = hwnd as u64;
    info.width = width;
    info.height = height;
    info.pitch = width * 4;
    info.frame_index = 0;
    info.frame_counter = info.frame_counter.wrapping_add(1);
    info.timestamp_us = now_us();
    info.transport = GAME_CAPTURE_TRANSPORT_SHARED_TEXTURE;
    info.dxgi_format = format.dxgi_format.0 as u32;
    info.texture_handle = shared_handle;
    info.api_type = GAME_CAPTURE_API_VULKAN;
    info.fallback_reason = GAME_CAPTURE_FALLBACK_NONE;
    info.capture_flags = format.capture_flags;
    info.state = GAME_CAPTURE_STATE_ACTIVE;
    SetEvent(state.ready_event);
}

unsafe fn destroy_readback_resources(device: &ash::Device, resources: &mut ReadbackResources) {
    let _ = device.wait_for_fences(&[resources.fence], true, CAPTURE_FENCE_TIMEOUT_NS);
    device.destroy_fence(resources.fence, None);
    if resources.present_wait_semaphore != vk::Semaphore::null() {
        device.destroy_semaphore(resources.present_wait_semaphore, None);
        resources.present_wait_semaphore = vk::Semaphore::null();
    }
    device.destroy_command_pool(resources.command_pool, None);
    device.destroy_buffer(resources.buffer, None);
    device.free_memory(resources.memory, None);
    resources.fence = vk::Fence::null();
    resources.command_pool = vk::CommandPool::null();
    resources.buffer = vk::Buffer::null();
    resources.memory = vk::DeviceMemory::null();
}

fn find_memory_type(
    properties: &vk::PhysicalDeviceMemoryProperties,
    type_bits: u32,
    required: vk::MemoryPropertyFlags,
) -> Option<u32> {
    for index in 0..properties.memory_type_count {
        let supported = (type_bits & (1 << index)) != 0;
        let flags = properties.memory_types[index as usize].property_flags;
        if supported && flags.contains(required) {
            return Some(index);
        }
    }
    None
}

unsafe fn create_readback_resources(
    device_state: &LayerDevice,
    queue_family_index: u32,
    width: u32,
    height: u32,
    format_mode: FormatMode,
) -> Result<ReadbackResources, vk::Result> {
    let device = &device_state.ash_device;
    let size = (width as vk::DeviceSize)
        .checked_mul(height as vk::DeviceSize)
        .and_then(|value| value.checked_mul(4))
        .ok_or(vk::Result::ERROR_OUT_OF_HOST_MEMORY)?;
    let buffer_info = vk::BufferCreateInfo {
        size,
        usage: vk::BufferUsageFlags::TRANSFER_DST,
        sharing_mode: vk::SharingMode::EXCLUSIVE,
        ..Default::default()
    };
    let buffer = device.create_buffer(&buffer_info, None)?;
    let requirements = device.get_buffer_memory_requirements(buffer);
    let Some(instance_state) = INSTANCE_MAP.get(&device_state.instance) else {
        device.destroy_buffer(buffer, None);
        return Err(vk::Result::ERROR_INITIALIZATION_FAILED);
    };
    let memory_properties = instance_state
        .ash_instance
        .get_physical_device_memory_properties(device_state.physical_device);
    let memory_type_index = match find_memory_type(
        &memory_properties,
        requirements.memory_type_bits,
        vk::MemoryPropertyFlags::HOST_VISIBLE | vk::MemoryPropertyFlags::HOST_COHERENT,
    ) {
        Some(index) => index,
        None => {
            device.destroy_buffer(buffer, None);
            return Err(vk::Result::ERROR_FEATURE_NOT_PRESENT);
        }
    };
    let allocate_info = vk::MemoryAllocateInfo {
        allocation_size: requirements.size,
        memory_type_index,
        ..Default::default()
    };
    let memory = match device.allocate_memory(&allocate_info, None) {
        Ok(memory) => memory,
        Err(error) => {
            device.destroy_buffer(buffer, None);
            return Err(error);
        }
    };
    if let Err(error) = device.bind_buffer_memory(buffer, memory, 0) {
        device.free_memory(memory, None);
        device.destroy_buffer(buffer, None);
        return Err(error);
    }

    let pool_info = vk::CommandPoolCreateInfo {
        flags: vk::CommandPoolCreateFlags::RESET_COMMAND_BUFFER,
        queue_family_index,
        ..Default::default()
    };
    let command_pool = match device.create_command_pool(&pool_info, None) {
        Ok(pool) => pool,
        Err(error) => {
            device.free_memory(memory, None);
            device.destroy_buffer(buffer, None);
            return Err(error);
        }
    };
    let alloc_info = vk::CommandBufferAllocateInfo {
        command_pool,
        level: vk::CommandBufferLevel::PRIMARY,
        command_buffer_count: 1,
        ..Default::default()
    };
    let command_buffer = match device.allocate_command_buffers(&alloc_info) {
        Ok(mut buffers) => buffers.remove(0),
        Err(error) => {
            device.destroy_command_pool(command_pool, None);
            device.free_memory(memory, None);
            device.destroy_buffer(buffer, None);
            return Err(error);
        }
    };
    let fence = match device.create_fence(&vk::FenceCreateInfo::default(), None) {
        Ok(fence) => fence,
        Err(error) => {
            device.destroy_command_pool(command_pool, None);
            device.free_memory(memory, None);
            device.destroy_buffer(buffer, None);
            return Err(error);
        }
    };
    let present_wait_semaphore =
        match device.create_semaphore(&vk::SemaphoreCreateInfo::default(), None) {
            Ok(semaphore) => semaphore,
            Err(error) => {
                device.destroy_fence(fence, None);
                device.destroy_command_pool(command_pool, None);
                device.free_memory(memory, None);
                device.destroy_buffer(buffer, None);
                return Err(error);
            }
        };

    Ok(ReadbackResources {
        width,
        height,
        format_mode,
        buffer,
        memory,
        command_pool,
        command_buffer,
        fence,
        present_wait_semaphore,
        size,
    })
}

unsafe fn ensure_readback_resources<'a>(
    device_state: &LayerDevice,
    queue_state: &'a QueueState,
    width: u32,
    height: u32,
    format_mode: FormatMode,
) -> Result<std::sync::MutexGuard<'a, Option<ReadbackResources>>, vk::Result> {
    let mut guard = queue_state
        .resources
        .lock()
        .map_err(|_| vk::Result::ERROR_INITIALIZATION_FAILED)?;
    let recreate = guard
        .as_ref()
        .map(|resources| {
            resources.width != width
                || resources.height != height
                || resources.format_mode != format_mode
        })
        .unwrap_or(true);
    if recreate {
        if let Some(mut old) = guard.take() {
            destroy_readback_resources(&device_state.ash_device, &mut old);
        }
        *guard = Some(create_readback_resources(
            device_state,
            queue_state.family_index,
            width,
            height,
            format_mode,
        )?);
    }
    Ok(guard)
}

unsafe fn capture_swapchain_image(
    device_state: &LayerDevice,
    queue_state: &QueueState,
    queue: vk::Queue,
    swapchain: &SwapchainState,
    image_index: u32,
    present_info: &vk::PresentInfoKHR,
    ipc: &mut IpcState,
    fallback_reason: u32,
) -> Result<CaptureSubmit, vk::Result> {
    if !swapchain.can_capture || !queue_state.supports_transfer {
        return Err(vk::Result::ERROR_FEATURE_NOT_PRESENT);
    }
    let Some(format_mode) = format_mode(swapchain.format) else {
        return Err(vk::Result::ERROR_FORMAT_NOT_SUPPORTED);
    };
    let Some(&image) = swapchain.images.get(image_index as usize) else {
        return Err(vk::Result::ERROR_OUT_OF_DATE_KHR);
    };
    let width = swapchain.extent.width;
    let height = swapchain.extent.height;
    if width == 0 || height == 0 {
        return Err(vk::Result::ERROR_OUT_OF_DATE_KHR);
    }

    let mut resources_guard =
        ensure_readback_resources(device_state, queue_state, width, height, format_mode)?;
    let resources = resources_guard
        .as_mut()
        .ok_or(vk::Result::ERROR_INITIALIZATION_FAILED)?;
    let device = &device_state.ash_device;

    device.reset_fences(&[resources.fence])?;
    device.reset_command_pool(resources.command_pool, vk::CommandPoolResetFlags::empty())?;
    let begin_info = vk::CommandBufferBeginInfo {
        flags: vk::CommandBufferUsageFlags::ONE_TIME_SUBMIT,
        ..Default::default()
    };
    device.begin_command_buffer(resources.command_buffer, &begin_info)?;

    let range = vk::ImageSubresourceRange {
        aspect_mask: vk::ImageAspectFlags::COLOR,
        base_mip_level: 0,
        level_count: 1,
        base_array_layer: 0,
        layer_count: 1,
    };
    let present_layout = swapchain.present_layout;
    let shared_present = present_layout == vk::ImageLayout::SHARED_PRESENT_KHR;
    let src_copy_layout = if shared_present {
        vk::ImageLayout::SHARED_PRESENT_KHR
    } else {
        vk::ImageLayout::TRANSFER_SRC_OPTIMAL
    };
    if !shared_present {
        let to_transfer = vk::ImageMemoryBarrier {
            src_access_mask: vk::AccessFlags::MEMORY_READ,
            dst_access_mask: vk::AccessFlags::TRANSFER_READ,
            old_layout: present_layout,
            new_layout: vk::ImageLayout::TRANSFER_SRC_OPTIMAL,
            src_queue_family_index: vk::QUEUE_FAMILY_IGNORED,
            dst_queue_family_index: vk::QUEUE_FAMILY_IGNORED,
            image,
            subresource_range: range,
            ..Default::default()
        };
        device.cmd_pipeline_barrier(
            resources.command_buffer,
            vk::PipelineStageFlags::BOTTOM_OF_PIPE,
            vk::PipelineStageFlags::TRANSFER,
            vk::DependencyFlags::empty(),
            &[],
            &[],
            &[to_transfer],
        );
    }
    let copy = vk::BufferImageCopy {
        buffer_offset: 0,
        buffer_row_length: 0,
        buffer_image_height: 0,
        image_subresource: vk::ImageSubresourceLayers {
            aspect_mask: vk::ImageAspectFlags::COLOR,
            mip_level: 0,
            base_array_layer: 0,
            layer_count: 1,
        },
        image_offset: vk::Offset3D { x: 0, y: 0, z: 0 },
        image_extent: vk::Extent3D {
            width,
            height,
            depth: 1,
        },
    };
    device.cmd_copy_image_to_buffer(
        resources.command_buffer,
        image,
        src_copy_layout,
        resources.buffer,
        &[copy],
    );
    if !shared_present {
        let to_present = vk::ImageMemoryBarrier {
            src_access_mask: vk::AccessFlags::TRANSFER_READ,
            dst_access_mask: vk::AccessFlags::MEMORY_READ,
            old_layout: vk::ImageLayout::TRANSFER_SRC_OPTIMAL,
            new_layout: present_layout,
            src_queue_family_index: vk::QUEUE_FAMILY_IGNORED,
            dst_queue_family_index: vk::QUEUE_FAMILY_IGNORED,
            image,
            subresource_range: range,
            ..Default::default()
        };
        device.cmd_pipeline_barrier(
            resources.command_buffer,
            vk::PipelineStageFlags::TRANSFER,
            vk::PipelineStageFlags::BOTTOM_OF_PIPE,
            vk::DependencyFlags::empty(),
            &[],
            &[],
            &[to_present],
        );
    }
    device.end_command_buffer(resources.command_buffer)?;

    let chained_wait = submit_capture(
        device,
        queue,
        resources.command_buffer,
        resources.fence,
        resources.present_wait_semaphore,
        present_info,
    )?;

    if device
        .wait_for_fences(&[resources.fence], true, CAPTURE_FENCE_TIMEOUT_NS)
        .is_err()
    {
        return Ok(CaptureSubmit { chained_wait });
    }

    let mapped = match device.map_memory(
        resources.memory,
        0,
        resources.size,
        vk::MemoryMapFlags::empty(),
    ) {
        Ok(mapped) => mapped,
        Err(_) => return Ok(CaptureSubmit { chained_wait }),
    };
    let _ = write_rows_to_shared_memory(
        ipc,
        swapchain.hwnd,
        width,
        height,
        mapped.cast(),
        (width * 4) as usize,
        resources.format_mode,
        fallback_reason,
    );
    device.unmap_memory(resources.memory);
    Ok(CaptureSubmit { chained_wait })
}

unsafe fn capture_swapchain_for_present(
    device_state: &LayerDevice,
    queue_state: &QueueState,
    queue: vk::Queue,
    swapchain: &SwapchainState,
    image_index: u32,
    present_info: &vk::PresentInfoKHR,
    ipc: &mut IpcState,
) -> Result<CaptureSubmit, vk::Result> {
    if !target_matches(ipc, swapchain.hwnd) || !frame_due(ipc) {
        return Err(vk::Result::NOT_READY);
    }

    let hdr_flags = hdr_format_flags(swapchain.format);
    let fast_capturable = interop_format(swapchain.format).is_some();
    let cpu_capturable = format_mode(swapchain.format).is_some();

    if !fast_capturable && !cpu_capturable {
        let info = &mut *ipc.info;
        info.api_type = GAME_CAPTURE_API_VULKAN;
        info.capture_flags = hdr_flags;
        info.fallback_reason = GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED;
        info.dropped_frame_counter = info.dropped_frame_counter.wrapping_add(1);
        return Err(vk::Result::ERROR_FORMAT_NOT_SUPPORTED);
    }

    let mode = capture_mode();
    let fast_path_possible = device_state.external_memory_enabled
        && fast_capturable
        && swapchain.shared_texture_allowed
        && !fast_path_permanently_disabled();
    vlog!(
        "present: mode={:?} fast_path_possible={} (ext_enabled={}, interop_format={:?}, shared_allowed={}, perm_disabled={}) swapchain_format={:?}",
        mode,
        fast_path_possible,
        device_state.external_memory_enabled,
        interop_format(swapchain.format).map(|f| f.dxgi_format.0),
        swapchain.shared_texture_allowed,
        fast_path_permanently_disabled(),
        swapchain.format
    );

    if mode != CaptureMode::ForceCpu && fast_path_possible {
        match capture_swapchain_image_shared(
            device_state,
            queue_state,
            queue,
            swapchain,
            image_index,
            present_info,
            ipc,
        ) {
            Ok(result) => return Ok(result),
            Err(error) => {
                vlog!("fast-path shared-texture FAILED: {:?}", error);
                if matches!(
                    error,
                    vk::Result::ERROR_INITIALIZATION_FAILED
                        | vk::Result::ERROR_EXTENSION_NOT_PRESENT
                        | vk::Result::ERROR_OUT_OF_DEVICE_MEMORY
                        | vk::Result::ERROR_FORMAT_NOT_SUPPORTED
                        | vk::Result::ERROR_FEATURE_NOT_PRESENT
                        | vk::Result::ERROR_INVALID_EXTERNAL_HANDLE
                ) {
                    disable_fast_path();
                }
                if mode == CaptureMode::ForceSharedTexture {
                    let info = &mut *ipc.info;
                    info.api_type = GAME_CAPTURE_API_VULKAN;
                    info.fallback_reason = GAME_CAPTURE_FALLBACK_EXTERNAL_MEMORY_UNSUPPORTED;
                    info.state = GAME_CAPTURE_STATE_ERROR;
                    info.last_error = 70;
                    info.dropped_frame_counter = info.dropped_frame_counter.wrapping_add(1);
                    return Err(error);
                }
            }
        }
    } else if mode == CaptureMode::ForceSharedTexture {
        let info = &mut *ipc.info;
        info.api_type = GAME_CAPTURE_API_VULKAN;
        info.fallback_reason = if interop_format(swapchain.format).is_none() {
            GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED
        } else {
            GAME_CAPTURE_FALLBACK_EXTERNAL_MEMORY_UNSUPPORTED
        };
        info.state = GAME_CAPTURE_STATE_ERROR;
        info.last_error = 70;
        info.dropped_frame_counter = info.dropped_frame_counter.wrapping_add(1);
        return Err(vk::Result::ERROR_FEATURE_NOT_PRESENT);
    }

    if !cpu_capturable {
        let info = &mut *ipc.info;
        info.api_type = GAME_CAPTURE_API_VULKAN;
        info.capture_flags = hdr_flags;
        info.fallback_reason = if mode == CaptureMode::ForceCpu {
            GAME_CAPTURE_FALLBACK_FORCED_CPU
        } else {
            GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED
        };
        info.dropped_frame_counter = info.dropped_frame_counter.wrapping_add(1);
        return Err(vk::Result::ERROR_FORMAT_NOT_SUPPORTED);
    }

    let fallback_reason = if mode == CaptureMode::ForceCpu {
        GAME_CAPTURE_FALLBACK_FORCED_CPU
    } else {
        GAME_CAPTURE_FALLBACK_EXTERNAL_MEMORY_UNSUPPORTED
    };
    capture_swapchain_image(
        device_state,
        queue_state,
        queue,
        swapchain,
        image_index,
        present_info,
        ipc,
        fallback_reason,
    )
}

fn fast_path_permanently_disabled() -> bool {
    FAST_PATH_DISABLED
        .lock()
        .map(|guard| *guard)
        .unwrap_or(false)
}

fn disable_fast_path() {
    if let Ok(mut guard) = FAST_PATH_DISABLED.lock() {
        *guard = true;
    }
}

unsafe fn try_capture_present(
    queue: vk::Queue,
    present_info: &vk::PresentInfoKHR,
) -> CaptureSubmit {
    if present_info.swapchain_count == 0
        || present_info.p_swapchains.is_null()
        || present_info.p_image_indices.is_null()
    {
        return CaptureSubmit::none();
    }
    let Some(queue_state_ref) = QUEUE_MAP.get(&queue) else {
        return CaptureSubmit::none();
    };
    let Some(device_state_ref) = DEVICE_MAP.get(&queue_state_ref.device) else {
        return CaptureSubmit::none();
    };

    let mut ipc_guard = match IPC_STATE.lock() {
        Ok(guard) => guard,
        Err(_) => {
            return CaptureSubmit::none();
        }
    };
    if ipc_guard.is_none() {
        *ipc_guard = open_ipc();
    }
    let Some(ipc) = ipc_guard.as_mut() else {
        return CaptureSubmit::none();
    };
    if !capture_should_run(ipc) {
        if let Some(mut state) = ipc_guard.take() {
            free_ipc_state(&mut state);
        }
        return CaptureSubmit::none();
    }

    if host_supports_present_clock((*ipc.info).version) {
        (*ipc.info).present_clock = GAME_CAPTURE_PRESENT_CLOCK_QPC;
        (*ipc.info).last_present_timestamp_us = qpc_now_us();
    } else {
        (*ipc.info).last_present_timestamp_us = now_us();
    }

    let swapchains = std::slice::from_raw_parts(
        present_info.p_swapchains,
        present_info.swapchain_count as usize,
    );
    let indices = std::slice::from_raw_parts(
        present_info.p_image_indices,
        present_info.swapchain_count as usize,
    );
    for (swapchain_handle, image_index) in swapchains.iter().zip(indices.iter()) {
        let Some(swapchain_ref) = SWAPCHAIN_MAP.get(swapchain_handle) else {
            continue;
        };
        if swapchain_ref.device != queue_state_ref.device {
            continue;
        }
        if let Ok(result) = capture_swapchain_for_present(
            &device_state_ref,
            &queue_state_ref,
            queue,
            &swapchain_ref,
            *image_index,
            present_info,
            ipc,
        ) {
            return result;
        }
    }
    CaptureSubmit::none()
}

unsafe fn record_queue(device: vk::Device, queue: vk::Queue, family_index: u32) {
    if queue == vk::Queue::null() {
        return;
    }
    let supports_transfer = DEVICE_MAP
        .get(&device)
        .and_then(|device_state| {
            device_state
                .queue_families
                .get(family_index as usize)
                .copied()
        })
        .map(|properties| {
            properties.queue_flags.intersects(
                vk::QueueFlags::GRAPHICS | vk::QueueFlags::COMPUTE | vk::QueueFlags::TRANSFER,
            )
        })
        .unwrap_or(true);
    QUEUE_MAP.insert(
        queue,
        QueueState {
            device,
            family_index,
            supports_transfer,
            resources: Mutex::new(None),
            shared: Mutex::new(None),
        },
    );
}

unsafe fn destroy_device_state(device: vk::Device) -> Option<LayerDevice> {
    let device_state = DEVICE_MAP.remove(&device).map(|(_, value)| value)?;
    let queue_keys: Vec<vk::Queue> = QUEUE_MAP
        .iter()
        .filter_map(|entry| (entry.value().device == device).then_some(*entry.key()))
        .collect();
    for queue in queue_keys {
        if let Some((_, queue_state)) = QUEUE_MAP.remove(&queue) {
            if let Ok(mut resources) = queue_state.resources.lock() {
                if let Some(mut resources) = resources.take() {
                    destroy_readback_resources(&device_state.ash_device, &mut resources);
                }
            }
            if let Ok(mut shared) = queue_state.shared.lock() {
                if let Some(mut shared) = shared.take() {
                    destroy_shared_texture_resources(&device_state.ash_device, &mut shared);
                }
            }
        }
    }
    let swapchain_keys: Vec<vk::SwapchainKHR> = SWAPCHAIN_MAP
        .iter()
        .filter_map(|entry| (entry.value().device == device).then_some(*entry.key()))
        .collect();
    for swapchain in swapchain_keys {
        SWAPCHAIN_MAP.remove(&swapchain);
    }
    GDPA_MAP.remove(&device);
    Some(device_state)
}

unsafe extern "system" fn dispatch_next_vkGetInstanceProcAddr(
    instance: vk::Instance,
    p_name: *const c_char,
) -> vk::PFN_vkVoidFunction {
    if p_name.is_null() {
        return None;
    }
    let name = CStr::from_ptr(p_name).to_bytes();
    let pfn: *const () = match name {
        b"vkGetInstanceProcAddr" => dispatch_next_vkGetInstanceProcAddr as _,
        b"vkGetDeviceProcAddr" => dispatch_next_vkGetDeviceProcAddr as _,
        b"vkEnumerateInstanceExtensionProperties"
        | b"vkEnumerateInstanceLayerProperties"
        | b"vkEnumerateInstanceVersion" => return None,
        _ => {
            let gipa = GIPA.get()?;
            return gipa(instance, p_name);
        }
    };
    Some(mem::transmute(pfn))
}

unsafe extern "system" fn dispatch_next_vkGetDeviceProcAddr(
    device: vk::Device,
    p_name: *const c_char,
) -> vk::PFN_vkVoidFunction {
    if p_name.is_null() {
        return None;
    }
    let name = CStr::from_ptr(p_name).to_bytes();
    if name == b"vkGetDeviceProcAddr" {
        return Some(mem::transmute(
            dispatch_next_vkGetDeviceProcAddr as *const (),
        ));
    }
    let gdpa = GDPA_MAP.get(&device)?;
    gdpa(device, p_name)
}

#[unsafe(no_mangle)]
pub unsafe extern "system" fn vkNegotiateLoaderLayerInterfaceVersion(
    p_version_struct: *mut NegotiateLayerInterface,
) -> vk::Result {
    if p_version_struct.is_null() {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    }
    let version_struct = &mut *p_version_struct;
    version_struct.loader_layer_interface_version =
        version_struct.loader_layer_interface_version.min(2);
    version_struct.pfn_get_instance_proc_addr = Some(flux_vkGetInstanceProcAddr);
    version_struct.pfn_get_device_proc_addr = Some(flux_vkGetDeviceProcAddr);
    version_struct.pfn_get_physical_device_proc_addr = Some(flux_vk_layerGetPhysicalDeviceProcAddr);
    vk::Result::SUCCESS
}
const _: PFN_vkNegotiateLoaderLayerInterfaceVersion = vkNegotiateLoaderLayerInterfaceVersion;

#[unsafe(no_mangle)]
pub unsafe extern "system" fn vkGetInstanceProcAddr(
    instance: vk::Instance,
    p_name: *const c_char,
) -> vk::PFN_vkVoidFunction {
    flux_vkGetInstanceProcAddr(instance, p_name)
}

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkGetInstanceProcAddr(
    instance: vk::Instance,
    p_name: *const c_char,
) -> vk::PFN_vkVoidFunction {
    if p_name.is_null() {
        return None;
    }
    let name = CStr::from_ptr(p_name).to_bytes();
    let pfn: *const () = match name {
        b"vkGetInstanceProcAddr" => flux_vkGetInstanceProcAddr as _,
        b"vkGetDeviceProcAddr" => flux_vkGetDeviceProcAddr as _,
        b"vkCreateInstance" => flux_vkCreateInstance as _,
        b"vkDestroyInstance" => flux_vkDestroyInstance as _,
        b"vkCreateDevice" => flux_vkCreateDevice as _,
        b"vkDestroyDevice" => flux_vkDestroyDevice as _,
        b"vkCreateWin32SurfaceKHR" => flux_vkCreateWin32SurfaceKHR as _,
        b"vkDestroySurfaceKHR" => flux_vkDestroySurfaceKHR as _,
        b"vk_layerGetPhysicalDeviceProcAddr" => flux_vk_layerGetPhysicalDeviceProcAddr as _,
        _ => {
            let gipa = GIPA.get()?;
            return gipa(instance, p_name);
        }
    };
    Some(mem::transmute(pfn))
}
const _: vk::PFN_vkGetInstanceProcAddr = flux_vkGetInstanceProcAddr;

#[unsafe(no_mangle)]
pub unsafe extern "system" fn vkGetDeviceProcAddr(
    device: vk::Device,
    p_name: *const c_char,
) -> vk::PFN_vkVoidFunction {
    flux_vkGetDeviceProcAddr(device, p_name)
}

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkGetDeviceProcAddr(
    device: vk::Device,
    p_name: *const c_char,
) -> vk::PFN_vkVoidFunction {
    if p_name.is_null() {
        return None;
    }
    let name = CStr::from_ptr(p_name).to_bytes();
    let pfn: *const () = match name {
        b"vkGetDeviceProcAddr" => flux_vkGetDeviceProcAddr as _,
        b"vkCreateDevice" => flux_vkCreateDevice as _,
        b"vkDestroyDevice" => flux_vkDestroyDevice as _,
        b"vkCreateSwapchainKHR" => flux_vkCreateSwapchainKHR as _,
        b"vkDestroySwapchainKHR" => flux_vkDestroySwapchainKHR as _,
        b"vkGetSwapchainImagesKHR" => flux_vkGetSwapchainImagesKHR as _,
        b"vkQueuePresentKHR" => flux_vkQueuePresentKHR as _,
        b"vkGetDeviceQueue" => flux_vkGetDeviceQueue as _,
        b"vkGetDeviceQueue2" => flux_vkGetDeviceQueue2 as _,
        _ => {
            let gdpa = GDPA_MAP.get(&device)?;
            return gdpa(device, p_name);
        }
    };
    Some(mem::transmute(pfn))
}
const _: vk::PFN_vkGetDeviceProcAddr = flux_vkGetDeviceProcAddr;

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vk_layerGetPhysicalDeviceProcAddr(
    instance: vk::Instance,
    p_name: *const c_char,
) -> vk::PFN_vkVoidFunction {
    if p_name.is_null() {
        return None;
    }
    let name = CStr::from_ptr(p_name).to_bytes();
    if name == b"vkCreateDevice" {
        return Some(mem::transmute(flux_vkCreateDevice as *const ()));
    }
    let gphypa = GPHYPA.get()?;
    gphypa(instance, p_name)
}
const _: PFN_vk_layerGetPhysicalDeviceProcAddr = flux_vk_layerGetPhysicalDeviceProcAddr;

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkCreateInstance(
    p_create_info: *const vk::InstanceCreateInfo,
    p_allocator: *const vk::AllocationCallbacks,
    p_instance: *mut vk::Instance,
) -> vk::Result {
    if p_create_info.is_null() || p_instance.is_null() {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    }
    let create_info = p_create_info.read();
    let Some(mut chain_info) =
        get_instance_chain_info(&create_info, LayerFunction::LAYER_LINK_INFO)
    else {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    };
    let chain_info = chain_info.as_mut();
    let layer_info = chain_info.u.p_layer_info.read();
    chain_info.u.p_layer_info = layer_info.p_next;

    let Some(gipa) = layer_info.pfn_next_get_instance_proc_addr else {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    };
    if let Some(gphypa) = layer_info.pfn_next_get_physical_device_proc_addr {
        let _ = GPHYPA.set(gphypa);
    }
    let create_name = CStr::from_bytes_with_nul_unchecked(b"vkCreateInstance\0");
    let Some(create_instance_ptr) = gipa(vk::Instance::null(), create_name.as_ptr()) else {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    };
    let create_instance: vk::PFN_vkCreateInstance = mem::transmute(create_instance_ptr);

    let augmented = AugmentedExtensions::build(
        create_info.pp_enabled_extension_names,
        create_info.enabled_extension_count,
        &[
            INSTANCE_EXT_PHYSICAL_DEVICE_PROPERTIES2,
            INSTANCE_EXT_EXTERNAL_MEMORY_CAPABILITIES,
        ],
    );
    let mut augmented_info = create_info;
    augmented_info.enabled_extension_count = augmented.count();
    augmented_info.pp_enabled_extension_names = augmented.as_ptr();

    let result = if capture_mode() != CaptureMode::ForceCpu {
        let augmented_result = create_instance(&augmented_info, p_allocator, p_instance);
        if augmented_result == vk::Result::SUCCESS {
            augmented_result
        } else {
            create_instance(p_create_info, p_allocator, p_instance)
        }
    } else {
        create_instance(p_create_info, p_allocator, p_instance)
    };
    if result != vk::Result::SUCCESS {
        return result;
    }

    let instance = *p_instance;
    let _ = GIPA.set(gipa);
    let entry = ash::Entry::from_static_fn(ash::StaticFn {
        get_instance_proc_addr: dispatch_next_vkGetInstanceProcAddr,
    });
    let _ = ENTRY.set(entry.clone());
    let ash_instance = ash::Instance::load(entry.static_fn(), instance);
    let khr_surface = khr::surface::Instance::new(&entry, &ash_instance);
    let khr_win32_surface = khr::win32_surface::Instance::new(&entry, &ash_instance);
    if let Ok(physical_devices) = ash_instance.enumerate_physical_devices() {
        for physical_device in physical_devices {
            PHY_TO_INSTANCE_MAP.insert(physical_device, instance);
        }
    }
    INSTANCE_MAP.insert(
        instance,
        LayerInstance {
            ash_instance,
            khr_surface,
            khr_win32_surface,
        },
    );
    vk::Result::SUCCESS
}
const _: vk::PFN_vkCreateInstance = flux_vkCreateInstance;

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkDestroyInstance(
    instance: vk::Instance,
    p_allocator: *const vk::AllocationCallbacks,
) {
    let Some((_, instance_state)) = INSTANCE_MAP.remove(&instance) else {
        return;
    };
    if let Ok(physical_devices) = instance_state.ash_instance.enumerate_physical_devices() {
        for physical_device in physical_devices {
            PHY_TO_INSTANCE_MAP.remove(&physical_device);
        }
    }
    let surfaces: Vec<vk::SurfaceKHR> = SURFACE_MAP
        .iter()
        .filter_map(|entry| (entry.value().instance == instance).then_some(*entry.key()))
        .collect();
    for surface in surfaces {
        SURFACE_MAP.remove(&surface);
    }
    (instance_state.ash_instance.fp_v1_0().destroy_instance)(instance, p_allocator);
}
const _: vk::PFN_vkDestroyInstance = flux_vkDestroyInstance;

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkCreateDevice(
    physical_device: vk::PhysicalDevice,
    p_create_info: *const vk::DeviceCreateInfo,
    p_allocator: *const vk::AllocationCallbacks,
    p_device: *mut vk::Device,
) -> vk::Result {
    if p_create_info.is_null() || p_device.is_null() {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    }
    let instance = PHY_TO_INSTANCE_MAP
        .get(&physical_device)
        .map(|entry| *entry)
        .or_else(|| INSTANCE_MAP.iter().next().map(|entry| *entry.key()));
    let Some(instance) = instance else {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    };
    let Some(instance_state) = INSTANCE_MAP.get(&instance) else {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    };
    let instance_fn = instance_state.ash_instance.fp_v1_0();

    let create_info = p_create_info.read();
    let Some(mut chain_info) = get_device_chain_info(&create_info, LayerFunction::LAYER_LINK_INFO)
    else {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    };
    let chain_info = chain_info.as_mut();
    let layer_info = chain_info.u.p_layer_info.read();
    chain_info.u.p_layer_info = layer_info.p_next;

    let Some(gdpa) = layer_info.pfn_next_get_device_proc_addr else {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    };

    let want_external_memory = capture_mode() != CaptureMode::ForceCpu;
    let augmented = AugmentedExtensions::build(
        create_info.pp_enabled_extension_names,
        create_info.enabled_extension_count,
        &[
            DEVICE_EXT_EXTERNAL_MEMORY,
            DEVICE_EXT_EXTERNAL_MEMORY_WIN32,
            DEVICE_EXT_DEDICATED_ALLOCATION,
            DEVICE_EXT_GET_MEMORY_REQUIREMENTS2,
        ],
    );
    let mut augmented_info = create_info;
    augmented_info.enabled_extension_count = augmented.count();
    augmented_info.pp_enabled_extension_names = augmented.as_ptr();

    let mut external_memory_enabled = false;
    let result = if want_external_memory {
        let augmented_result =
            (instance_fn.create_device)(physical_device, &augmented_info, p_allocator, p_device);
        if augmented_result == vk::Result::SUCCESS {
            external_memory_enabled = true;
            augmented_result
        } else {
            (instance_fn.create_device)(physical_device, p_create_info, p_allocator, p_device)
        }
    } else {
        (instance_fn.create_device)(physical_device, p_create_info, p_allocator, p_device)
    };
    if result != vk::Result::SUCCESS {
        return result;
    }
    let app_external_memory_win32 = extension_in_list(
        create_info.pp_enabled_extension_names,
        create_info.enabled_extension_count,
        DEVICE_EXT_EXTERNAL_MEMORY_WIN32,
    );
    let external_memory_enabled = external_memory_enabled || app_external_memory_win32;
    vlog!(
        "vkCreateDevice: external_memory_enabled={external_memory_enabled} (want={want_external_memory}, app_enabled={app_external_memory_win32})"
    );
    let dedicated_allocation_enabled = external_memory_enabled
        || extension_in_list(
            create_info.pp_enabled_extension_names,
            create_info.enabled_extension_count,
            DEVICE_EXT_DEDICATED_ALLOCATION,
        );

    let device = *p_device;
    GDPA_MAP.insert(device, gdpa);
    let ash_device = ash::Device::load(instance_fn, device);
    let khr_swapchain = khr::swapchain::Device::new(&instance_state.ash_instance, &ash_device);
    let khr_external_memory_win32 = external_memory_enabled.then(|| {
        khr::external_memory_win32::Device::new(&instance_state.ash_instance, &ash_device)
    });
    let queue_families = instance_state
        .ash_instance
        .get_physical_device_queue_family_properties(physical_device);
    DEVICE_MAP.insert(
        device,
        LayerDevice {
            instance,
            physical_device,
            ash_device: ash_device.clone(),
            khr_swapchain,
            queue_families,
            khr_external_memory_win32,
            external_memory_enabled,
            dedicated_allocation_enabled,
        },
    );

    if !create_info.p_queue_create_infos.is_null() {
        let queue_infos = std::slice::from_raw_parts(
            create_info.p_queue_create_infos,
            create_info.queue_create_info_count as usize,
        );
        for queue_info in queue_infos {
            for queue_index in 0..queue_info.queue_count {
                let mut queue = vk::Queue::null();
                (ash_device.fp_v1_0().get_device_queue)(
                    device,
                    queue_info.queue_family_index,
                    queue_index,
                    &mut queue,
                );
                record_queue(device, queue, queue_info.queue_family_index);
            }
        }
    }

    vk::Result::SUCCESS
}
const _: vk::PFN_vkCreateDevice = flux_vkCreateDevice;

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkDestroyDevice(
    device: vk::Device,
    p_allocator: *const vk::AllocationCallbacks,
) {
    let Some(device_state) = destroy_device_state(device) else {
        return;
    };
    (device_state.ash_device.fp_v1_0().destroy_device)(device, p_allocator);
}
const _: vk::PFN_vkDestroyDevice = flux_vkDestroyDevice;

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkCreateWin32SurfaceKHR(
    instance: vk::Instance,
    p_create_info: *const vk::Win32SurfaceCreateInfoKHR,
    p_allocator: *const vk::AllocationCallbacks,
    p_surface: *mut vk::SurfaceKHR,
) -> vk::Result {
    let Some(instance_state) = INSTANCE_MAP.get(&instance) else {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    };
    let result = (instance_state
        .khr_win32_surface
        .fp()
        .create_win32_surface_khr)(instance, p_create_info, p_allocator, p_surface);
    if result == vk::Result::SUCCESS && !p_surface.is_null() && !p_create_info.is_null() {
        let surface = *p_surface;
        SURFACE_MAP.insert(
            surface,
            SurfaceState {
                instance,
                hwnd: (*p_create_info).hwnd,
            },
        );
    }
    result
}
const _: vk::PFN_vkCreateWin32SurfaceKHR = flux_vkCreateWin32SurfaceKHR;

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkDestroySurfaceKHR(
    instance: vk::Instance,
    surface: vk::SurfaceKHR,
    p_allocator: *const vk::AllocationCallbacks,
) {
    SURFACE_MAP.remove(&surface);
    if let Some(instance_state) = INSTANCE_MAP.get(&instance) {
        (instance_state.khr_surface.fp().destroy_surface_khr)(instance, surface, p_allocator);
    }
}
const _: vk::PFN_vkDestroySurfaceKHR = flux_vkDestroySurfaceKHR;

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkCreateSwapchainKHR(
    device: vk::Device,
    p_create_info: *const vk::SwapchainCreateInfoKHR,
    p_allocator: *const vk::AllocationCallbacks,
    p_swapchain: *mut vk::SwapchainKHR,
) -> vk::Result {
    if p_create_info.is_null() || p_swapchain.is_null() {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    }
    let Some(device_state) = DEVICE_MAP.get(&device) else {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    };
    let original_info = p_create_info.read();
    let original_can_capture = original_info
        .image_usage
        .contains(vk::ImageUsageFlags::TRANSFER_SRC);
    let create_info = swapchain_create_info_with_transfer_src(original_info);
    let mut used_transfer_src = true;
    let mut result = (device_state.khr_swapchain.fp().create_swapchain_khr)(
        device,
        &create_info,
        p_allocator,
        p_swapchain,
    );
    if result != vk::Result::SUCCESS {
        used_transfer_src = original_can_capture;
        let retry_info = swapchain_retry_create_info(original_info);
        result = (device_state.khr_swapchain.fp().create_swapchain_khr)(
            device,
            &retry_info,
            p_allocator,
            p_swapchain,
        );
    }
    if result != vk::Result::SUCCESS {
        return result;
    }

    if let Some(old_swapchain) =
        old_swapchain_to_remove_after_create(result, original_info.old_swapchain)
    {
        SWAPCHAIN_MAP.remove(&old_swapchain);
    }
    let swapchain = *p_swapchain;
    let mut count = 0u32;
    let get_result = (device_state.khr_swapchain.fp().get_swapchain_images_khr)(
        device,
        swapchain,
        &mut count,
        null_mut(),
    );
    let mut images = Vec::new();
    if get_result == vk::Result::SUCCESS && count > 0 {
        images.resize(count as usize, vk::Image::null());
        let image_result = (device_state.khr_swapchain.fp().get_swapchain_images_khr)(
            device,
            swapchain,
            &mut count,
            images.as_mut_ptr(),
        );
        if image_result == vk::Result::SUCCESS || image_result == vk::Result::INCOMPLETE {
            images.truncate(count as usize);
        } else {
            images.clear();
        }
    }
    let hwnd = SURFACE_MAP
        .get(&original_info.surface)
        .map(|surface| surface.hwnd)
        .unwrap_or(0);
    let present_layout = present_layout_for_mode(original_info.present_mode);
    let shared_texture_allowed =
        shared_texture_allowed_for_present_mode(original_info.present_mode);
    let have_images = !images.is_empty();
    SWAPCHAIN_MAP.insert(
        swapchain,
        SwapchainState {
            device,
            hwnd,
            extent: original_info.image_extent,
            format: original_info.image_format,
            images,
            can_capture: used_transfer_src && hwnd != 0 && have_images,
            present_layout,
            shared_texture_allowed,
        },
    );
    vk::Result::SUCCESS
}
const _: vk::PFN_vkCreateSwapchainKHR = flux_vkCreateSwapchainKHR;

fn swapchain_create_info_with_transfer_src(
    mut create_info: vk::SwapchainCreateInfoKHR,
) -> vk::SwapchainCreateInfoKHR {
    create_info.image_usage |= vk::ImageUsageFlags::TRANSFER_SRC;
    create_info
}

fn swapchain_retry_create_info(
    original_info: vk::SwapchainCreateInfoKHR,
) -> vk::SwapchainCreateInfoKHR {
    original_info
}

fn old_swapchain_to_remove_after_create(
    result: vk::Result,
    old_swapchain: vk::SwapchainKHR,
) -> Option<vk::SwapchainKHR> {
    (result == vk::Result::SUCCESS && old_swapchain != vk::SwapchainKHR::null())
        .then_some(old_swapchain)
}

fn present_layout_for_mode(present_mode: vk::PresentModeKHR) -> vk::ImageLayout {
    match present_mode {
        vk::PresentModeKHR::SHARED_DEMAND_REFRESH
        | vk::PresentModeKHR::SHARED_CONTINUOUS_REFRESH => vk::ImageLayout::SHARED_PRESENT_KHR,
        _ => vk::ImageLayout::PRESENT_SRC_KHR,
    }
}

fn shared_texture_allowed_for_present_mode(present_mode: vk::PresentModeKHR) -> bool {
    present_mode != vk::PresentModeKHR::IMMEDIATE
}

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkDestroySwapchainKHR(
    device: vk::Device,
    swapchain: vk::SwapchainKHR,
    p_allocator: *const vk::AllocationCallbacks,
) {
    SWAPCHAIN_MAP.remove(&swapchain);
    if let Some(device_state) = DEVICE_MAP.get(&device) {
        (device_state.khr_swapchain.fp().destroy_swapchain_khr)(device, swapchain, p_allocator);
    }
}
const _: vk::PFN_vkDestroySwapchainKHR = flux_vkDestroySwapchainKHR;

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkGetSwapchainImagesKHR(
    device: vk::Device,
    swapchain: vk::SwapchainKHR,
    p_swapchain_image_count: *mut u32,
    p_swapchain_images: *mut vk::Image,
) -> vk::Result {
    let Some(device_state) = DEVICE_MAP.get(&device) else {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    };
    let result = (device_state.khr_swapchain.fp().get_swapchain_images_khr)(
        device,
        swapchain,
        p_swapchain_image_count,
        p_swapchain_images,
    );
    if (result == vk::Result::SUCCESS || result == vk::Result::INCOMPLETE)
        && !p_swapchain_image_count.is_null()
        && !p_swapchain_images.is_null()
    {
        let count = *p_swapchain_image_count as usize;
        if let Some(mut swapchain_state) = SWAPCHAIN_MAP.get_mut(&swapchain) {
            swapchain_state.images = std::slice::from_raw_parts(p_swapchain_images, count).to_vec();
        }
    }
    result
}
const _: vk::PFN_vkGetSwapchainImagesKHR = flux_vkGetSwapchainImagesKHR;

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkQueuePresentKHR(
    queue: vk::Queue,
    p_present_info: *const vk::PresentInfoKHR,
) -> vk::Result {
    if p_present_info.is_null() {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    }
    let present_info = *p_present_info;
    let capture = try_capture_present(queue, &present_info);
    let Some(queue_state) = QUEUE_MAP.get(&queue) else {
        return vk::Result::ERROR_DEVICE_LOST;
    };
    let Some(device_state) = DEVICE_MAP.get(&queue_state.device) else {
        return vk::Result::ERROR_DEVICE_LOST;
    };
    let chained_slot = capture.chained_wait;
    if let Some(chained) = chained_slot {
        let modified = present_info_with_chained_wait(present_info, &chained);
        return (device_state.khr_swapchain.fp().queue_present_khr)(queue, &modified);
    }
    (device_state.khr_swapchain.fp().queue_present_khr)(queue, p_present_info)
}
const _: vk::PFN_vkQueuePresentKHR = flux_vkQueuePresentKHR;

fn present_info_with_chained_wait<'a>(
    mut present_info: vk::PresentInfoKHR<'a>,
    chained: &'a vk::Semaphore,
) -> vk::PresentInfoKHR<'a> {
    present_info.wait_semaphore_count = 1;
    present_info.p_wait_semaphores = chained;
    present_info
}

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkGetDeviceQueue(
    device: vk::Device,
    queue_family_index: u32,
    queue_index: u32,
    p_queue: *mut vk::Queue,
) {
    if let Some(device_state) = DEVICE_MAP.get(&device) {
        (device_state.ash_device.fp_v1_0().get_device_queue)(
            device,
            queue_family_index,
            queue_index,
            p_queue,
        );
        if !p_queue.is_null() {
            record_queue(device, *p_queue, queue_family_index);
        }
    }
}
const _: vk::PFN_vkGetDeviceQueue = flux_vkGetDeviceQueue;

#[unsafe(no_mangle)]
unsafe extern "system" fn flux_vkGetDeviceQueue2(
    device: vk::Device,
    p_queue_info: *const vk::DeviceQueueInfo2,
    p_queue: *mut vk::Queue,
) {
    if let Some(device_state) = DEVICE_MAP.get(&device) {
        (device_state.ash_device.fp_v1_1().get_device_queue2)(device, p_queue_info, p_queue);
        if !p_queue_info.is_null() && !p_queue.is_null() {
            record_queue(device, *p_queue, (*p_queue_info).queue_family_index);
        }
    }
}
const _: vk::PFN_vkGetDeviceQueue2 = flux_vkGetDeviceQueue2;

#[cfg(test)]
mod tests {
    use super::*;
    use ash::vk::Handle;

    #[test]
    fn format_mode_accepts_obs_capture_8bit_formats() {
        assert_eq!(
            format_mode(vk::Format::B8G8R8A8_UNORM),
            Some(FormatMode::Bgra)
        );
        assert_eq!(
            format_mode(vk::Format::B8G8R8A8_SRGB),
            Some(FormatMode::Bgra)
        );
        assert_eq!(
            format_mode(vk::Format::R8G8B8A8_UNORM),
            Some(FormatMode::Rgba)
        );
        assert_eq!(
            format_mode(vk::Format::R8G8B8A8_SRGB),
            Some(FormatMode::Rgba)
        );
        assert_eq!(format_mode(vk::Format::A2B10G10R10_UNORM_PACK32), None);
    }

    #[test]
    fn hdr_format_flags_mark_ten_bit_and_float_formats() {
        assert_eq!(
            hdr_format_flags(vk::Format::A2B10G10R10_UNORM_PACK32),
            GAME_CAPTURE_FLAG_TEN_BIT | GAME_CAPTURE_FLAG_HDR
        );
        assert_eq!(
            hdr_format_flags(vk::Format::A2R10G10B10_UNORM_PACK32),
            GAME_CAPTURE_FLAG_TEN_BIT | GAME_CAPTURE_FLAG_HDR
        );
        assert_eq!(
            hdr_format_flags(vk::Format::R16G16B16A16_SFLOAT),
            GAME_CAPTURE_FLAG_HDR
        );
        assert_eq!(hdr_format_flags(vk::Format::B8G8R8A8_UNORM), 0);
    }

    #[test]
    fn present_layout_uses_shared_present_only_for_shared_modes() {
        assert_eq!(
            present_layout_for_mode(vk::PresentModeKHR::SHARED_DEMAND_REFRESH),
            vk::ImageLayout::SHARED_PRESENT_KHR
        );
        assert_eq!(
            present_layout_for_mode(vk::PresentModeKHR::SHARED_CONTINUOUS_REFRESH),
            vk::ImageLayout::SHARED_PRESENT_KHR
        );
        assert_eq!(
            present_layout_for_mode(vk::PresentModeKHR::FIFO),
            vk::ImageLayout::PRESENT_SRC_KHR
        );
        assert_eq!(
            present_layout_for_mode(vk::PresentModeKHR::MAILBOX),
            vk::ImageLayout::PRESENT_SRC_KHR
        );
    }

    #[test]
    fn immediate_present_mode_uses_cpu_fallback_after_real_shared_handle_failure() {
        assert!(!shared_texture_allowed_for_present_mode(
            vk::PresentModeKHR::IMMEDIATE
        ));
        assert!(shared_texture_allowed_for_present_mode(
            vk::PresentModeKHR::FIFO
        ));
        assert!(shared_texture_allowed_for_present_mode(
            vk::PresentModeKHR::MAILBOX
        ));
    }

    #[test]
    fn shared_texture_reacquires_external_ownership_after_first_frame() {
        let queue_family_index = 7;
        assert_eq!(
            shared_texture_dst_pre_queue_families(false, queue_family_index),
            (vk::QUEUE_FAMILY_IGNORED, vk::QUEUE_FAMILY_IGNORED)
        );
        assert_eq!(
            shared_texture_dst_pre_queue_families(true, queue_family_index),
            (vk::QUEUE_FAMILY_EXTERNAL, queue_family_index)
        );
    }

    #[test]
    fn augmented_swapchain_create_info_preserves_old_swapchain() {
        let old = vk::SwapchainKHR::from_raw(0x55);
        let original = vk::SwapchainCreateInfoKHR {
            image_usage: vk::ImageUsageFlags::COLOR_ATTACHMENT,
            old_swapchain: old,
            ..Default::default()
        };

        let augmented = swapchain_create_info_with_transfer_src(original);
        assert!(
            augmented
                .image_usage
                .contains(vk::ImageUsageFlags::TRANSFER_SRC)
        );
        assert!(
            augmented
                .image_usage
                .contains(vk::ImageUsageFlags::COLOR_ATTACHMENT)
        );
        assert_eq!(augmented.old_swapchain.as_raw(), old.as_raw());
    }

    #[test]
    fn retry_swapchain_create_info_keeps_app_usage_and_old_swapchain() {
        let old = vk::SwapchainKHR::from_raw(0x66);
        let original = vk::SwapchainCreateInfoKHR {
            image_usage: vk::ImageUsageFlags::COLOR_ATTACHMENT,
            old_swapchain: old,
            ..Default::default()
        };

        let retry = swapchain_retry_create_info(original);
        assert_eq!(retry.image_usage, original.image_usage);
        assert_eq!(retry.old_swapchain.as_raw(), old.as_raw());
    }

    #[test]
    fn old_swapchain_is_removed_only_after_successful_recreate() {
        let old = vk::SwapchainKHR::from_raw(0x77);
        assert_eq!(
            old_swapchain_to_remove_after_create(vk::Result::SUCCESS, old).map(|h| h.as_raw()),
            Some(old.as_raw())
        );
        assert_eq!(
            old_swapchain_to_remove_after_create(vk::Result::ERROR_INITIALIZATION_FAILED, old)
                .map(|h| h.as_raw()),
            None
        );
        assert_eq!(
            old_swapchain_to_remove_after_create(vk::Result::SUCCESS, vk::SwapchainKHR::null())
                .map(|h| h.as_raw()),
            None
        );
    }

    #[test]
    fn present_wait_semaphore_slice_rejects_missing_pointer() {
        let waits = [vk::Semaphore::from_raw(0x11), vk::Semaphore::from_raw(0x12)];
        let present_info = vk::PresentInfoKHR {
            wait_semaphore_count: waits.len() as u32,
            p_wait_semaphores: waits.as_ptr(),
            ..Default::default()
        };
        let slice = unsafe { present_wait_semaphores(&present_info) };
        assert_eq!(
            slice.iter().map(|s| s.as_raw()).collect::<Vec<_>>(),
            vec![0x11, 0x12]
        );

        let missing_pointer = vk::PresentInfoKHR {
            wait_semaphore_count: waits.len() as u32,
            p_wait_semaphores: null(),
            ..Default::default()
        };
        assert!(unsafe { present_wait_semaphores(&missing_pointer) }.is_empty());
    }

    #[test]
    fn chained_present_wait_replaces_wait_list_but_preserves_present_payload() {
        let original_waits = [vk::Semaphore::from_raw(0x21), vk::Semaphore::from_raw(0x22)];
        let swapchains = [vk::SwapchainKHR::from_raw(0x31)];
        let image_indices = [3_u32];
        let mut results = [vk::Result::SUCCESS];
        let present_info = vk::PresentInfoKHR {
            wait_semaphore_count: original_waits.len() as u32,
            p_wait_semaphores: original_waits.as_ptr(),
            swapchain_count: swapchains.len() as u32,
            p_swapchains: swapchains.as_ptr(),
            p_image_indices: image_indices.as_ptr(),
            p_results: results.as_mut_ptr(),
            ..Default::default()
        };
        let chained = vk::Semaphore::from_raw(0x44);

        let modified = present_info_with_chained_wait(present_info, &chained);

        assert_eq!(modified.wait_semaphore_count, 1);
        assert_eq!(
            unsafe { *modified.p_wait_semaphores }.as_raw(),
            chained.as_raw()
        );
        assert_eq!(modified.swapchain_count, present_info.swapchain_count);
        assert_eq!(modified.p_swapchains, present_info.p_swapchains);
        assert_eq!(modified.p_image_indices, present_info.p_image_indices);
        assert_eq!(modified.p_results, present_info.p_results);
    }
}

#[unsafe(no_mangle)]
unsafe extern "system" fn vkEnumerateInstanceLayerProperties(
    p_property_count: *mut u32,
    p_properties: *mut vk::LayerProperties,
) -> vk::Result {
    if p_property_count.is_null() {
        return vk::Result::ERROR_INITIALIZATION_FAILED;
    }
    if p_properties.is_null() {
        *p_property_count = 1;
        return vk::Result::SUCCESS;
    }
    if *p_property_count == 0 {
        return vk::Result::INCOMPLETE;
    }
    *p_property_count = 1;
    let mut properties = vk::LayerProperties {
        spec_version: vk::API_VERSION_1_0,
        implementation_version: 1,
        ..Default::default()
    };
    let name = LAYER_NAME;
    std::ptr::copy_nonoverlapping(
        name.as_ptr() as *const c_char,
        properties.layer_name.as_mut_ptr(),
        name.len().min(properties.layer_name.len()),
    );
    *p_properties = properties;
    vk::Result::SUCCESS
}
