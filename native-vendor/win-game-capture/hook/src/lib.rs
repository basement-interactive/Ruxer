// SPDX-License-Identifier: AGPL-3.0-or-later

#![cfg(target_os = "windows")]
#![allow(dead_code)]
#![allow(static_mut_refs)]
#![allow(unsafe_op_in_unsafe_fn)]

#[path = "../../src/game_capture_abi.rs"]
mod game_capture_abi;

mod arm64_reloc;
mod d3d9;
mod gl_interop;
mod inline_hook;

pub(crate) use game_capture_abi::{
    ENV_DISABLE_D3D12, ENV_DISABLE_OPENGL_SHARED_TEXTURE, ENV_ENABLE_OPENGL_SHARED_TEXTURE,
    ENV_FORCE_CPU, ENV_FORCE_SHARED_TEXTURE, ENV_VERBOSE, GAME_CAPTURE_API_D3D9,
    GAME_CAPTURE_API_D3D10, GAME_CAPTURE_API_D3D11, GAME_CAPTURE_API_D3D12,
    GAME_CAPTURE_API_OPENGL, GAME_CAPTURE_BUFFER_COUNT,
    GAME_CAPTURE_CONTROL_DISABLE_SHARED_TEXTURE, GAME_CAPTURE_FALLBACK_DEVICE_LOST,
    GAME_CAPTURE_FALLBACK_FORCED_CPU, GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED,
    GAME_CAPTURE_FALLBACK_MULTISAMPLED, GAME_CAPTURE_FALLBACK_NONE,
    GAME_CAPTURE_FALLBACK_SHARED_TEXTURE_UNSUPPORTED, GAME_CAPTURE_FLAG_FLIP_VERTICAL,
    GAME_CAPTURE_FLAG_HDR, GAME_CAPTURE_FLAG_MULTISAMPLED, GAME_CAPTURE_FLAG_TEN_BIT,
    GAME_CAPTURE_FRAME_PREFIX, GAME_CAPTURE_INFO_PREFIX, GAME_CAPTURE_KEEPALIVE_PREFIX,
    GAME_CAPTURE_MAGIC, GAME_CAPTURE_PRESENT_CLOCK_QPC, GAME_CAPTURE_READY_PREFIX,
    GAME_CAPTURE_STATE_ACTIVE, GAME_CAPTURE_STATE_ERROR, GAME_CAPTURE_STATE_RESIZE_REQUIRED,
    GAME_CAPTURE_STATE_STOPPED, GAME_CAPTURE_STOP_PREFIX, GAME_CAPTURE_TRANSPORT_MEMORY,
    GAME_CAPTURE_TRANSPORT_SHARED_TEXTURE, GameCaptureSharedInfo, env_flag_enabled,
    frame_buffer_size, host_supports_present_clock, mutex_name, object_name, qpc_now_us,
};
pub(crate) use inline_hook::Detour;
use std::{
    ffi::c_void,
    mem,
    ptr::{null, null_mut},
    sync::{
        Mutex, OnceLock,
        atomic::{AtomicBool, AtomicU32, Ordering},
    },
};
use windows::{
    Win32::{
        Foundation::{HMODULE as WinHmodule, HWND as WinHwnd},
        Graphics::{
            Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0},
            Direct3D10::{
                D3D10_BIND_RENDER_TARGET, D3D10_BIND_SHADER_RESOURCE, D3D10_RESOURCE_MISC_SHARED,
                D3D10_TEXTURE2D_DESC, D3D10_USAGE_DEFAULT, ID3D10Device, ID3D10Texture2D,
            },
            Direct3D11::{
                D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_CPU_ACCESS_READ,
                D3D11_CREATE_DEVICE_FLAG, D3D11_MAP_READ, D3D11_RESOURCE_MISC_SHARED,
                D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT, D3D11_USAGE_STAGING,
                D3D11CreateDeviceAndSwapChain, ID3D11Device, ID3D11DeviceContext, ID3D11Resource,
                ID3D11Texture2D,
            },
            Direct3D11on12::{D3D11_RESOURCE_FLAGS, D3D11On12CreateDevice, ID3D11On12Device},
            Direct3D12::{
                D3D12_COMMAND_LIST_TYPE_DIRECT, D3D12_COMMAND_QUEUE_DESC,
                D3D12_RESOURCE_STATE_PRESENT, ID3D12CommandQueue, ID3D12Device, ID3D12Resource,
            },
            Dxgi::{
                Common::{
                    DXGI_FORMAT, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_B8G8R8A8_UNORM_SRGB,
                    DXGI_FORMAT_B8G8R8X8_UNORM, DXGI_FORMAT_B8G8R8X8_UNORM_SRGB,
                    DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_FORMAT_R8G8B8A8_UNORM_SRGB,
                    DXGI_FORMAT_R10G10B10_XR_BIAS_A2_UNORM, DXGI_FORMAT_R10G10B10A2_UNORM,
                    DXGI_FORMAT_R16G16B16A16_FLOAT, DXGI_FORMAT_R16G16B16A16_UNORM, DXGI_MODE_DESC,
                    DXGI_MODE_SCALING_UNSPECIFIED, DXGI_MODE_SCANLINE_ORDER_UNSPECIFIED,
                    DXGI_RATIONAL, DXGI_SAMPLE_DESC,
                },
                DXGI_PRESENT_PARAMETERS, DXGI_SWAP_CHAIN_DESC, DXGI_SWAP_EFFECT_DISCARD,
                DXGI_USAGE_RENDER_TARGET_OUTPUT, IDXGIResource, IDXGISwapChain, IDXGISwapChain1,
                IDXGISwapChain3,
            },
        },
    },
    core::{BOOL as WinBool, GUID, HRESULT, IUnknown, Interface},
};
use windows_sys::Win32::Foundation::{LPARAM as WinLparam, LRESULT, WPARAM};
use windows_sys::{
    Win32::{
        Foundation::{CloseHandle, HANDLE, HINSTANCE, HWND, WAIT_ABANDONED, WAIT_OBJECT_0},
        Graphics::{
            Gdi::{HDC, WindowFromDC},
            OpenGL::{
                GL_BACK, GL_BGRA_EXT, GL_PACK_ALIGNMENT, GL_PACK_LSB_FIRST, GL_PACK_ROW_LENGTH,
                GL_PACK_SKIP_PIXELS, GL_PACK_SKIP_ROWS, GL_PACK_SWAP_BYTES, GL_READ_BUFFER,
                GL_UNSIGNED_BYTE, glGetIntegerv, glPixelStorei, glReadBuffer, glReadPixels,
                wglGetProcAddress,
            },
        },
        System::{
            LibraryLoader::{DisableThreadLibraryCalls, GetModuleHandleW, GetProcAddress},
            Memory::{
                FILE_MAP_ALL_ACCESS, MEMORY_MAPPED_VIEW_ADDRESS, MapViewOfFile, OpenFileMappingW,
                UnmapViewOfFile,
            },
            SystemServices::DLL_PROCESS_ATTACH,
            Threading::{
                CreateThread, EVENT_ALL_ACCESS, MUTEX_ALL_ACCESS, OpenEventW, OpenMutexW,
                ReleaseMutex, SYNCHRONIZATION_SYNCHRONIZE, SetEvent, Sleep, WaitForSingleObject,
            },
        },
        UI::WindowsAndMessaging::{
            CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, CallNextHookEx, CreateWindowExW, DefWindowProcW,
            DestroyWindow, GetClientRect, IsWindow, RegisterClassW, WNDCLASSW, WS_OVERLAPPEDWINDOW,
        },
    },
    core::BOOL,
};

type SwapBuffersFn = unsafe extern "system" fn(HDC) -> BOOL;
type WglSwapLayerBuffersFn = unsafe extern "system" fn(HDC, u32) -> BOOL;
type GlBindBufferFn = unsafe extern "system" fn(u32, u32);
type DxgiPresentFn = unsafe extern "system" fn(*mut c_void, u32, u32) -> HRESULT;
type DxgiPresent1Fn =
    unsafe extern "system" fn(*mut c_void, u32, u32, *const DXGI_PRESENT_PARAMETERS) -> HRESULT;
type D3d12ExecuteCommandListsFn = unsafe extern "system" fn(*mut c_void, u32, *const *mut c_void);
type D3d12CreateDeviceFn = unsafe extern "system" fn(
    *mut c_void,
    windows::Win32::Graphics::Direct3D::D3D_FEATURE_LEVEL,
    *const GUID,
    *mut *mut c_void,
) -> HRESULT;

static mut SWAP_BUFFERS_HOOK: Option<Detour<SwapBuffersFn>> = None;
static mut WGL_SWAP_LAYER_BUFFERS_HOOK: Option<Detour<WglSwapLayerBuffersFn>> = None;
static mut DXGI_PRESENT_HOOK: Option<Detour<DxgiPresentFn>> = None;
static mut DXGI_PRESENT1_HOOK: Option<Detour<DxgiPresent1Fn>> = None;
static mut D3D12_EXECUTE_COMMAND_LISTS_HOOK: Option<Detour<D3d12ExecuteCommandListsFn>> = None;
pub(crate) static HOOKS_READY: AtomicBool = AtomicBool::new(false);
static DXGI_PRESENT_DEPTH: AtomicU32 = AtomicU32::new(0);
static DXGI_PRESENT_ATTEMPTED: AtomicBool = AtomicBool::new(false);
static DXGI_PRESENT_FIRED: AtomicBool = AtomicBool::new(false);
static DXGI_PRESENT1_FIRED: AtomicBool = AtomicBool::new(false);
static OPENGL_PRESENT_FIRED: AtomicBool = AtomicBool::new(false);
static D3D12_EXECUTE_FIRED: AtomicBool = AtomicBool::new(false);

const GL_PIXEL_PACK_BUFFER: u32 = 0x88EB;
const GL_PIXEL_PACK_BUFFER_BINDING: u32 = 0x88ED;

const MAX_D3D12_QUEUE_CANDIDATES: usize = 8;
static D3D12_QUEUE_CANDIDATES: Mutex<Vec<ID3D12CommandQueue>> = Mutex::new(Vec::new());

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum D3d11FormatMode {
    Bgra,
    Rgba,
}

struct D3d11CaptureState {
    device_ptr: usize,
    context: ID3D11DeviceContext,
    texture: ID3D11Texture2D,
    staging: Option<ID3D11Texture2D>,
    shared_handle: u64,
    width: u32,
    height: u32,
    format: DXGI_FORMAT,
    format_mode: D3d11FormatMode,
    sample_count: u32,
    force_cpu: bool,
}

struct D3d12CaptureState {
    device_ptr: usize,
    device11: ID3D11Device,
    context11: ID3D11DeviceContext,
    device11on12: ID3D11On12Device,
    copy_tex: ID3D11Texture2D,
    staging: Option<ID3D11Texture2D>,
    shared_handle: u64,
    width: u32,
    height: u32,
    format: DXGI_FORMAT,
    format_mode: D3d11FormatMode,
    backbuffer_count: u32,
    current_backbuffer: u32,
    dxgi14: bool,
    force_cpu: bool,
}

struct D3d10CaptureState {
    device_ptr: usize,
    device: ID3D10Device,
    texture: ID3D10Texture2D,
    staging: Option<ID3D10Texture2D>,
    shared_handle: u64,
    width: u32,
    height: u32,
    format: DXGI_FORMAT,
    format_mode: D3d11FormatMode,
    sample_count: u32,
    force_cpu: bool,
}

pub(crate) struct HookState {
    info_map: HANDLE,
    frame_map: HANDLE,
    ready_event: HANDLE,
    stop_event: HANDLE,
    mutexes: [HANDLE; GAME_CAPTURE_BUFFER_COUNT],
    pub(crate) info: *mut GameCaptureSharedInfo,
    frame_base: *mut u8,
    frame_buffer_capacity: usize,
    next_frame_index: usize,
    scratch: Vec<u8>,
    last_frame_ns: u64,
    keepalive_name: Vec<u16>,
    d3d11: Option<D3d11CaptureState>,
    d3d12: Option<D3d12CaptureState>,
    d3d10: Option<D3d10CaptureState>,
    pub(crate) d3d9: Option<d3d9::D3d9CaptureState>,
    pub(crate) gl_interop: Option<gl_interop::GlInteropState>,
}

unsafe impl Send for HookState {}

static mut STATE: Option<HookState> = None;

pub(crate) fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn current_pid() -> u32 {
    std::process::id()
}

unsafe fn close_handle(handle: &mut HANDLE) {
    if !handle.is_null() {
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

unsafe fn open_ipc() -> Option<HookState> {
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
    let max_width = (*info).max_width;
    let max_height = (*info).max_height;
    let frame_buffer_capacity = frame_buffer_size(max_width, max_height).unwrap_or(0);
    if frame_buffer_capacity == 0 {
        let mut info_map = info_map;
        let mut frame_map = frame_map;
        close_handle(&mut frame_map);
        close_handle(&mut info_map);
        return None;
    }
    let frame_map_size = frame_buffer_capacity * GAME_CAPTURE_BUFFER_COUNT;
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
        let mut state = HookState {
            info_map,
            frame_map,
            ready_event,
            stop_event,
            mutexes,
            info,
            frame_base,
            frame_buffer_capacity,
            next_frame_index: 0,
            scratch: Vec::new(),
            last_frame_ns: 0,
            keepalive_name: wide(&object_name(GAME_CAPTURE_KEEPALIVE_PREFIX, pid)),
            d3d11: None,
            d3d12: None,
            d3d10: None,
            d3d9: None,
            gl_interop: None,
        };
        free_state(&mut state);
        return None;
    }

    Some(HookState {
        info_map,
        frame_map,
        ready_event,
        stop_event,
        mutexes,
        info,
        frame_base,
        frame_buffer_capacity,
        next_frame_index: 0,
        scratch: Vec::new(),
        last_frame_ns: 0,
        keepalive_name: wide(&object_name(GAME_CAPTURE_KEEPALIVE_PREFIX, pid)),
        d3d11: None,
        d3d12: None,
        d3d10: None,
        d3d9: None,
        gl_interop: None,
    })
}

unsafe fn free_state(state: &mut HookState) {
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

pub(crate) unsafe fn ensure_state() -> Option<&'static mut HookState> {
    if STATE.is_none() {
        STATE = open_ipc();
    }
    STATE.as_mut()
}

pub(crate) unsafe fn clear_state() {
    if let Some(mut state) = STATE.take() {
        free_state(&mut state);
    }
    reset_d3d12_queue_candidates();
}

pub(crate) fn now_ns() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as u64)
        .unwrap_or(0)
}

pub(crate) fn now_us() -> i64 {
    (now_ns() / 1_000) as i64
}

pub(crate) unsafe fn mark_present(state: &mut HookState, api: u32) {
    let info = &mut *state.info;
    info.api_type = api;
    if host_supports_present_clock(info.version) {
        info.present_clock = GAME_CAPTURE_PRESENT_CLOCK_QPC;
        info.last_present_timestamp_us = qpc_now_us();
    } else {
        info.last_present_timestamp_us = now_us();
    }
}

pub(crate) unsafe fn record_dropped_frame(state: &mut HookState) {
    let info = &mut *state.info;
    info.dropped_frame_counter = info.dropped_frame_counter.wrapping_add(1);
}

pub(crate) unsafe fn set_fallback_reason(state: &mut HookState, reason: u32) {
    (*state.info).fallback_reason = reason;
}

pub(crate) unsafe fn set_capture_flags(state: &mut HookState, flags: u32) {
    (*state.info).capture_flags = flags;
}

static VERBOSE_LOG_PATH: std::sync::OnceLock<Option<std::path::PathBuf>> =
    std::sync::OnceLock::new();

fn verbose_log_path() -> &'static Option<std::path::PathBuf> {
    VERBOSE_LOG_PATH.get_or_init(|| {
        if !env_flag_enabled(ENV_VERBOSE) {
            return None;
        }
        let mut path = std::env::temp_dir();
        path.push(format!("fluxer-game-hook-{}.log", current_pid()));
        Some(path)
    })
}

pub(crate) fn verbose_log(message: &str) {
    let Some(path) = verbose_log_path() else {
        return;
    };
    let text = format!("[fluxer-game-hook] {message}");

    {
        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            let _ = writeln!(
                file,
                "[{} pid={}] {text}",
                now_ns() / 1_000_000,
                current_pid()
            );
        }
    }

    let line = wide(&text);
    unsafe {
        windows_sys::Win32::System::Diagnostics::Debug::OutputDebugStringW(line.as_ptr());
    }
    use std::io::Write;
    let _ = writeln!(std::io::stderr(), "{text}");
}

pub(crate) unsafe fn capture_should_run(state: &mut HookState) -> bool {
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

unsafe fn client_size_from_hdc(hdc: HDC) -> Option<(HWND, u32, u32)> {
    let hwnd = WindowFromDC(hdc);
    if hwnd.is_null() || IsWindow(hwnd) == 0 {
        return None;
    }
    let mut rect = mem::zeroed();
    if GetClientRect(hwnd, &mut rect) == 0 {
        return None;
    }
    let width = (rect.right - rect.left).max(1) as u32;
    let height = (rect.bottom - rect.top).max(1) as u32;
    Some((hwnd, width, height))
}

pub(crate) unsafe fn frame_due(state: &mut HookState) -> bool {
    let info = &*state.info;
    let interval = info.target_frame_interval_ns;
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

pub(crate) unsafe fn write_bgra_rows_to_shared_memory(
    state: &mut HookState,
    hwnd: HWND,
    width: u32,
    height: u32,
    src_base: *const u8,
    src_row_pitch: usize,
    flip_vertical: bool,
    format_mode: D3d11FormatMode,
) -> bool {
    if src_base.is_null() {
        (*state.info).state = GAME_CAPTURE_STATE_ERROR;
        (*state.info).last_error = 2;
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
        (*state.info).last_error = 1;
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
    let mut wait = WaitForSingleObject(mutex, 0);
    if wait != WAIT_OBJECT_0 && wait != WAIT_ABANDONED {
        index = (index + 1) % GAME_CAPTURE_BUFFER_COUNT;
        mutex = state.mutexes[index];
        wait = WaitForSingleObject(mutex, 0);
    }
    if wait != WAIT_OBJECT_0 && wait != WAIT_ABANDONED {
        record_dropped_frame(state);
        return false;
    }

    let row_bytes = (width * 4) as usize;
    let dst_base = state.frame_base.add(state.frame_buffer_capacity * index);
    for y in 0..height as usize {
        let src_y = if flip_vertical {
            height as usize - 1 - y
        } else {
            y
        };
        let src = src_base.add(src_y * src_row_pitch);
        let dst = dst_base.add(y * row_bytes);
        match format_mode {
            D3d11FormatMode::Bgra => std::ptr::copy_nonoverlapping(src, dst, row_bytes),
            D3d11FormatMode::Rgba => {
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
    info.hwnd = hwnd as usize as u64;
    info.width = width;
    info.height = height;
    info.pitch = width * 4;
    info.frame_index = index as u32;
    info.frame_counter = info.frame_counter.wrapping_add(1);
    info.timestamp_us = now_us();
    info.transport = GAME_CAPTURE_TRANSPORT_MEMORY;
    info.dxgi_format = 0;
    info.texture_handle = 0;
    info.state = GAME_CAPTURE_STATE_ACTIVE;
    state.next_frame_index = (index + 1) % GAME_CAPTURE_BUFFER_COUNT;

    ReleaseMutex(mutex);
    SetEvent(state.ready_event);
    true
}

pub(crate) unsafe fn publish_shared_texture_frame(
    state: &mut HookState,
    hwnd: HWND,
    width: u32,
    height: u32,
    dxgi_format: DXGI_FORMAT,
    shared_handle: u64,
) -> bool {
    let max_width = (*state.info).max_width;
    let max_height = (*state.info).max_height;
    if width == 0 || height == 0 || width > max_width || height > max_height {
        (*state.info).state = GAME_CAPTURE_STATE_RESIZE_REQUIRED;
        (*state.info).width = width;
        (*state.info).height = height;
        return false;
    }
    if shared_handle == 0 {
        (*state.info).state = GAME_CAPTURE_STATE_ERROR;
        (*state.info).last_error = 40;
        return false;
    }

    let info = &mut *state.info;
    info.hwnd = hwnd as usize as u64;
    info.width = width;
    info.height = height;
    info.pitch = width * 4;
    info.frame_index = 0;
    info.frame_counter = info.frame_counter.wrapping_add(1);
    info.timestamp_us = now_us();
    info.transport = GAME_CAPTURE_TRANSPORT_SHARED_TEXTURE;
    info.dxgi_format = dxgi_format.0 as u32;
    info.texture_handle = shared_handle;
    info.state = GAME_CAPTURE_STATE_ACTIVE;
    SetEvent(state.ready_event);
    true
}

unsafe fn gl_bind_buffer_proc() -> Option<GlBindBufferFn> {
    static GL_BIND_BUFFER: OnceLock<Option<GlBindBufferFn>> = OnceLock::new();
    *GL_BIND_BUFFER.get_or_init(|| {
        let Some(proc) = wglGetProcAddress(c"glBindBuffer".as_ptr().cast()) else {
            return None;
        };
        let address = proc as usize;
        if address <= 3 || address == usize::MAX {
            return None;
        }
        Some(mem::transmute::<
            unsafe extern "system" fn() -> isize,
            GlBindBufferFn,
        >(proc))
    })
}

unsafe fn write_frame_to_shared_memory(
    state: &mut HookState,
    hwnd: HWND,
    width: u32,
    height: u32,
) -> bool {
    let Some(bytes) = frame_buffer_size(width, height) else {
        (*state.info).state = GAME_CAPTURE_STATE_ERROR;
        (*state.info).last_error = 1;
        return false;
    };
    if state.scratch.len() != bytes {
        state.scratch.resize(bytes, 0);
    }

    let mut previous_read_buffer = 0i32;
    let mut prev_alignment = 4i32;
    let mut prev_row_length = 0i32;
    let mut prev_skip_pixels = 0i32;
    let mut prev_skip_rows = 0i32;
    let mut prev_swap_bytes = 0i32;
    let mut prev_lsb_first = 0i32;
    let mut prev_pack_buffer = 0i32;
    glGetIntegerv(GL_READ_BUFFER, &mut previous_read_buffer);
    glGetIntegerv(GL_PACK_ALIGNMENT, &mut prev_alignment);
    glGetIntegerv(GL_PACK_ROW_LENGTH, &mut prev_row_length);
    glGetIntegerv(GL_PACK_SKIP_PIXELS, &mut prev_skip_pixels);
    glGetIntegerv(GL_PACK_SKIP_ROWS, &mut prev_skip_rows);
    glGetIntegerv(GL_PACK_SWAP_BYTES, &mut prev_swap_bytes);
    glGetIntegerv(GL_PACK_LSB_FIRST, &mut prev_lsb_first);
    glGetIntegerv(GL_PIXEL_PACK_BUFFER_BINDING, &mut prev_pack_buffer);

    glReadBuffer(GL_BACK);
    let bind_buffer = if prev_pack_buffer != 0 {
        match gl_bind_buffer_proc() {
            Some(bind_buffer) => {
                bind_buffer(GL_PIXEL_PACK_BUFFER, 0);
                Some(bind_buffer)
            }
            None => {
                record_dropped_frame(state);
                return false;
            }
        }
    } else {
        None
    };
    glPixelStorei(GL_PACK_ALIGNMENT, 4);
    glPixelStorei(GL_PACK_ROW_LENGTH, 0);
    glPixelStorei(GL_PACK_SKIP_PIXELS, 0);
    glPixelStorei(GL_PACK_SKIP_ROWS, 0);
    glPixelStorei(GL_PACK_SWAP_BYTES, 0);
    glPixelStorei(GL_PACK_LSB_FIRST, 0);
    glReadPixels(
        0,
        0,
        width as i32,
        height as i32,
        GL_BGRA_EXT,
        GL_UNSIGNED_BYTE,
        state.scratch.as_mut_ptr().cast(),
    );

    glReadBuffer(previous_read_buffer as u32);
    glPixelStorei(GL_PACK_ALIGNMENT, prev_alignment);
    glPixelStorei(GL_PACK_ROW_LENGTH, prev_row_length);
    glPixelStorei(GL_PACK_SKIP_PIXELS, prev_skip_pixels);
    glPixelStorei(GL_PACK_SKIP_ROWS, prev_skip_rows);
    glPixelStorei(GL_PACK_SWAP_BYTES, prev_swap_bytes);
    glPixelStorei(GL_PACK_LSB_FIRST, prev_lsb_first);
    if let Some(bind_buffer) = bind_buffer {
        bind_buffer(GL_PIXEL_PACK_BUFFER, prev_pack_buffer as u32);
    }

    write_bgra_rows_to_shared_memory(
        state,
        hwnd,
        width,
        height,
        state.scratch.as_ptr(),
        (width * 4) as usize,
        true,
        D3d11FormatMode::Bgra,
    )
}

unsafe fn capture_opengl_frame(hdc: HDC) {
    if !HOOKS_READY.load(Ordering::Acquire) {
        return;
    }
    let should_continue = {
        let Some(state) = ensure_state() else {
            return;
        };
        capture_should_run(state)
    };
    if !should_continue {
        clear_state();
        return;
    }
    let Some(state) = ensure_state() else {
        return;
    };
    mark_present(state, GAME_CAPTURE_API_OPENGL);
    set_fallback_reason(state, GAME_CAPTURE_FALLBACK_NONE);
    if !frame_due(state) {
        record_dropped_frame(state);
        return;
    }
    let Some((hwnd, width, height)) = client_size_from_hdc(hdc) else {
        return;
    };

    let force_cpu = env_flag_enabled(ENV_FORCE_CPU);
    let enable_shared_texture = env_flag_enabled(ENV_ENABLE_OPENGL_SHARED_TEXTURE)
        || env_flag_enabled(ENV_FORCE_SHARED_TEXTURE);
    let disable_shared_texture = !enable_shared_texture
        || env_flag_enabled(ENV_DISABLE_OPENGL_SHARED_TEXTURE)
        || ((*state.info).control & GAME_CAPTURE_CONTROL_DISABLE_SHARED_TEXTURE) != 0;
    if disable_shared_texture {
        if state.gl_interop.is_some() {
            verbose_log("opengl interop: shared texture disabled; using memory fallback");
        }
        state.gl_interop = None;
    }

    if !force_cpu
        && !disable_shared_texture
        && !gl_interop::gpu_path_disabled()
        && gl_interop::capture_opengl_frame_gpu(state, hwnd, width, height)
    {
        return;
    }

    set_capture_flags(state, GAME_CAPTURE_FLAG_FLIP_VERTICAL);
    if force_cpu {
        set_fallback_reason(state, GAME_CAPTURE_FALLBACK_FORCED_CPU);
    } else if disable_shared_texture || gl_interop::gpu_path_disabled() {
        set_fallback_reason(state, GAME_CAPTURE_FALLBACK_SHARED_TEXTURE_UNSUPPORTED);
    }
    let _ = write_frame_to_shared_memory(state, hwnd, width, height);
}

fn d3d11_format_mode(format: DXGI_FORMAT) -> Option<D3d11FormatMode> {
    if format == DXGI_FORMAT_B8G8R8A8_UNORM
        || format == DXGI_FORMAT_B8G8R8A8_UNORM_SRGB
        || format == DXGI_FORMAT_B8G8R8X8_UNORM
        || format == DXGI_FORMAT_B8G8R8X8_UNORM_SRGB
    {
        Some(D3d11FormatMode::Bgra)
    } else if format == DXGI_FORMAT_R8G8B8A8_UNORM || format == DXGI_FORMAT_R8G8B8A8_UNORM_SRGB {
        Some(D3d11FormatMode::Rgba)
    } else {
        None
    }
}

fn dxgi_hdr_flags(format: DXGI_FORMAT) -> u32 {
    if format == DXGI_FORMAT_R10G10B10A2_UNORM || format == DXGI_FORMAT_R10G10B10_XR_BIAS_A2_UNORM {
        GAME_CAPTURE_FLAG_TEN_BIT | GAME_CAPTURE_FLAG_HDR
    } else if format == DXGI_FORMAT_R16G16B16A16_FLOAT || format == DXGI_FORMAT_R16G16B16A16_UNORM {
        GAME_CAPTURE_FLAG_HDR
    } else {
        0
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum DxgiCapturePlan {
    Sdr8 { format_mode: D3d11FormatMode },
    HdrShared { flags: u32 },
    Unsupported,
}

fn dxgi_capture_plan(format: DXGI_FORMAT, force_cpu: bool) -> DxgiCapturePlan {
    if let Some(format_mode) = d3d11_format_mode(format) {
        return DxgiCapturePlan::Sdr8 { format_mode };
    }
    let hdr_flags = dxgi_hdr_flags(format);
    if hdr_flags != 0 {
        if force_cpu {
            return DxgiCapturePlan::Unsupported;
        }
        return DxgiCapturePlan::HdrShared { flags: hdr_flags };
    }
    DxgiCapturePlan::Unsupported
}

unsafe fn publish_d3d11_staging_cpu(
    state: &mut HookState,
    context: &ID3D11DeviceContext,
    staging: &ID3D11Texture2D,
    hwnd: HWND,
    width: u32,
    height: u32,
    format_mode: D3d11FormatMode,
) -> bool {
    use windows::Win32::Graphics::Direct3D11::D3D11_MAPPED_SUBRESOURCE;
    let resource: ID3D11Resource = match staging.cast() {
        Ok(resource) => resource,
        Err(_) => {
            record_dropped_frame(state);
            return false;
        }
    };
    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    if context
        .Map(&resource, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
        .is_err()
    {
        record_dropped_frame(state);
        return false;
    }
    let published = write_bgra_rows_to_shared_memory(
        state,
        hwnd,
        width,
        height,
        mapped.pData as *const u8,
        mapped.RowPitch as usize,
        false,
        format_mode,
    );
    context.Unmap(&resource, 0);
    published
}

unsafe fn d3d11_state_for_frame<'a>(
    state: &'a mut HookState,
    device_ptr: usize,
    context: ID3D11DeviceContext,
    device: &windows::Win32::Graphics::Direct3D11::ID3D11Device,
    desc: &D3D11_TEXTURE2D_DESC,
    format_mode: D3d11FormatMode,
    force_cpu: bool,
) -> Option<&'a mut D3d11CaptureState> {
    let sample_count = desc.SampleDesc.Count.max(1);
    let recreate = state
        .d3d11
        .as_ref()
        .map(|capture| {
            capture.device_ptr != device_ptr
                || capture.width != desc.Width
                || capture.height != desc.Height
                || capture.format != desc.Format
                || capture.sample_count != sample_count
                || capture.force_cpu != force_cpu
        })
        .unwrap_or(true);
    if recreate {
        let mut copy_desc = *desc;
        copy_desc.MipLevels = 1;
        copy_desc.ArraySize = 1;
        copy_desc.SampleDesc.Count = 1;
        copy_desc.SampleDesc.Quality = 0;
        copy_desc.Usage = D3D11_USAGE_DEFAULT;
        copy_desc.BindFlags = (D3D11_BIND_SHADER_RESOURCE.0 | D3D11_BIND_RENDER_TARGET.0) as u32;
        copy_desc.CPUAccessFlags = 0;
        copy_desc.MiscFlags = if force_cpu {
            0
        } else {
            D3D11_RESOURCE_MISC_SHARED.0 as u32
        };
        let mut texture = None;
        if device
            .CreateTexture2D(&copy_desc, None, Some(&mut texture))
            .is_err()
        {
            (*state.info).state = GAME_CAPTURE_STATE_ERROR;
            (*state.info).last_error = 20;
            return None;
        }
        let Some(texture) = texture else {
            (*state.info).state = GAME_CAPTURE_STATE_ERROR;
            (*state.info).last_error = 20;
            return None;
        };

        let (staging, shared_handle) = if force_cpu {
            let mut staging_desc = copy_desc;
            staging_desc.Usage = D3D11_USAGE_STAGING;
            staging_desc.BindFlags = 0;
            staging_desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
            staging_desc.MiscFlags = 0;
            let mut staging = None;
            if device
                .CreateTexture2D(&staging_desc, None, Some(&mut staging))
                .is_err()
            {
                (*state.info).state = GAME_CAPTURE_STATE_ERROR;
                (*state.info).last_error = 22;
                return None;
            }
            (staging, 0u64)
        } else {
            let handle = match texture
                .cast::<IDXGIResource>()
                .and_then(|resource| resource.GetSharedHandle())
            {
                Ok(handle) => handle.0 as usize as u64,
                Err(_) => {
                    (*state.info).state = GAME_CAPTURE_STATE_ERROR;
                    (*state.info).last_error = 21;
                    return None;
                }
            };
            (None, handle)
        };

        state.d3d11 = Some(D3d11CaptureState {
            device_ptr,
            context,
            texture,
            staging,
            shared_handle,
            width: desc.Width,
            height: desc.Height,
            format: desc.Format,
            format_mode,
            sample_count,
            force_cpu,
        });
    }
    state.d3d11.as_mut()
}

unsafe fn capture_d3d11_frame(swap_chain: *mut c_void) {
    if !HOOKS_READY.load(Ordering::Acquire) {
        return;
    }
    let should_continue = {
        let Some(state) = ensure_state() else {
            return;
        };
        capture_should_run(state)
    };
    if !should_continue {
        clear_state();
        return;
    }
    let Some(state) = ensure_state() else {
        return;
    };

    let Some(swap_chain) = IDXGISwapChain::from_raw_borrowed(&swap_chain) else {
        return;
    };
    let swap_desc = swap_chain.GetDesc().ok();
    let hwnd = swap_desc
        .as_ref()
        .map(|desc| desc.OutputWindow.0 as HWND)
        .filter(|hwnd| !hwnd.is_null())
        .unwrap_or((*state.info).hwnd as usize as HWND);

    if swap_chain.GetDevice::<ID3D10Device>().is_ok() {
        capture_d3d10_frame_impl(state, swap_chain, hwnd);
        return;
    }

    let Ok(back_buffer) = swap_chain.GetBuffer::<ID3D11Texture2D>(0) else {
        return;
    };
    let mut desc = D3D11_TEXTURE2D_DESC::default();
    back_buffer.GetDesc(&mut desc);
    if desc.Width == 0 || desc.Height == 0 {
        return;
    }
    let multisampled = desc.SampleDesc.Count > 1;
    let force_cpu = env_flag_enabled(ENV_FORCE_CPU);

    let (format_mode, hdr_flags) = match dxgi_capture_plan(desc.Format, force_cpu) {
        DxgiCapturePlan::Sdr8 { format_mode } => (format_mode, 0u32),
        DxgiCapturePlan::HdrShared { flags } => (D3d11FormatMode::Bgra, flags),
        DxgiCapturePlan::Unsupported => {
            mark_present(state, GAME_CAPTURE_API_D3D11);
            set_capture_flags(state, dxgi_hdr_flags(desc.Format));
            set_fallback_reason(state, GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED);
            record_dropped_frame(state);
            return;
        }
    };

    mark_present(state, GAME_CAPTURE_API_D3D11);
    let mut flags = hdr_flags;
    if multisampled {
        flags |= GAME_CAPTURE_FLAG_MULTISAMPLED;
    }
    set_capture_flags(state, flags);
    set_fallback_reason(
        state,
        if force_cpu {
            GAME_CAPTURE_FALLBACK_FORCED_CPU
        } else {
            GAME_CAPTURE_FALLBACK_NONE
        },
    );

    if !frame_due(state) {
        record_dropped_frame(state);
        return;
    }
    let Ok(device) = back_buffer.GetDevice() else {
        record_dropped_frame(state);
        return;
    };
    let Ok(context) = device.GetImmediateContext() else {
        record_dropped_frame(state);
        return;
    };
    let device_ptr = device.as_raw() as usize;
    let (context, texture, staging, shared_handle) = {
        let Some(capture_state) = d3d11_state_for_frame(
            state,
            device_ptr,
            context,
            &device,
            &desc,
            format_mode,
            force_cpu,
        ) else {
            record_dropped_frame(state);
            return;
        };
        (
            capture_state.context.clone(),
            capture_state.texture.clone(),
            capture_state.staging.clone(),
            capture_state.shared_handle,
        )
    };

    if multisampled {
        context.ResolveSubresource(&texture, 0, &back_buffer, 0, desc.Format);
    } else {
        context.CopyResource(&texture, &back_buffer);
    }

    if force_cpu {
        let Some(staging) = staging else {
            record_dropped_frame(state);
            return;
        };
        context.CopyResource(&staging, &texture);
        context.Flush();
        let _ = publish_d3d11_staging_cpu(
            state,
            &context,
            &staging,
            hwnd,
            desc.Width,
            desc.Height,
            format_mode,
        );
        return;
    }

    context.Flush();
    let _ = publish_shared_texture_frame(
        state,
        hwnd,
        desc.Width,
        desc.Height,
        desc.Format,
        shared_handle,
    );
}

unsafe fn d3d10_state_for_frame<'a>(
    state: &'a mut HookState,
    device_ptr: usize,
    device: &ID3D10Device,
    desc: &D3D10_TEXTURE2D_DESC,
    format_mode: D3d11FormatMode,
    force_cpu: bool,
) -> Option<&'a mut D3d10CaptureState> {
    let sample_count = desc.SampleDesc.Count.max(1);
    let recreate = state
        .d3d10
        .as_ref()
        .map(|capture| {
            capture.device_ptr != device_ptr
                || capture.width != desc.Width
                || capture.height != desc.Height
                || capture.format != desc.Format
                || capture.sample_count != sample_count
                || capture.force_cpu != force_cpu
        })
        .unwrap_or(true);
    if recreate {
        let mut copy_desc = *desc;
        copy_desc.MipLevels = 1;
        copy_desc.ArraySize = 1;
        copy_desc.SampleDesc.Count = 1;
        copy_desc.SampleDesc.Quality = 0;
        copy_desc.Usage = D3D10_USAGE_DEFAULT;
        copy_desc.BindFlags = (D3D10_BIND_SHADER_RESOURCE.0 | D3D10_BIND_RENDER_TARGET.0) as u32;
        copy_desc.CPUAccessFlags = 0;
        copy_desc.MiscFlags = if force_cpu {
            0
        } else {
            D3D10_RESOURCE_MISC_SHARED.0 as u32
        };
        let texture = match device.CreateTexture2D(&copy_desc, None) {
            Ok(texture) => texture,
            Err(_) => {
                (*state.info).state = GAME_CAPTURE_STATE_ERROR;
                (*state.info).last_error = 50;
                return None;
            }
        };

        let (staging, shared_handle) = if force_cpu {
            use windows::Win32::Graphics::Direct3D10::{
                D3D10_CPU_ACCESS_READ, D3D10_USAGE_STAGING,
            };
            let mut staging_desc = copy_desc;
            staging_desc.Usage = D3D10_USAGE_STAGING;
            staging_desc.BindFlags = 0;
            staging_desc.CPUAccessFlags = D3D10_CPU_ACCESS_READ.0 as u32;
            staging_desc.MiscFlags = 0;
            let staging = match device.CreateTexture2D(&staging_desc, None) {
                Ok(staging) => staging,
                Err(_) => {
                    (*state.info).state = GAME_CAPTURE_STATE_ERROR;
                    (*state.info).last_error = 52;
                    return None;
                }
            };
            (Some(staging), 0u64)
        } else {
            let handle = match texture
                .cast::<IDXGIResource>()
                .and_then(|resource| resource.GetSharedHandle())
            {
                Ok(handle) => handle.0 as usize as u64,
                Err(_) => {
                    (*state.info).state = GAME_CAPTURE_STATE_ERROR;
                    (*state.info).last_error = 51;
                    return None;
                }
            };
            (None, handle)
        };

        state.d3d10 = Some(D3d10CaptureState {
            device_ptr,
            device: device.clone(),
            texture,
            staging,
            shared_handle,
            width: desc.Width,
            height: desc.Height,
            format: desc.Format,
            format_mode,
            sample_count,
            force_cpu,
        });
    }
    state.d3d10.as_mut()
}

unsafe fn publish_d3d10_staging_cpu(
    state: &mut HookState,
    staging: &ID3D10Texture2D,
    hwnd: HWND,
    width: u32,
    height: u32,
    format_mode: D3d11FormatMode,
) -> bool {
    use windows::Win32::Graphics::Direct3D10::D3D10_MAP_READ;
    let mapped = match staging.Map(0, D3D10_MAP_READ, 0) {
        Ok(mapped) => mapped,
        Err(_) => {
            record_dropped_frame(state);
            return false;
        }
    };
    let published = write_bgra_rows_to_shared_memory(
        state,
        hwnd,
        width,
        height,
        mapped.pData as *const u8,
        mapped.RowPitch as usize,
        false,
        format_mode,
    );
    staging.Unmap(0);
    published
}

unsafe fn capture_d3d10_frame_impl(state: &mut HookState, swap_chain: &IDXGISwapChain, hwnd: HWND) {
    let Ok(back_buffer) = swap_chain.GetBuffer::<ID3D10Texture2D>(0) else {
        return;
    };
    let mut desc = D3D10_TEXTURE2D_DESC::default();
    back_buffer.GetDesc(&mut desc);
    if desc.Width == 0 || desc.Height == 0 {
        return;
    }
    let multisampled = desc.SampleDesc.Count > 1;
    let force_cpu = env_flag_enabled(ENV_FORCE_CPU);

    let (format_mode, hdr_flags) = match dxgi_capture_plan(desc.Format, force_cpu) {
        DxgiCapturePlan::Sdr8 { format_mode } => (format_mode, 0u32),
        DxgiCapturePlan::HdrShared { flags } => (D3d11FormatMode::Bgra, flags),
        DxgiCapturePlan::Unsupported => {
            mark_present(state, GAME_CAPTURE_API_D3D10);
            set_capture_flags(state, dxgi_hdr_flags(desc.Format));
            set_fallback_reason(state, GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED);
            record_dropped_frame(state);
            return;
        }
    };

    mark_present(state, GAME_CAPTURE_API_D3D10);
    let mut flags = hdr_flags;
    if multisampled {
        flags |= GAME_CAPTURE_FLAG_MULTISAMPLED;
    }
    set_capture_flags(state, flags);
    set_fallback_reason(
        state,
        if force_cpu {
            GAME_CAPTURE_FALLBACK_FORCED_CPU
        } else {
            GAME_CAPTURE_FALLBACK_NONE
        },
    );

    if !frame_due(state) {
        record_dropped_frame(state);
        return;
    }

    let Ok(device) = swap_chain.GetDevice::<ID3D10Device>() else {
        record_dropped_frame(state);
        return;
    };
    let device_ptr = device.as_raw() as usize;
    let (device, texture, staging, shared_handle) = {
        let Some(capture_state) =
            d3d10_state_for_frame(state, device_ptr, &device, &desc, format_mode, force_cpu)
        else {
            record_dropped_frame(state);
            return;
        };
        (
            capture_state.device.clone(),
            capture_state.texture.clone(),
            capture_state.staging.clone(),
            capture_state.shared_handle,
        )
    };

    if multisampled {
        device.ResolveSubresource(&texture, 0, &back_buffer, 0, desc.Format);
    } else {
        device.CopyResource(&texture, &back_buffer);
    }

    if force_cpu {
        let Some(staging) = staging else {
            record_dropped_frame(state);
            return;
        };
        device.CopyResource(&staging, &texture);
        device.Flush();
        let _ =
            publish_d3d10_staging_cpu(state, &staging, hwnd, desc.Width, desc.Height, format_mode);
        return;
    }

    device.Flush();
    let _ = publish_shared_texture_frame(
        state,
        hwnd,
        desc.Width,
        desc.Height,
        desc.Format,
        shared_handle,
    );
}

unsafe fn reset_d3d12_queue_candidates() {
    if let Ok(mut candidates) = D3D12_QUEUE_CANDIDATES.lock() {
        candidates.clear();
    }
    DXGI_PRESENT_ATTEMPTED.store(false, Ordering::Release);
}

unsafe fn remember_d3d12_queue_candidate(queue: *mut c_void) {
    if queue.is_null() {
        return;
    }
    let Some(queue_ref) = ID3D12CommandQueue::from_raw_borrowed(&queue) else {
        return;
    };
    if queue_ref.GetDesc().Type != D3D12_COMMAND_LIST_TYPE_DIRECT {
        return;
    }
    let Ok(mut candidates) = D3D12_QUEUE_CANDIDATES.lock() else {
        return;
    };
    if candidates
        .iter()
        .any(|candidate| candidate.as_raw() == queue)
    {
        return;
    }
    if candidates.len() < MAX_D3D12_QUEUE_CANDIDATES {
        candidates.push(queue_ref.clone());
    }
}

unsafe fn create_d3d11_on_d3d12(
    device12: &ID3D12Device,
) -> Option<(ID3D11Device, ID3D11DeviceContext, ID3D11On12Device)> {
    let Ok(device_unknown) = device12.cast::<IUnknown>() else {
        return None;
    };
    let candidates = D3D12_QUEUE_CANDIDATES.lock().ok()?.clone();
    for queue in candidates {
        if queue.GetDesc().Type != D3D12_COMMAND_LIST_TYPE_DIRECT {
            continue;
        }
        let Ok(queue_unknown) = queue.cast::<IUnknown>() else {
            continue;
        };
        let queues = [Some(queue_unknown)];
        let mut device11 = None;
        let mut context11 = None;
        if D3D11On12CreateDevice(
            &device_unknown,
            0,
            None,
            Some(&queues),
            0,
            Some(&mut device11),
            Some(&mut context11),
            None,
        )
        .is_err()
        {
            continue;
        }
        let Some(device11) = device11 else {
            continue;
        };
        let Some(context11) = context11 else {
            continue;
        };
        let Ok(device11on12) = device11.cast::<ID3D11On12Device>() else {
            continue;
        };
        return Some((device11, context11, device11on12));
    }
    None
}

unsafe fn d3d12_backbuffer_count(desc: &DXGI_SWAP_CHAIN_DESC) -> u32 {
    if desc.SwapEffect == DXGI_SWAP_EFFECT_DISCARD {
        1
    } else {
        desc.BufferCount.max(1)
    }
}

unsafe fn d3d12_state_for_frame<'a>(
    state: &'a mut HookState,
    swap_chain: &IDXGISwapChain,
    device_ptr: usize,
    device12: &ID3D12Device,
    desc: &DXGI_SWAP_CHAIN_DESC,
    format_mode: D3d11FormatMode,
    force_cpu: bool,
) -> Option<&'a mut D3d12CaptureState> {
    let backbuffer_count = d3d12_backbuffer_count(desc);
    let recreate = state
        .d3d12
        .as_ref()
        .map(|capture| {
            capture.device_ptr != device_ptr
                || capture.width != desc.BufferDesc.Width
                || capture.height != desc.BufferDesc.Height
                || capture.format != desc.BufferDesc.Format
                || capture.backbuffer_count != backbuffer_count
                || capture.force_cpu != force_cpu
        })
        .unwrap_or(true);
    if recreate {
        let Some((device11, context11, device11on12)) = create_d3d11_on_d3d12(device12) else {
            return None;
        };
        let copy_desc = D3D11_TEXTURE2D_DESC {
            Width: desc.BufferDesc.Width,
            Height: desc.BufferDesc.Height,
            MipLevels: 1,
            ArraySize: 1,
            Format: desc.BufferDesc.Format,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: (D3D11_BIND_SHADER_RESOURCE.0 | D3D11_BIND_RENDER_TARGET.0) as u32,
            CPUAccessFlags: 0,
            MiscFlags: if force_cpu {
                0
            } else {
                D3D11_RESOURCE_MISC_SHARED.0 as u32
            },
        };
        let mut copy_tex = None;
        if device11
            .CreateTexture2D(&copy_desc, None, Some(&mut copy_tex))
            .is_err()
        {
            (*state.info).state = GAME_CAPTURE_STATE_ERROR;
            (*state.info).last_error = 30;
            return None;
        }
        state.d3d12 = match copy_tex {
            Some(copy_tex) => {
                let (staging, shared_handle) = if force_cpu {
                    let mut staging_desc = copy_desc;
                    staging_desc.Usage = D3D11_USAGE_STAGING;
                    staging_desc.BindFlags = 0;
                    staging_desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
                    staging_desc.MiscFlags = 0;
                    let mut staging = None;
                    if device11
                        .CreateTexture2D(&staging_desc, None, Some(&mut staging))
                        .is_err()
                    {
                        (*state.info).state = GAME_CAPTURE_STATE_ERROR;
                        (*state.info).last_error = 32;
                        return None;
                    }
                    (staging, 0u64)
                } else {
                    let handle = match copy_tex
                        .cast::<IDXGIResource>()
                        .and_then(|resource| resource.GetSharedHandle())
                    {
                        Ok(handle) => handle.0 as usize as u64,
                        Err(_) => {
                            (*state.info).state = GAME_CAPTURE_STATE_ERROR;
                            (*state.info).last_error = 31;
                            return None;
                        }
                    };
                    (None, handle)
                };
                Some(D3d12CaptureState {
                    device_ptr,
                    device11,
                    context11,
                    device11on12,
                    copy_tex,
                    staging,
                    shared_handle,
                    width: desc.BufferDesc.Width,
                    height: desc.BufferDesc.Height,
                    format: desc.BufferDesc.Format,
                    format_mode,
                    backbuffer_count,
                    current_backbuffer: 0,
                    dxgi14: backbuffer_count > 1 && swap_chain.cast::<IDXGISwapChain3>().is_ok(),
                    force_cpu,
                })
            }
            _ => None,
        };
    }
    state.d3d12.as_mut()
}

unsafe fn capture_d3d12_frame(swap_chain: *mut c_void) {
    if !HOOKS_READY.load(Ordering::Acquire) {
        return;
    }
    if env_flag_enabled(ENV_DISABLE_D3D12) {
        return;
    }
    let should_continue = {
        let Some(state) = ensure_state() else {
            return;
        };
        capture_should_run(state)
    };
    if !should_continue {
        clear_state();
        return;
    }
    let Some(state) = ensure_state() else {
        return;
    };

    let Some(swap_chain) = IDXGISwapChain::from_raw_borrowed(&swap_chain) else {
        return;
    };
    let Ok(desc) = swap_chain.GetDesc() else {
        return;
    };
    let Ok(device12) = swap_chain.GetDevice::<ID3D12Device>() else {
        return;
    };
    if desc.BufferDesc.Width == 0 || desc.BufferDesc.Height == 0 {
        return;
    }
    if desc.SampleDesc.Count != 1 {
        mark_present(state, GAME_CAPTURE_API_D3D12);
        set_capture_flags(state, GAME_CAPTURE_FLAG_MULTISAMPLED);
        set_fallback_reason(state, GAME_CAPTURE_FALLBACK_MULTISAMPLED);
        record_dropped_frame(state);
        return;
    }
    let force_cpu = env_flag_enabled(ENV_FORCE_CPU);
    let (format_mode, hdr_flags) = match dxgi_capture_plan(desc.BufferDesc.Format, force_cpu) {
        DxgiCapturePlan::Sdr8 { format_mode } => (format_mode, 0u32),
        DxgiCapturePlan::HdrShared { flags } => (D3d11FormatMode::Bgra, flags),
        DxgiCapturePlan::Unsupported => {
            mark_present(state, GAME_CAPTURE_API_D3D12);
            set_capture_flags(state, dxgi_hdr_flags(desc.BufferDesc.Format));
            set_fallback_reason(state, GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED);
            record_dropped_frame(state);
            return;
        }
    };
    let device_ptr = device12.as_raw() as usize;

    mark_present(state, GAME_CAPTURE_API_D3D12);
    set_capture_flags(state, hdr_flags);
    set_fallback_reason(
        state,
        if force_cpu {
            GAME_CAPTURE_FALLBACK_FORCED_CPU
        } else {
            GAME_CAPTURE_FALLBACK_NONE
        },
    );

    if !frame_due(state) {
        record_dropped_frame(state);
        return;
    }
    let (context11, device11on12, copy_tex, staging, shared_handle, backbuffer_index) = {
        let Some(capture_state) = d3d12_state_for_frame(
            state,
            swap_chain,
            device_ptr,
            &device12,
            &desc,
            format_mode,
            force_cpu,
        ) else {
            record_dropped_frame(state);
            return;
        };
        let index = if capture_state.dxgi14 {
            swap_chain
                .cast::<IDXGISwapChain3>()
                .ok()
                .map(|swap_chain3| swap_chain3.GetCurrentBackBufferIndex())
                .unwrap_or(0)
        } else {
            capture_state.current_backbuffer
        };
        if !capture_state.dxgi14 {
            capture_state.current_backbuffer =
                (capture_state.current_backbuffer + 1) % capture_state.backbuffer_count.max(1);
        }
        (
            capture_state.context11.clone(),
            capture_state.device11on12.clone(),
            capture_state.copy_tex.clone(),
            capture_state.staging.clone(),
            capture_state.shared_handle,
            index,
        )
    };

    let Ok(backbuffer12) = swap_chain.GetBuffer::<ID3D12Resource>(backbuffer_index) else {
        record_dropped_frame(state);
        return;
    };
    let mut wrapped: Option<ID3D11Resource> = None;
    let resource_flags = D3D11_RESOURCE_FLAGS::default();
    if device11on12
        .CreateWrappedResource(
            &backbuffer12,
            &resource_flags,
            D3D12_RESOURCE_STATE_PRESENT,
            D3D12_RESOURCE_STATE_PRESENT,
            &mut wrapped,
        )
        .is_err()
    {
        record_dropped_frame(state);
        return;
    }
    let Some(wrapped) = wrapped else {
        record_dropped_frame(state);
        return;
    };
    let wrapped_resources = [Some(wrapped.clone())];
    device11on12.AcquireWrappedResources(&wrapped_resources);
    context11.CopyResource(&copy_tex, &wrapped);
    device11on12.ReleaseWrappedResources(&wrapped_resources);

    let hwnd = desc.OutputWindow.0 as HWND;
    if force_cpu {
        let Some(staging) = staging else {
            record_dropped_frame(state);
            return;
        };
        context11.CopyResource(&staging, &copy_tex);
        context11.Flush();
        let _ = publish_d3d11_staging_cpu(
            state,
            &context11,
            &staging,
            hwnd,
            desc.BufferDesc.Width,
            desc.BufferDesc.Height,
            format_mode,
        );
        return;
    }

    context11.Flush();
    let _ = publish_shared_texture_frame(
        state,
        hwnd,
        desc.BufferDesc.Width,
        desc.BufferDesc.Height,
        desc.BufferDesc.Format,
        shared_handle,
    );
}

unsafe extern "system" fn swap_buffers_detour(hdc: HDC) -> BOOL {
    if !OPENGL_PRESENT_FIRED.swap(true, Ordering::AcqRel) {
        verbose_log("opengl SwapBuffers detour fired (first present)");
    }
    capture_opengl_frame(hdc);
    if let Some(hook) = SWAP_BUFFERS_HOOK.as_ref() {
        return (hook.trampoline_fn())(hdc);
    }
    0
}

unsafe extern "system" fn wgl_swap_layer_buffers_detour(hdc: HDC, flags: u32) -> BOOL {
    capture_opengl_frame(hdc);
    if let Some(hook) = WGL_SWAP_LAYER_BUFFERS_HOOK.as_ref() {
        return (hook.trampoline_fn())(hdc, flags);
    }
    0
}

unsafe extern "system" fn dxgi_present_detour(
    swap_chain: *mut c_void,
    sync_interval: u32,
    flags: u32,
) -> HRESULT {
    let suppress_capture = gl_interop::dummy_present_active();
    if !suppress_capture {
        if !DXGI_PRESENT_FIRED.swap(true, Ordering::AcqRel) {
            verbose_log("dxgi Present detour fired (first present)");
        }
        capture_d3d11_frame(swap_chain);
        capture_d3d12_frame(swap_chain);
    }
    if let Some(hook) = DXGI_PRESENT_HOOK.as_ref() {
        if !suppress_capture {
            DXGI_PRESENT_DEPTH.fetch_add(1, Ordering::AcqRel);
        }
        let result = (hook.trampoline_fn())(swap_chain, sync_interval, flags);
        if !suppress_capture {
            DXGI_PRESENT_DEPTH.fetch_sub(1, Ordering::AcqRel);
            DXGI_PRESENT_ATTEMPTED.store(true, Ordering::Release);
        }
        return result;
    }
    HRESULT(0)
}

unsafe extern "system" fn dxgi_present1_detour(
    swap_chain: *mut c_void,
    sync_interval: u32,
    flags: u32,
    present_parameters: *const DXGI_PRESENT_PARAMETERS,
) -> HRESULT {
    let suppress_capture = gl_interop::dummy_present_active();
    if !suppress_capture {
        if !DXGI_PRESENT1_FIRED.swap(true, Ordering::AcqRel) {
            verbose_log("dxgi Present1 detour fired (first present)");
        }
        capture_d3d11_frame(swap_chain);
        capture_d3d12_frame(swap_chain);
    }
    if let Some(hook) = DXGI_PRESENT1_HOOK.as_ref() {
        if !suppress_capture {
            DXGI_PRESENT_DEPTH.fetch_add(1, Ordering::AcqRel);
        }
        let result = (hook.trampoline_fn())(swap_chain, sync_interval, flags, present_parameters);
        if !suppress_capture {
            DXGI_PRESENT_DEPTH.fetch_sub(1, Ordering::AcqRel);
            DXGI_PRESENT_ATTEMPTED.store(true, Ordering::Release);
        }
        return result;
    }
    HRESULT(0)
}

unsafe extern "system" fn d3d12_execute_command_lists_detour(
    queue: *mut c_void,
    num_command_lists: u32,
    command_lists: *const *mut c_void,
) {
    if !D3D12_EXECUTE_FIRED.swap(true, Ordering::AcqRel) {
        verbose_log("d3d12 ExecuteCommandLists detour fired (first call)");
    }
    if DXGI_PRESENT_DEPTH.load(Ordering::Acquire) > 0
        || DXGI_PRESENT_ATTEMPTED.load(Ordering::Acquire)
    {
        remember_d3d12_queue_candidate(queue);
    }
    if let Some(hook) = D3D12_EXECUTE_COMMAND_LISTS_HOOK.as_ref() {
        (hook.trampoline_fn())(queue, num_command_lists, command_lists);
    }
}

unsafe extern "system" fn dummy_window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: usize,
    lparam: isize,
) -> isize {
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

unsafe fn module_loaded(module: &str) -> bool {
    let name = wide(module);
    !GetModuleHandleW(name.as_ptr()).is_null()
}

unsafe fn log_loaded_graphics_modules(tag: &str) {
    if !env_flag_enabled(ENV_VERBOSE) {
        return;
    }
    verbose_log(&format!(
        "{tag} loaded modules: d3d11={} dxgi={} d3d10={} d3d12={} opengl32={} d3d9={}",
        module_loaded("d3d11.dll"),
        module_loaded("dxgi.dll"),
        module_loaded("d3d10.dll"),
        module_loaded("d3d12.dll"),
        module_loaded("opengl32.dll"),
        module_loaded("d3d9.dll"),
    ));
}

unsafe fn create_dummy_window() -> HWND {
    let class_name = wide("FluxerGameCaptureDummyWindow");
    let instance = GetModuleHandleW(null());
    let window_class = WNDCLASSW {
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(dummy_window_proc),
        hInstance: instance,
        lpszClassName: class_name.as_ptr(),
        ..Default::default()
    };
    let _ = RegisterClassW(&window_class);
    CreateWindowExW(
        0,
        class_name.as_ptr(),
        class_name.as_ptr(),
        WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        2,
        2,
        null_mut(),
        null_mut(),
        instance,
        null(),
    )
}

unsafe fn swap_chain_method_pointers() -> Option<(*const (), Option<*const ()>)> {
    let hwnd = create_dummy_window();
    if hwnd.is_null() {
        verbose_log("d3d11 install: create_dummy_window FAILED");
        return None;
    }
    let desc = DXGI_SWAP_CHAIN_DESC {
        BufferDesc: DXGI_MODE_DESC {
            Width: 2,
            Height: 2,
            RefreshRate: DXGI_RATIONAL {
                Numerator: 60,
                Denominator: 1,
            },
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            ScanlineOrdering: DXGI_MODE_SCANLINE_ORDER_UNSPECIFIED,
            Scaling: DXGI_MODE_SCALING_UNSPECIFIED,
        },
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
        BufferCount: 1,
        OutputWindow: WinHwnd(hwnd),
        Windowed: WinBool(1),
        SwapEffect: DXGI_SWAP_EFFECT_DISCARD,
        Flags: 0,
    };
    let mut swap_chain = None;
    let result = D3D11CreateDeviceAndSwapChain(
        None,
        D3D_DRIVER_TYPE_HARDWARE,
        WinHmodule(null_mut()),
        D3D11_CREATE_DEVICE_FLAG(0),
        None,
        D3D11_SDK_VERSION,
        Some(&desc),
        Some(&mut swap_chain),
        None,
        None,
        None,
    );
    let _ = DestroyWindow(hwnd);
    if let Err(error) = result {
        verbose_log(&format!(
            "d3d11 install: D3D11CreateDeviceAndSwapChain dummy probe FAILED hr={:#010x}",
            error.code().0 as u32
        ));
        return None;
    }
    let Some(swap_chain) = swap_chain else {
        verbose_log("d3d11 install: dummy swapchain was null despite Ok HRESULT");
        return None;
    };
    let raw = swap_chain.as_raw();
    let vtable = *(raw as *mut *const *const ());
    let present = *vtable.add(8);
    let present1 = swap_chain
        .cast::<IDXGISwapChain1>()
        .ok()
        .map(|swap_chain1| {
            let raw = swap_chain1.as_raw();
            let vtable = *(raw as *mut *const *const ());
            *vtable.add(22)
        });
    verbose_log(&format!(
        "d3d11 install: dummy swapchain created, Present vtable[8]={present:p} present1_present={}",
        present1.is_some()
    ));
    Some((present, present1))
}

unsafe fn d3d12_execute_command_lists_pointer() -> Option<*const ()> {
    let module_name = wide("d3d12.dll");
    let d3d12 = GetModuleHandleW(module_name.as_ptr());
    if d3d12.is_null() {
        return None;
    }
    let create = GetProcAddress(d3d12, c"D3D12CreateDevice".as_ptr().cast())?;
    let create: D3d12CreateDeviceFn = mem::transmute(create);
    let mut device = null_mut();
    if create(
        null_mut(),
        D3D_FEATURE_LEVEL_11_0,
        &ID3D12Device::IID,
        &mut device,
    )
    .is_err()
    {
        return None;
    }
    let device = ID3D12Device::from_raw(device);
    let queue_desc = D3D12_COMMAND_QUEUE_DESC {
        Type: D3D12_COMMAND_LIST_TYPE_DIRECT,
        ..Default::default()
    };
    let queue: ID3D12CommandQueue = device.CreateCommandQueue(&queue_desc).ok()?;
    let raw = queue.as_raw();
    let vtable = *(raw as *mut *const *const ());
    Some(*vtable.add(10))
}

unsafe fn d3d11_hooks_installed() -> bool {
    DXGI_PRESENT_HOOK.is_some()
}

unsafe fn install_d3d11_hooks() {
    if DXGI_PRESENT_HOOK.is_some() {
        return;
    }
    let Some((present, present1)) = swap_chain_method_pointers() else {
        return;
    };
    if DXGI_PRESENT_HOOK.is_none() {
        let target: DxgiPresentFn = mem::transmute(present);
        let detour: DxgiPresentFn = dxgi_present_detour;
        match Detour::<DxgiPresentFn>::new(target, detour) {
            Ok(hook) => match hook.enable() {
                Ok(()) => {
                    DXGI_PRESENT_HOOK = Some(hook);
                    verbose_log("d3d11 install: IDXGISwapChain::Present detour ENABLED");
                }
                Err(()) => verbose_log("d3d11 install: Present Detour.enable() FAILED"),
            },
            Err(()) => verbose_log("d3d11 install: Present Detour::new() FAILED"),
        }
    }
    if DXGI_PRESENT1_HOOK.is_none() {
        if let Some(present1) = present1 {
            let target: DxgiPresent1Fn = mem::transmute(present1);
            let detour: DxgiPresent1Fn = dxgi_present1_detour;
            match Detour::<DxgiPresent1Fn>::new(target, detour) {
                Ok(hook) => match hook.enable() {
                    Ok(()) => {
                        DXGI_PRESENT1_HOOK = Some(hook);
                        verbose_log("d3d11 install: IDXGISwapChain1::Present1 detour ENABLED");
                    }
                    Err(()) => verbose_log("d3d11 install: Present1 Detour.enable() FAILED"),
                },
                Err(()) => verbose_log("d3d11 install: Present1 Detour::new() FAILED"),
            }
        }
    }
}

unsafe fn install_d3d12_hooks() {
    if env_flag_enabled(ENV_DISABLE_D3D12) {
        return;
    }
    let Some(execute_command_lists) = d3d12_execute_command_lists_pointer() else {
        return;
    };
    if D3D12_EXECUTE_COMMAND_LISTS_HOOK.is_none() {
        let target: D3d12ExecuteCommandListsFn = mem::transmute(execute_command_lists);
        let detour: D3d12ExecuteCommandListsFn = d3d12_execute_command_lists_detour;
        match Detour::<D3d12ExecuteCommandListsFn>::new(target, detour) {
            Ok(hook) => match hook.enable() {
                Ok(()) => {
                    D3D12_EXECUTE_COMMAND_LISTS_HOOK = Some(hook);
                    verbose_log("d3d12 install: ExecuteCommandLists detour ENABLED");
                }
                Err(()) => verbose_log("d3d12 install: ExecuteCommandLists Detour.enable() FAILED"),
            },
            Err(()) => verbose_log("d3d12 install: ExecuteCommandLists Detour::new() FAILED"),
        }
    }
}

unsafe fn gl_hooks_installed() -> bool {
    SWAP_BUFFERS_HOOK.is_some() && WGL_SWAP_LAYER_BUFFERS_HOOK.is_some()
}

unsafe fn exported_swap_buffers() -> Option<SwapBuffersFn> {
    let module_name = wide("gdi32.dll");
    let module = GetModuleHandleW(module_name.as_ptr());
    if module.is_null() {
        verbose_log("opengl install: gdi32.dll not loaded; cannot resolve SwapBuffers");
        return None;
    }
    let proc = GetProcAddress(module, c"SwapBuffers".as_ptr().cast())?;
    Some(mem::transmute(proc))
}

unsafe fn exported_wgl_swap_layer_buffers() -> Option<WglSwapLayerBuffersFn> {
    let module_name = wide("opengl32.dll");
    let module = GetModuleHandleW(module_name.as_ptr());
    if module.is_null() {
        verbose_log("opengl install: opengl32.dll not loaded; cannot resolve wglSwapLayerBuffers");
        return None;
    }
    let proc = GetProcAddress(module, c"wglSwapLayerBuffers".as_ptr().cast())?;
    Some(mem::transmute(proc))
}

unsafe fn prologue_hex(function: *const ()) -> String {
    let ptr = function as *const u8;
    if ptr.is_null() {
        return "<null>".to_string();
    }
    let bytes = std::slice::from_raw_parts(ptr, arm64_reloc::STOLEN_BYTES);
    bytes
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

unsafe fn install_opengl_hooks() {
    if SWAP_BUFFERS_HOOK.is_none() {
        if let Some(target) = exported_swap_buffers() {
            verbose_log(&format!(
                "opengl install: SwapBuffers target prologue {}",
                prologue_hex(target as *const ())
            ));
            let detour: SwapBuffersFn = swap_buffers_detour;
            match Detour::<SwapBuffersFn>::new(target, detour) {
                Ok(hook) => match hook.enable() {
                    Ok(()) => {
                        SWAP_BUFFERS_HOOK = Some(hook);
                        verbose_log("opengl install: SwapBuffers detour ENABLED");
                    }
                    Err(()) => verbose_log("opengl install: SwapBuffers Detour.enable() FAILED"),
                },
                Err(()) => verbose_log("opengl install: SwapBuffers Detour::new() FAILED"),
            }
        }
    }
    if WGL_SWAP_LAYER_BUFFERS_HOOK.is_none() {
        if let Some(target) = exported_wgl_swap_layer_buffers() {
            let detour: WglSwapLayerBuffersFn = wgl_swap_layer_buffers_detour;
            match Detour::<WglSwapLayerBuffersFn>::new(target, detour) {
                Ok(hook) => match hook.enable() {
                    Ok(()) => {
                        WGL_SWAP_LAYER_BUFFERS_HOOK = Some(hook);
                        verbose_log("opengl install: wglSwapLayerBuffers detour ENABLED");
                    }
                    Err(()) => {
                        verbose_log("opengl install: wglSwapLayerBuffers Detour.enable() FAILED")
                    }
                },
                Err(()) => verbose_log("opengl install: wglSwapLayerBuffers Detour::new() FAILED"),
            }
        }
    }
}

unsafe fn install_hooks() {
    install_opengl_hooks();
    install_d3d11_hooks();
    install_d3d12_hooks();
    d3d9::install_d3d9_hooks();
    HOOKS_READY.store(true, Ordering::Release);
}

unsafe extern "system" fn hook_thread(_param: *mut c_void) -> u32 {
    verbose_log("hook_thread started -- installing graphics detours");
    log_loaded_graphics_modules("hook_thread initial");
    install_hooks();
    let want_d3d12 = !env_flag_enabled(ENV_DISABLE_D3D12);
    for tick in 0..50 {
        let d3d11_ok = d3d11_hooks_installed();
        let gl_ok = gl_hooks_installed() || module_loaded("opengl32.dll");
        let d3d12_ok = !want_d3d12 || D3D12_EXECUTE_COMMAND_LISTS_HOOK.is_some();
        if d3d11_ok && d3d12_ok && gl_ok && d3d9::hooks_installed() {
            verbose_log(&format!(
                "hook_thread: all targeted detours installed after {tick} retries"
            ));
            break;
        }
        Sleep(200);
        log_loaded_graphics_modules("hook_thread retry");
        install_opengl_hooks();
        install_d3d11_hooks();
        if want_d3d12 {
            install_d3d12_hooks();
        }
        d3d9::install_d3d9_hooks();
    }
    verbose_log(&format!(
        "hook_thread: install poll finished (dxgi_present={} dxgi_present1={} d3d12={} opengl={} d3d9={})",
        DXGI_PRESENT_HOOK.is_some(),
        DXGI_PRESENT1_HOOK.is_some(),
        D3D12_EXECUTE_COMMAND_LISTS_HOOK.is_some(),
        gl_hooks_installed(),
        d3d9::hooks_installed(),
    ));
    0
}

#[unsafe(no_mangle)]
pub unsafe extern "system" fn FluxerGetMsgProc(
    code: i32,
    wparam: WPARAM,
    lparam: WinLparam,
) -> LRESULT {
    CallNextHookEx(null_mut(), code, wparam, lparam)
}

#[unsafe(no_mangle)]
pub unsafe extern "system" fn DllMain(
    hinst: HINSTANCE,
    reason: u32,
    _reserved: *mut c_void,
) -> BOOL {
    if reason == DLL_PROCESS_ATTACH {
        verbose_log(&format!(
            "DllMain DLL_PROCESS_ATTACH reached (pointer_width={} bits)",
            mem::size_of::<usize>() * 8
        ));
        DisableThreadLibraryCalls(hinst);
        let thread = CreateThread(null(), 0, Some(hook_thread), null(), 0, null_mut());
        if thread.is_null() {
            verbose_log("DllMain CreateThread(hook_thread) FAILED -- no hooks will install");
        } else {
            CloseHandle(thread);
        }
    }
    1
}
