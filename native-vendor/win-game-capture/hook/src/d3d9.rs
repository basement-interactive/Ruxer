// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::{
    D3d11FormatMode, Detour, ENV_FORCE_CPU, GAME_CAPTURE_API_D3D9,
    GAME_CAPTURE_FALLBACK_DEVICE_LOST, GAME_CAPTURE_FALLBACK_FORCED_CPU,
    GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED, GAME_CAPTURE_FALLBACK_NONE,
    GAME_CAPTURE_FALLBACK_SHARED_TEXTURE_UNSUPPORTED, HOOKS_READY, HookState, capture_should_run,
    clear_state, ensure_state, env_flag_enabled, frame_due, mark_present,
    publish_shared_texture_frame, record_dropped_frame, set_capture_flags, set_fallback_reason,
    verbose_log, wide, write_bgra_rows_to_shared_memory,
};
use std::{
    ffi::c_void,
    mem,
    ptr::null_mut,
    sync::atomic::{AtomicBool, Ordering},
};
use windows::{
    Win32::{
        Foundation::HMODULE as WinHmodule,
        Foundation::{HWND as WinHwnd, RECT},
        Graphics::Direct3D::{
            D3D_DRIVER_TYPE_UNKNOWN, D3D_FEATURE_LEVEL_10_0, D3D_FEATURE_LEVEL_10_1,
            D3D_FEATURE_LEVEL_11_0,
        },
        Graphics::{
            Direct3D9::{
                D3D_SDK_VERSION, D3DADAPTER_DEFAULT, D3DBACKBUFFER_TYPE_MONO,
                D3DCREATE_FPU_PRESERVE, D3DCREATE_HARDWARE_VERTEXPROCESSING,
                D3DCREATE_MULTITHREADED, D3DCREATE_SOFTWARE_VERTEXPROCESSING, D3DDEVTYPE_HAL,
                D3DDISPLAYMODEEX, D3DFMT_A8B8G8R8, D3DFMT_A8R8G8B8, D3DFMT_X8B8G8R8,
                D3DFMT_X8R8G8B8, D3DFORMAT, D3DLOCK_READONLY, D3DLOCKED_RECT, D3DMULTISAMPLE_NONE,
                D3DPOOL_DEFAULT, D3DPOOL_SYSTEMMEM, D3DPRESENT_PARAMETERS, D3DSURFACE_DESC,
                D3DSWAPEFFECT_DISCARD, D3DTEXF_NONE, D3DUSAGE_RENDERTARGET, Direct3DCreate9,
                IDirect3DDevice9, IDirect3DSurface9, IDirect3DSwapChain9, IDirect3DTexture9,
            },
            Direct3D11::{
                D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_RESOURCE_MISC_SHARED,
                D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT, D3D11CreateDevice,
                ID3D11Device, ID3D11Texture2D,
            },
            Dxgi::{
                Common::{
                    DXGI_FORMAT, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_B8G8R8X8_UNORM,
                    DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_FORMAT_R10G10B10A2_UNORM, DXGI_SAMPLE_DESC,
                },
                CreateDXGIFactory1, IDXGIFactory1, IDXGIResource,
            },
            Gdi::RGNDATA,
        },
    },
    core::Interface,
};
#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
use windows_sys::Win32::System::Memory::{
    MEM_COMMIT, MEMORY_BASIC_INFORMATION, PAGE_GUARD, PAGE_NOACCESS, VirtualQuery,
};
use windows_sys::Win32::{
    Foundation::HWND,
    UI::WindowsAndMessaging::{
        CW_USEDEFAULT, CreateWindowExW, DestroyWindow, GetClientRect, IsWindow, WS_OVERLAPPEDWINDOW,
    },
};

const VT_DEVICE9_RESET: usize = 16;
const VT_DEVICE9_PRESENT: usize = 17;
const VT_DEVICE9EX_PRESENTEX: usize = 121;
const VT_DEVICE9EX_CHECK_RESOURCE_RESIDENCY: usize = 125;
const VT_DEVICE9EX_RESETEX: usize = 132;
const VT_SWAPCHAIN9_PRESENT: usize = 3;

type D3d9PresentFn = unsafe extern "system" fn(
    *mut c_void,
    *const RECT,
    *const RECT,
    WinHwnd,
    *const RGNDATA,
) -> windows::core::HRESULT;
type D3d9PresentExFn = unsafe extern "system" fn(
    *mut c_void,
    *const RECT,
    *const RECT,
    WinHwnd,
    *const RGNDATA,
    u32,
) -> windows::core::HRESULT;
type D3d9ResetFn =
    unsafe extern "system" fn(*mut c_void, *mut D3DPRESENT_PARAMETERS) -> windows::core::HRESULT;
type D3d9ResetExFn = unsafe extern "system" fn(
    *mut c_void,
    *mut D3DPRESENT_PARAMETERS,
    *mut D3DDISPLAYMODEEX,
) -> windows::core::HRESULT;
type D3d9SwapChainPresentFn = unsafe extern "system" fn(
    *mut c_void,
    *const RECT,
    *const RECT,
    WinHwnd,
    *const RGNDATA,
    u32,
) -> windows::core::HRESULT;

static mut D3D9_PRESENT_HOOK: Option<Detour<D3d9PresentFn>> = None;
static mut D3D9_PRESENT_EX_HOOK: Option<Detour<D3d9PresentExFn>> = None;
static mut D3D9_RESET_HOOK: Option<Detour<D3d9ResetFn>> = None;
static mut D3D9_RESET_EX_HOOK: Option<Detour<D3d9ResetExFn>> = None;
static mut D3D9_SWAPCHAIN_PRESENT_HOOK: Option<Detour<D3d9SwapChainPresentFn>> = None;
static D3D9_FIRED: AtomicBool = AtomicBool::new(false);
static D3D9_PRESENT_RECURSE: std::sync::atomic::AtomicUsize =
    std::sync::atomic::AtomicUsize::new(0);

pub(crate) struct D3d9CaptureState {
    device_ptr: usize,
    width: u32,
    height: u32,
    format: D3DFORMAT,
    multisample_type: windows::Win32::Graphics::Direct3D9::D3DMULTISAMPLE_TYPE,
    path: D3d9CapturePath,
}

enum D3d9CapturePath {
    SharedTexture {
        copy_surface: IDirect3DSurface9,
        _copy_texture: IDirect3DTexture9,
        _d3d11_device: ID3D11Device,
        _d3d11_texture: ID3D11Texture2D,
        shared_handle: u64,
        dxgi_format: DXGI_FORMAT,
    },
    Memory {
        surface: IDirect3DSurface9,
        resolve_surface: Option<IDirect3DSurface9>,
        format_mode: D3d11FormatMode,
    },
}

pub(crate) unsafe fn hooks_installed() -> bool {
    D3D9_PRESENT_HOOK.is_some()
}

fn d3d9_format_mode(format: D3DFORMAT) -> Option<D3d11FormatMode> {
    if format == D3DFMT_X8R8G8B8 || format == D3DFMT_A8R8G8B8 {
        Some(D3d11FormatMode::Bgra)
    } else if format == D3DFMT_X8B8G8R8 || format == D3DFMT_A8B8G8R8 {
        Some(D3d11FormatMode::Rgba)
    } else {
        None
    }
}

fn d3d9_shared_dxgi_format(format: D3DFORMAT) -> Option<DXGI_FORMAT> {
    use windows::Win32::Graphics::Direct3D9::D3DFMT_A2B10G10R10;
    if format == D3DFMT_A8R8G8B8 {
        Some(DXGI_FORMAT_B8G8R8A8_UNORM)
    } else if format == D3DFMT_X8R8G8B8 {
        Some(DXGI_FORMAT_B8G8R8X8_UNORM)
    } else if format == D3DFMT_A8B8G8R8 {
        Some(DXGI_FORMAT_R8G8B8A8_UNORM)
    } else if format == D3DFMT_A2B10G10R10 {
        Some(DXGI_FORMAT_R10G10B10A2_UNORM)
    } else {
        None
    }
}

fn d3d9_hdr_flags(format: D3DFORMAT) -> u32 {
    use crate::{GAME_CAPTURE_FLAG_HDR, GAME_CAPTURE_FLAG_TEN_BIT};
    use windows::Win32::Graphics::Direct3D9::{
        D3DFMT_A2B10G10R10, D3DFMT_A2B10G10R10_XR_BIAS, D3DFMT_A2R10G10B10, D3DFMT_A16B16G16R16,
        D3DFMT_A16B16G16R16F,
    };
    if format == D3DFMT_A2R10G10B10
        || format == D3DFMT_A2B10G10R10
        || format == D3DFMT_A2B10G10R10_XR_BIAS
    {
        GAME_CAPTURE_FLAG_TEN_BIT | GAME_CAPTURE_FLAG_HDR
    } else if format == D3DFMT_A16B16G16R16F || format == D3DFMT_A16B16G16R16 {
        GAME_CAPTURE_FLAG_HDR
    } else {
        0
    }
}

#[derive(Clone, Copy, Debug)]
struct D3d9ExFlagOffsets {
    d3d9_object_offset: usize,
    is_d3d9ex_offset: usize,
}

struct D3d9ExFlagGuard {
    flag: *mut i32,
    previous: i32,
}

impl Drop for D3d9ExFlagGuard {
    fn drop(&mut self) {
        unsafe {
            if !self.flag.is_null() {
                *self.flag = self.previous;
            }
        }
    }
}

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
static D3D9EX_FLAG_OFFSETS: std::sync::OnceLock<Option<D3d9ExFlagOffsets>> =
    std::sync::OnceLock::new();

#[cfg(target_arch = "x86_64")]
const D3D9EX_PATTERN_LEN: usize = 22;
#[cfg(target_arch = "x86_64")]
const D3D9EX_PATTERN_MASKS: [[u8; D3D9EX_PATTERN_LEN]; 4] = [
    [
        0xF8, 0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF,
        0x00, 0xF8, 0xF8, 0x00, 0x00, 0x00, 0x00,
    ],
    [
        0xF8, 0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0x00,
        0xF8, 0xF8, 0x00, 0x00, 0x00, 0x00, 0x00,
    ],
    [
        0xF8, 0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0x00,
        0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00,
    ],
    [
        0xF8, 0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF,
        0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00,
    ],
];
#[cfg(target_arch = "x86_64")]
const D3D9EX_PATTERN_VALUES: [[u8; D3D9EX_PATTERN_LEN]; 4] = [
    [
        0x48, 0x8B, 0x80, 0x00, 0x00, 0x00, 0x00, 0x44, 0x39, 0x00, 0x00, 0x00, 0x00, 0x00, 0x75,
        0x00, 0x40, 0xB8, 0x00, 0x00, 0x00, 0x00,
    ],
    [
        0x48, 0x8B, 0x80, 0x00, 0x00, 0x00, 0x00, 0x39, 0x80, 0x00, 0x00, 0x00, 0x00, 0x75, 0x00,
        0x40, 0xB8, 0x00, 0x00, 0x00, 0x00, 0x00,
    ],
    [
        0x48, 0x8B, 0x80, 0x00, 0x00, 0x00, 0x00, 0x39, 0x80, 0x00, 0x00, 0x00, 0x00, 0x75, 0x00,
        0x48, 0x8D, 0x00, 0x00, 0x00, 0x00, 0x00,
    ],
    [
        0x48, 0x8B, 0x80, 0x00, 0x00, 0x00, 0x00, 0x83, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x75,
        0x00, 0x48, 0x8D, 0x00, 0x00, 0x00, 0x00,
    ],
];
#[cfg(target_arch = "x86_64")]
const D3D9EX_OFFSET_FIELDS: [(usize, usize); 4] = [(3, 10), (3, 9), (3, 9), (3, 9)];

#[cfg(target_arch = "x86")]
const D3D9EX_PATTERN_LEN: usize = 20;
#[cfg(target_arch = "x86")]
const D3D9EX_PATTERN_MASKS: [[u8; D3D9EX_PATTERN_LEN]; 4] = [
    [
        0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xFF,
        0x00, 0x00, 0x00, 0x00, 0x00,
    ],
    [
        0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00,
        0xFF, 0x00, 0x00, 0x00, 0x00,
    ],
    [
        0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00,
        0xFF, 0x00, 0x00, 0x00, 0x00,
    ],
    [
        0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xFF,
        0x00, 0x00, 0x00, 0x00, 0x00,
    ],
];
#[cfg(target_arch = "x86")]
const D3D9EX_PATTERN_VALUES: [[u8; D3D9EX_PATTERN_LEN]; 4] = [
    [
        0x8B, 0x80, 0x00, 0x00, 0x00, 0x00, 0x39, 0x80, 0x00, 0x00, 0x00, 0x00, 0x75, 0x00, 0x68,
        0x00, 0x00, 0x00, 0x00, 0x00,
    ],
    [
        0x8B, 0x80, 0x00, 0x00, 0x00, 0x00, 0x83, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x75, 0x00,
        0x68, 0x00, 0x00, 0x00, 0x00,
    ],
    [
        0x8B, 0x80, 0x00, 0x00, 0x00, 0x00, 0x83, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x75, 0x00,
        0xBA, 0x00, 0x00, 0x00, 0x00,
    ],
    [
        0x8B, 0x80, 0x00, 0x00, 0x00, 0x00, 0x39, 0x80, 0x00, 0x00, 0x00, 0x00, 0x75, 0x00, 0xBA,
        0x00, 0x00, 0x00, 0x00, 0x00,
    ],
];
#[cfg(target_arch = "x86")]
const D3D9EX_OFFSET_FIELDS: [(usize, usize); 4] = [(2, 8), (2, 8), (2, 8), (2, 8)];

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
fn d3d9ex_pattern_offsets(bytes: &[u8]) -> Option<(usize, usize)> {
    if bytes.len() < D3D9EX_PATTERN_LEN {
        return None;
    }
    for (index, (mask, value)) in D3D9EX_PATTERN_MASKS
        .iter()
        .zip(D3D9EX_PATTERN_VALUES.iter())
        .enumerate()
    {
        if bytes[..D3D9EX_PATTERN_LEN]
            .iter()
            .zip(mask.iter())
            .zip(value.iter())
            .all(|((byte, mask), value)| (*byte & *mask) == *value)
        {
            return Some(D3D9EX_OFFSET_FIELDS[index]);
        }
    }
    None
}

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
unsafe fn memory_range_readable(ptr: *const u8, len: usize) -> bool {
    if ptr.is_null() || len == 0 {
        return false;
    }
    let mut info: MEMORY_BASIC_INFORMATION = mem::zeroed();
    let queried = VirtualQuery(
        ptr.cast(),
        &mut info,
        mem::size_of::<MEMORY_BASIC_INFORMATION>(),
    );
    if queried == 0 || info.State != MEM_COMMIT {
        return false;
    }
    if (info.Protect & PAGE_NOACCESS) != 0 || (info.Protect & PAGE_GUARD) != 0 {
        return false;
    }
    let start = ptr as usize;
    let region_start = info.BaseAddress as usize;
    let Some(end) = start.checked_add(len) else {
        return false;
    };
    let region_end = region_start.saturating_add(info.RegionSize);
    start >= region_start && end <= region_end
}

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
unsafe fn read_u32_field(base: *const u8, offset: usize) -> u32 {
    std::ptr::read_unaligned(base.add(offset).cast::<u32>())
}

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
unsafe fn validate_d3d9ex_offsets(
    device_raw: *mut c_void,
    d3d9ex_raw: *mut c_void,
    offsets: D3d9ExFlagOffsets,
) -> bool {
    if offsets.d3d9_object_offset > 0xFFFF || offsets.is_d3d9ex_offset > 0xFFFF {
        return false;
    }
    let device = device_raw.cast::<u8>();
    let d3d9_object_slot = device.add(offsets.d3d9_object_offset).cast::<*mut u8>();
    if !memory_range_readable(d3d9_object_slot.cast(), mem::size_of::<*mut u8>()) {
        return false;
    }
    let d3d9_object = *d3d9_object_slot;
    if d3d9_object != d3d9ex_raw.cast::<u8>() {
        return false;
    }
    let flag = d3d9_object.add(offsets.is_d3d9ex_offset).cast::<i32>();
    if !memory_range_readable(flag.cast(), mem::size_of::<i32>()) {
        return false;
    }
    *flag == 1
}

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
unsafe fn discover_d3d9ex_flag_offsets() -> Option<D3d9ExFlagOffsets> {
    use windows::Win32::Graphics::Direct3D9::{Direct3DCreate9Ex, IDirect3DDevice9Ex};

    let Ok(d3d9ex) = Direct3DCreate9Ex(D3D_SDK_VERSION) else {
        verbose_log("d3d9 shared texture: Direct3DCreate9Ex unavailable for offset discovery");
        return None;
    };
    let hwnd = create_dummy_window_d3d9();
    if hwnd.is_null() {
        verbose_log("d3d9 shared texture: dummy window creation failed for offset discovery");
        return None;
    }
    let mut params = D3DPRESENT_PARAMETERS {
        Windowed: windows::core::BOOL(1),
        SwapEffect: D3DSWAPEFFECT_DISCARD,
        hDeviceWindow: WinHwnd(hwnd),
        BackBufferFormat: D3DFMT_X8R8G8B8,
        BackBufferWidth: 2,
        BackBufferHeight: 2,
        BackBufferCount: 1,
        MultiSampleType: D3DMULTISAMPLE_NONE,
        ..Default::default()
    };
    let mut device: Option<IDirect3DDevice9Ex> = None;
    let base_flags = D3DCREATE_MULTITHREADED | D3DCREATE_FPU_PRESERVE;
    let mut created = d3d9ex
        .CreateDeviceEx(
            D3DADAPTER_DEFAULT,
            D3DDEVTYPE_HAL,
            WinHwnd(hwnd),
            (base_flags | D3DCREATE_HARDWARE_VERTEXPROCESSING) as u32,
            &mut params,
            null_mut(),
            &mut device,
        )
        .is_ok();
    if !created {
        created = d3d9ex
            .CreateDeviceEx(
                D3DADAPTER_DEFAULT,
                D3DDEVTYPE_HAL,
                WinHwnd(hwnd),
                (base_flags | D3DCREATE_SOFTWARE_VERTEXPROCESSING) as u32,
                &mut params,
                null_mut(),
                &mut device,
            )
            .is_ok();
    }
    let Some(device) = (if created { device } else { None }) else {
        let _ = DestroyWindow(hwnd);
        verbose_log("d3d9 shared texture: D3D9Ex probe device creation failed");
        return None;
    };

    let raw = device.as_raw();
    let vtable = *(raw as *mut *const *const ());
    let check_resource_residency = *vtable.add(VT_DEVICE9EX_CHECK_RESOURCE_RESIDENCY) as *const u8;
    let mut result = None;
    const MAX_FUNC_SCAN_BYTES: usize = 200;
    for offset in 0..MAX_FUNC_SCAN_BYTES {
        let candidate = check_resource_residency.add(offset);
        if !memory_range_readable(candidate, D3D9EX_PATTERN_LEN) {
            break;
        }
        let bytes = std::slice::from_raw_parts(candidate, D3D9EX_PATTERN_LEN);
        let Some((d3d9_object_field, is_d3d9ex_field)) = d3d9ex_pattern_offsets(bytes) else {
            continue;
        };
        let offsets = D3d9ExFlagOffsets {
            d3d9_object_offset: read_u32_field(candidate, d3d9_object_field) as usize,
            is_d3d9ex_offset: read_u32_field(candidate, is_d3d9ex_field) as usize,
        };
        if validate_d3d9ex_offsets(raw, d3d9ex.as_raw(), offsets) {
            verbose_log(&format!(
                "d3d9 shared texture: discovered D3D9Ex flag offsets object=0x{:x} flag=0x{:x}",
                offsets.d3d9_object_offset, offsets.is_d3d9ex_offset
            ));
            result = Some(offsets);
            break;
        }
    }

    let _ = DestroyWindow(hwnd);
    if result.is_none() {
        verbose_log("d3d9 shared texture: D3D9Ex flag offset discovery failed");
    }
    result
}

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
unsafe fn d3d9ex_flag_offsets() -> Option<D3d9ExFlagOffsets> {
    *D3D9EX_FLAG_OFFSETS.get_or_init(|| discover_d3d9ex_flag_offsets())
}

#[cfg(not(any(target_arch = "x86", target_arch = "x86_64")))]
unsafe fn d3d9ex_flag_offsets() -> Option<D3d9ExFlagOffsets> {
    None
}

unsafe fn d3d9ex_flag_for_device(device: &IDirect3DDevice9) -> Option<*mut i32> {
    let offsets = d3d9ex_flag_offsets()?;
    let device_raw = device.as_raw().cast::<u8>();
    let d3d9_object_slot = device_raw.add(offsets.d3d9_object_offset).cast::<*mut u8>();
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    if !memory_range_readable(d3d9_object_slot.cast(), mem::size_of::<*mut u8>()) {
        return None;
    }
    let d3d9_object = *d3d9_object_slot;
    if d3d9_object.is_null() {
        return None;
    }
    let flag = d3d9_object.add(offsets.is_d3d9ex_offset).cast::<i32>();
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    if !memory_range_readable(flag.cast(), mem::size_of::<i32>()) {
        return None;
    }
    Some(flag)
}

unsafe fn force_d3d9ex_flag(device: &IDirect3DDevice9) -> Option<D3d9ExFlagGuard> {
    let flag = d3d9ex_flag_for_device(device)?;
    let previous = *flag;
    *flag = 1;
    Some(D3d9ExFlagGuard { flag, previous })
}

unsafe fn client_size_from_hwnd(hwnd: HWND) -> Option<(HWND, u32, u32)> {
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

unsafe fn create_d3d9_interop_d3d11_device() -> Option<ID3D11Device> {
    const FEATURE_LEVELS: &[windows::Win32::Graphics::Direct3D::D3D_FEATURE_LEVEL] = &[
        D3D_FEATURE_LEVEL_11_0,
        D3D_FEATURE_LEVEL_10_1,
        D3D_FEATURE_LEVEL_10_0,
    ];
    let factory = CreateDXGIFactory1::<IDXGIFactory1>()
        .map_err(|error| {
            verbose_log(&format!(
                "d3d9 shared texture: CreateDXGIFactory1 failed: {error}"
            ));
            error
        })
        .ok()?;
    let adapter = factory
        .EnumAdapters(0)
        .map_err(|error| {
            verbose_log(&format!(
                "d3d9 shared texture: EnumAdapters(0) failed: {error}"
            ));
            error
        })
        .ok()?;
    let mut d3d11_device = None;
    if let Err(error) = D3D11CreateDevice(
        &adapter,
        D3D_DRIVER_TYPE_UNKNOWN,
        WinHmodule::default(),
        Default::default(),
        Some(FEATURE_LEVELS),
        D3D11_SDK_VERSION,
        Some(&mut d3d11_device),
        None,
        None,
    ) {
        verbose_log(&format!(
            "d3d9 shared texture: D3D11CreateDevice failed: {error}"
        ));
        return None;
    }
    d3d11_device
}

unsafe fn create_d3d9_shared_texture_path(
    device: &IDirect3DDevice9,
    desc: &D3DSURFACE_DESC,
) -> Option<D3d9CapturePath> {
    let Some(dxgi_format) = d3d9_shared_dxgi_format(desc.Format) else {
        verbose_log(&format!(
            "d3d9 shared texture: unsupported D3D9 format {}",
            desc.Format.0
        ));
        return None;
    };
    let d3d11_device = create_d3d9_interop_d3d11_device()?;
    let texture_desc = D3D11_TEXTURE2D_DESC {
        Width: desc.Width,
        Height: desc.Height,
        MipLevels: 1,
        ArraySize: 1,
        Format: dxgi_format,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: (D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32,
        CPUAccessFlags: 0,
        MiscFlags: D3D11_RESOURCE_MISC_SHARED.0 as u32,
    };
    let mut d3d11_texture = None;
    if let Err(error) = d3d11_device.CreateTexture2D(&texture_desc, None, Some(&mut d3d11_texture))
    {
        verbose_log(&format!(
            "d3d9 shared texture: CreateTexture2D failed: {error}"
        ));
        return None;
    }
    let Some(d3d11_texture) = d3d11_texture else {
        verbose_log("d3d9 shared texture: CreateTexture2D returned no texture");
        return None;
    };
    let mut shared_handle = d3d11_texture
        .cast::<IDXGIResource>()
        .map_err(|error| {
            verbose_log(&format!(
                "d3d9 shared texture: QueryInterface IDXGIResource failed: {error}"
            ));
            error
        })
        .and_then(|resource| {
            resource.GetSharedHandle().map_err(|error| {
                verbose_log(&format!(
                    "d3d9 shared texture: GetSharedHandle failed: {error}"
                ));
                error
            })
        })
        .ok()?;
    if shared_handle.is_invalid() {
        verbose_log("d3d9 shared texture: GetSharedHandle returned an invalid handle");
        return None;
    }
    let mut d3d9_texture = None;
    let _d3d9ex_flag = force_d3d9ex_flag(device).or_else(|| {
        verbose_log(
            "d3d9 shared texture: D3D9Ex compatibility flag unavailable; trying direct CreateTexture",
        );
        None
    });
    if let Err(error) = device.CreateTexture(
        desc.Width,
        desc.Height,
        1,
        D3DUSAGE_RENDERTARGET as u32,
        desc.Format,
        D3DPOOL_DEFAULT,
        &mut d3d9_texture,
        &mut shared_handle,
    ) {
        verbose_log(&format!(
            "d3d9 shared texture: CreateTexture shared handle failed: {error}"
        ));
        return None;
    }
    let Some(d3d9_texture) = d3d9_texture else {
        verbose_log("d3d9 shared texture: CreateTexture returned no D3D9 texture");
        return None;
    };
    let copy_surface = d3d9_texture
        .GetSurfaceLevel(0)
        .map_err(|error| {
            verbose_log(&format!(
                "d3d9 shared texture: GetSurfaceLevel failed: {error}"
            ));
            error
        })
        .ok()?;
    Some(D3d9CapturePath::SharedTexture {
        copy_surface,
        _copy_texture: d3d9_texture,
        _d3d11_device: d3d11_device,
        _d3d11_texture: d3d11_texture,
        shared_handle: shared_handle.0 as usize as u64,
        dxgi_format,
    })
}

unsafe fn create_d3d9_memory_path(
    state: &mut HookState,
    device: &IDirect3DDevice9,
    desc: &D3DSURFACE_DESC,
    format_mode: D3d11FormatMode,
) -> Option<D3d9CapturePath> {
    let mut surface: Option<IDirect3DSurface9> = None;
    if device
        .CreateOffscreenPlainSurface(
            desc.Width,
            desc.Height,
            desc.Format,
            D3DPOOL_SYSTEMMEM,
            &mut surface,
            null_mut(),
        )
        .is_err()
    {
        (*state.info).last_error = 60;
        set_fallback_reason(state, GAME_CAPTURE_FALLBACK_DEVICE_LOST);
        return None;
    }
    let Some(surface) = surface else {
        (*state.info).last_error = 60;
        return None;
    };
    let mut resolve_surface = None;
    if desc.MultiSampleType != D3DMULTISAMPLE_NONE {
        if device
            .CreateRenderTarget(
                desc.Width,
                desc.Height,
                desc.Format,
                D3DMULTISAMPLE_NONE,
                0,
                false,
                &mut resolve_surface,
                null_mut(),
            )
            .is_err()
            || resolve_surface.is_none()
        {
            (*state.info).last_error = 61;
            set_fallback_reason(state, crate::GAME_CAPTURE_FALLBACK_MULTISAMPLED);
            set_capture_flags(state, crate::GAME_CAPTURE_FLAG_MULTISAMPLED);
            return None;
        }
    }
    Some(D3d9CapturePath::Memory {
        surface,
        resolve_surface,
        format_mode,
    })
}

unsafe fn d3d9_state_for_frame<'a>(
    state: &'a mut HookState,
    device: &IDirect3DDevice9,
    device_ptr: usize,
    desc: &D3DSURFACE_DESC,
    format_mode: Option<D3d11FormatMode>,
    prefer_shared_texture: bool,
) -> Option<&'a mut D3d9CaptureState> {
    let recreate = state
        .d3d9
        .as_ref()
        .map(|capture| {
            capture.device_ptr != device_ptr
                || capture.width != desc.Width
                || capture.height != desc.Height
                || capture.format != desc.Format
                || capture.multisample_type != desc.MultiSampleType
        })
        .unwrap_or(true);
    if recreate {
        let path = if prefer_shared_texture {
            match create_d3d9_shared_texture_path(device, desc) {
                Some(path) => {
                    verbose_log("d3d9 shared texture capture initialized");
                    Some(path)
                }
                None => {
                    verbose_log("d3d9 shared texture init failed; falling back to memory readback");
                    set_fallback_reason(state, GAME_CAPTURE_FALLBACK_SHARED_TEXTURE_UNSUPPORTED);
                    None
                }
            }
        } else {
            None
        }
        .or_else(|| {
            let format_mode = format_mode?;
            create_d3d9_memory_path(state, device, desc, format_mode)
        });
        let Some(path) = path else {
            state.d3d9 = None;
            return None;
        };
        state.d3d9 = Some(D3d9CaptureState {
            device_ptr,
            width: desc.Width,
            height: desc.Height,
            format: desc.Format,
            multisample_type: desc.MultiSampleType,
            path,
        });
    }
    state.d3d9.as_mut()
}

unsafe fn capture_d3d9_backbuffer(
    device: &IDirect3DDevice9,
    back_buffer: IDirect3DSurface9,
    window_override: WinHwnd,
) {
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

    if !D3D9_FIRED.swap(true, Ordering::AcqRel) {
        verbose_log("d3d9 present detour fired (first frame, valid device)");
    }
    mark_present(state, GAME_CAPTURE_API_D3D9);
    set_capture_flags(state, 0);
    set_fallback_reason(state, GAME_CAPTURE_FALLBACK_NONE);

    let mut desc = D3DSURFACE_DESC::default();
    if back_buffer.GetDesc(&mut desc).is_err() || desc.Width == 0 || desc.Height == 0 {
        record_dropped_frame(state);
        return;
    }

    let format_mode = d3d9_format_mode(desc.Format);
    if format_mode.is_none() && d3d9_shared_dxgi_format(desc.Format).is_none() {
        set_capture_flags(state, d3d9_hdr_flags(desc.Format));
        set_fallback_reason(state, GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED);
        record_dropped_frame(state);
        return;
    };

    if !frame_due(state) {
        record_dropped_frame(state);
        return;
    }

    if desc.MultiSampleType != D3DMULTISAMPLE_NONE {
        set_capture_flags(state, crate::GAME_CAPTURE_FLAG_MULTISAMPLED);
    }
    set_capture_flags(
        state,
        (*state.info).capture_flags | d3d9_hdr_flags(desc.Format),
    );

    let device_ptr = device.as_raw() as usize;
    let force_cpu = env_flag_enabled(ENV_FORCE_CPU);
    if force_cpu {
        set_fallback_reason(state, GAME_CAPTURE_FALLBACK_FORCED_CPU);
    }

    let Some(capture_state) =
        d3d9_state_for_frame(state, device, device_ptr, &desc, format_mode, !force_cpu)
    else {
        record_dropped_frame(state);
        return;
    };

    if let D3d9CapturePath::SharedTexture {
        copy_surface,
        shared_handle,
        dxgi_format,
        ..
    } = &capture_state.path
    {
        let copy_surface = copy_surface.clone();
        let shared_handle = *shared_handle;
        let dxgi_format = *dxgi_format;
        if device
            .StretchRect(
                &back_buffer,
                null_mut(),
                &copy_surface,
                null_mut(),
                D3DTEXF_NONE,
            )
            .is_ok()
        {
            let hwnd = desc_window(state, window_override);
            let _ = publish_shared_texture_frame(
                state,
                hwnd,
                desc.Width,
                desc.Height,
                dxgi_format,
                shared_handle,
            );
            return;
        }
        verbose_log("d3d9 shared texture StretchRect failed; falling back to memory readback");
        set_fallback_reason(state, GAME_CAPTURE_FALLBACK_SHARED_TEXTURE_UNSUPPORTED);
        state.d3d9 = None;
    }

    let (surface, source_surface, format_mode) = {
        let Some(capture_state) =
            d3d9_state_for_frame(state, device, device_ptr, &desc, format_mode, false)
        else {
            record_dropped_frame(state);
            return;
        };
        let D3d9CapturePath::Memory {
            surface,
            resolve_surface,
            format_mode,
        } = &capture_state.path
        else {
            record_dropped_frame(state);
            return;
        };
        let source_surface = if desc.MultiSampleType != D3DMULTISAMPLE_NONE {
            let Some(resolve_surface) = resolve_surface.clone() else {
                record_dropped_frame(state);
                return;
            };
            if device
                .StretchRect(
                    &back_buffer,
                    null_mut(),
                    &resolve_surface,
                    null_mut(),
                    D3DTEXF_NONE,
                )
                .is_err()
            {
                verbose_log("d3d9 StretchRect resolve FAILED (multisample backbuffer)");
                set_fallback_reason(state, crate::GAME_CAPTURE_FALLBACK_MULTISAMPLED);
                record_dropped_frame(state);
                return;
            }
            resolve_surface
        } else {
            back_buffer.clone()
        };
        (surface.clone(), source_surface, *format_mode)
    };

    if device
        .GetRenderTargetData(&source_surface, &surface)
        .is_err()
    {
        verbose_log("d3d9 GetRenderTargetData FAILED (readback surface or lost device)");
        if desc.MultiSampleType != D3DMULTISAMPLE_NONE {
            set_fallback_reason(state, crate::GAME_CAPTURE_FALLBACK_MULTISAMPLED);
            set_capture_flags(state, crate::GAME_CAPTURE_FLAG_MULTISAMPLED);
        } else {
            set_fallback_reason(state, GAME_CAPTURE_FALLBACK_DEVICE_LOST);
            state.d3d9 = None;
        }
        record_dropped_frame(state);
        return;
    }

    let mut locked = D3DLOCKED_RECT::default();
    if surface
        .LockRect(&mut locked, null_mut(), D3DLOCK_READONLY as u32)
        .is_err()
        || locked.pBits.is_null()
    {
        state.d3d9 = None;
        record_dropped_frame(state);
        return;
    }

    let hwnd = desc_window(state, window_override);
    let _ = write_bgra_rows_to_shared_memory(
        state,
        hwnd,
        desc.Width,
        desc.Height,
        locked.pBits as *const u8,
        locked.Pitch.max(0) as usize,
        false,
        format_mode,
    );
    let _ = surface.UnlockRect();
}

unsafe fn capture_d3d9_device_frame(device_raw: *mut c_void, window_override: WinHwnd) {
    let Some(device) = IDirect3DDevice9::from_raw_borrowed(&device_raw) else {
        return;
    };
    let Ok(back_buffer) = device.GetBackBuffer(0, 0, D3DBACKBUFFER_TYPE_MONO) else {
        if let Some(state) = ensure_state() {
            state.d3d9 = None;
            set_fallback_reason(state, GAME_CAPTURE_FALLBACK_DEVICE_LOST);
            record_dropped_frame(state);
        }
        return;
    };
    capture_d3d9_backbuffer(device, back_buffer, window_override);
}

unsafe fn capture_d3d9_swapchain_frame(swap_chain_raw: *mut c_void, window_override: WinHwnd) {
    let Some(swap_chain) = IDirect3DSwapChain9::from_raw_borrowed(&swap_chain_raw) else {
        return;
    };
    let Ok(device) = swap_chain.GetDevice() else {
        return;
    };
    let Ok(back_buffer) = swap_chain.GetBackBuffer(0, D3DBACKBUFFER_TYPE_MONO) else {
        if let Some(state) = ensure_state() {
            state.d3d9 = None;
            set_fallback_reason(state, GAME_CAPTURE_FALLBACK_DEVICE_LOST);
            record_dropped_frame(state);
        }
        return;
    };
    capture_d3d9_backbuffer(&device, back_buffer, window_override);
}

unsafe fn present_enter() -> bool {
    D3D9_PRESENT_RECURSE.fetch_add(1, Ordering::AcqRel) == 0
}

unsafe fn present_leave() {
    D3D9_PRESENT_RECURSE.fetch_sub(1, Ordering::AcqRel);
}

unsafe fn desc_window(state: &mut HookState, window_override: WinHwnd) -> HWND {
    let override_hwnd = window_override.0 as HWND;
    if let Some((hwnd, _, _)) = client_size_from_hwnd(override_hwnd) {
        return hwnd;
    }
    let info_hwnd = (*state.info).hwnd as usize as HWND;
    if let Some((hwnd, _, _)) = client_size_from_hwnd(info_hwnd) {
        return hwnd;
    }
    info_hwnd
}

unsafe extern "system" fn d3d9_present_detour(
    device: *mut c_void,
    source_rect: *const RECT,
    dest_rect: *const RECT,
    dest_window_override: WinHwnd,
    dirty_region: *const RGNDATA,
) -> windows::core::HRESULT {
    let outermost = present_enter();
    if outermost {
        capture_d3d9_device_frame(device, dest_window_override);
    }
    if let Some(hook) = D3D9_PRESENT_HOOK.as_ref() {
        let result = (hook.trampoline_fn())(
            device,
            source_rect,
            dest_rect,
            dest_window_override,
            dirty_region,
        );
        present_leave();
        return result;
    }
    present_leave();
    windows::core::HRESULT(0)
}

unsafe extern "system" fn d3d9_present_ex_detour(
    device: *mut c_void,
    source_rect: *const RECT,
    dest_rect: *const RECT,
    dest_window_override: WinHwnd,
    dirty_region: *const RGNDATA,
    flags: u32,
) -> windows::core::HRESULT {
    let outermost = present_enter();
    if outermost {
        capture_d3d9_device_frame(device, dest_window_override);
    }
    if let Some(hook) = D3D9_PRESENT_EX_HOOK.as_ref() {
        let result = (hook.trampoline_fn())(
            device,
            source_rect,
            dest_rect,
            dest_window_override,
            dirty_region,
            flags,
        );
        present_leave();
        return result;
    }
    present_leave();
    windows::core::HRESULT(0)
}

unsafe extern "system" fn d3d9_reset_detour(
    device: *mut c_void,
    present_parameters: *mut D3DPRESENT_PARAMETERS,
) -> windows::core::HRESULT {
    if let Some(state) = ensure_state() {
        state.d3d9 = None;
        verbose_log("d3d9 Reset: invalidated cached readback surface");
    }
    if let Some(hook) = D3D9_RESET_HOOK.as_ref() {
        return (hook.trampoline_fn())(device, present_parameters);
    }
    windows::core::HRESULT(0)
}

unsafe extern "system" fn d3d9_reset_ex_detour(
    device: *mut c_void,
    present_parameters: *mut D3DPRESENT_PARAMETERS,
    fullscreen_display_mode: *mut D3DDISPLAYMODEEX,
) -> windows::core::HRESULT {
    if let Some(state) = ensure_state() {
        state.d3d9 = None;
        verbose_log("d3d9 ResetEx: invalidated cached readback surface");
    }
    if let Some(hook) = D3D9_RESET_EX_HOOK.as_ref() {
        return (hook.trampoline_fn())(device, present_parameters, fullscreen_display_mode);
    }
    windows::core::HRESULT(0)
}

unsafe extern "system" fn d3d9_swapchain_present_detour(
    swap_chain: *mut c_void,
    source_rect: *const RECT,
    dest_rect: *const RECT,
    dest_window_override: WinHwnd,
    dirty_region: *const RGNDATA,
    flags: u32,
) -> windows::core::HRESULT {
    let outermost = present_enter();
    if outermost {
        capture_d3d9_swapchain_frame(swap_chain, dest_window_override);
    }
    if let Some(hook) = D3D9_SWAPCHAIN_PRESENT_HOOK.as_ref() {
        let result = (hook.trampoline_fn())(
            swap_chain,
            source_rect,
            dest_rect,
            dest_window_override,
            dirty_region,
            flags,
        );
        present_leave();
        return result;
    }
    present_leave();
    windows::core::HRESULT(0)
}

unsafe fn create_dummy_window_d3d9() -> HWND {
    let class_name = wide("FluxerGameCaptureDummyWindow");
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
        null_mut(),
        null_mut(),
    )
}

unsafe fn d3d9_method_pointers() -> Option<(
    *const (),
    *const (),
    Option<*const ()>,
    Option<*const ()>,
    Option<*const ()>,
)> {
    let d3d9 = Direct3DCreate9(D3D_SDK_VERSION)?;
    let hwnd = create_dummy_window_d3d9();
    if hwnd.is_null() {
        return None;
    }
    let mut params = D3DPRESENT_PARAMETERS {
        Windowed: windows::core::BOOL(1),
        SwapEffect: D3DSWAPEFFECT_DISCARD,
        hDeviceWindow: WinHwnd(hwnd),
        BackBufferFormat: D3DFMT_X8R8G8B8,
        BackBufferWidth: 2,
        BackBufferHeight: 2,
        BackBufferCount: 1,
        MultiSampleType: D3DMULTISAMPLE_NONE,
        ..Default::default()
    };

    let mut device: Option<IDirect3DDevice9> = None;
    let base_flags = D3DCREATE_MULTITHREADED | D3DCREATE_FPU_PRESERVE;
    let mut created = d3d9
        .CreateDevice(
            D3DADAPTER_DEFAULT,
            D3DDEVTYPE_HAL,
            WinHwnd(hwnd),
            (base_flags | D3DCREATE_HARDWARE_VERTEXPROCESSING) as u32,
            &mut params,
            &mut device,
        )
        .is_ok();
    if !created {
        created = d3d9
            .CreateDevice(
                D3DADAPTER_DEFAULT,
                D3DDEVTYPE_HAL,
                WinHwnd(hwnd),
                (base_flags | D3DCREATE_SOFTWARE_VERTEXPROCESSING) as u32,
                &mut params,
                &mut device,
            )
            .is_ok();
    }
    let device = if created { device } else { None };
    let Some(device) = device else {
        let _ = DestroyWindow(hwnd);
        return None;
    };

    let raw = device.as_raw();
    let vtable = *(raw as *mut *const *const ());
    let reset = *vtable.add(VT_DEVICE9_RESET);
    let present = *vtable.add(VT_DEVICE9_PRESENT);

    let swapchain_present = device.GetSwapChain(0).ok().map(|swap_chain| {
        let raw = swap_chain.as_raw();
        let vtable = *(raw as *mut *const *const ());
        *vtable.add(VT_SWAPCHAIN9_PRESENT)
    });

    let (present_ex, reset_ex) = d3d9ex_method_pointers();

    drop(device);
    let _ = DestroyWindow(hwnd);
    Some((present, reset, present_ex, reset_ex, swapchain_present))
}

unsafe fn d3d9ex_method_pointers() -> (Option<*const ()>, Option<*const ()>) {
    use windows::Win32::Graphics::Direct3D9::{Direct3DCreate9Ex, IDirect3DDevice9Ex};
    let Ok(d3d9ex) = Direct3DCreate9Ex(D3D_SDK_VERSION) else {
        return (None, None);
    };
    let hwnd = create_dummy_window_d3d9();
    if hwnd.is_null() {
        return (None, None);
    }
    let mut params = D3DPRESENT_PARAMETERS {
        Windowed: windows::core::BOOL(1),
        SwapEffect: D3DSWAPEFFECT_DISCARD,
        hDeviceWindow: WinHwnd(hwnd),
        BackBufferFormat: D3DFMT_X8R8G8B8,
        BackBufferWidth: 2,
        BackBufferHeight: 2,
        BackBufferCount: 1,
        MultiSampleType: D3DMULTISAMPLE_NONE,
        ..Default::default()
    };
    let mut device: Option<IDirect3DDevice9Ex> = None;
    let base_flags = D3DCREATE_MULTITHREADED | D3DCREATE_FPU_PRESERVE;
    let mut created = d3d9ex
        .CreateDeviceEx(
            D3DADAPTER_DEFAULT,
            D3DDEVTYPE_HAL,
            WinHwnd(hwnd),
            (base_flags | D3DCREATE_HARDWARE_VERTEXPROCESSING) as u32,
            &mut params,
            null_mut(),
            &mut device,
        )
        .is_ok();
    if !created {
        created = d3d9ex
            .CreateDeviceEx(
                D3DADAPTER_DEFAULT,
                D3DDEVTYPE_HAL,
                WinHwnd(hwnd),
                (base_flags | D3DCREATE_SOFTWARE_VERTEXPROCESSING) as u32,
                &mut params,
                null_mut(),
                &mut device,
            )
            .is_ok();
    }
    let device = if created { device } else { None };
    let result = device.map(|device| {
        let raw = device.as_raw();
        let vtable = *(raw as *mut *const *const ());
        (
            *vtable.add(VT_DEVICE9EX_PRESENTEX),
            *vtable.add(VT_DEVICE9EX_RESETEX),
        )
    });
    let _ = DestroyWindow(hwnd);
    result
        .map(|(present_ex, reset_ex)| (Some(present_ex), Some(reset_ex)))
        .unwrap_or((None, None))
}

pub(crate) unsafe fn install_d3d9_hooks() {
    if D3D9_PRESENT_HOOK.is_some() {
        return;
    }
    let Some((present, reset, present_ex, reset_ex, swapchain_present)) = d3d9_method_pointers()
    else {
        verbose_log("d3d9 install: method_pointers FAILED (throwaway D3D9 device/vtable probe)");
        return;
    };
    verbose_log("d3d9 install: method_pointers resolved, enabling detours");

    let target: D3d9PresentFn = mem::transmute(present);
    let detour: D3d9PresentFn = d3d9_present_detour;
    if let Ok(hook) = Detour::<D3d9PresentFn>::new(target, detour) {
        if hook.enable().is_ok() {
            D3D9_PRESENT_HOOK = Some(hook);
            verbose_log("d3d9 Present hooked");
        }
    }

    if D3D9_RESET_HOOK.is_none() {
        let target: D3d9ResetFn = mem::transmute(reset);
        let detour: D3d9ResetFn = d3d9_reset_detour;
        if let Ok(hook) = Detour::<D3d9ResetFn>::new(target, detour) {
            if hook.enable().is_ok() {
                D3D9_RESET_HOOK = Some(hook);
            }
        }
    }

    if let Some(reset_ex) = reset_ex {
        if D3D9_RESET_EX_HOOK.is_none() {
            let target: D3d9ResetExFn = mem::transmute(reset_ex);
            let detour: D3d9ResetExFn = d3d9_reset_ex_detour;
            if let Ok(hook) = Detour::<D3d9ResetExFn>::new(target, detour) {
                if hook.enable().is_ok() {
                    D3D9_RESET_EX_HOOK = Some(hook);
                    verbose_log("d3d9 ResetEx hooked");
                }
            }
        }
    }

    if let Some(present_ex) = present_ex {
        if D3D9_PRESENT_EX_HOOK.is_none() {
            let target: D3d9PresentExFn = mem::transmute(present_ex);
            let detour: D3d9PresentExFn = d3d9_present_ex_detour;
            if let Ok(hook) = Detour::<D3d9PresentExFn>::new(target, detour) {
                if hook.enable().is_ok() {
                    D3D9_PRESENT_EX_HOOK = Some(hook);
                    verbose_log("d3d9 PresentEx hooked");
                }
            }
        }
    }

    if let Some(swapchain_present) = swapchain_present {
        if D3D9_SWAPCHAIN_PRESENT_HOOK.is_none() {
            let target: D3d9SwapChainPresentFn = mem::transmute(swapchain_present);
            let detour: D3d9SwapChainPresentFn = d3d9_swapchain_present_detour;
            if let Ok(hook) = Detour::<D3d9SwapChainPresentFn>::new(target, detour) {
                if hook.enable().is_ok() {
                    D3D9_SWAPCHAIN_PRESENT_HOOK = Some(hook);
                    verbose_log("d3d9 SwapChain Present hooked");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_arch = "x86_64")]
    #[test]
    fn d3d9ex_pattern_matches_win11_x64_signature() {
        let bytes = [
            0x49, 0x8B, 0x86, 0x30, 0x40, 0x00, 0x00, 0x83, 0xB8, 0xA0, 0x55, 0x00, 0x00, 0x00,
            0x75, 0x12, 0x48, 0x8D, 0x15, 0xB9, 0x24, 0x0A,
        ];
        assert_eq!(d3d9ex_pattern_offsets(&bytes), Some((3, 9)));
        unsafe {
            assert_eq!(read_u32_field(bytes.as_ptr(), 3), 0x4030);
            assert_eq!(read_u32_field(bytes.as_ptr(), 9), 0x55A0);
        }
    }

    #[cfg(target_arch = "x86")]
    #[test]
    fn d3d9ex_pattern_matches_win11_x86_signature() {
        let bytes = [
            0x8B, 0x83, 0x3C, 0x2B, 0x00, 0x00, 0x39, 0xB8, 0x44, 0x4F, 0x00, 0x00, 0x75, 0x0F,
            0xBA, 0xD0, 0xC6, 0x00, 0x10, 0x90,
        ];
        assert_eq!(d3d9ex_pattern_offsets(&bytes), Some((2, 8)));
        unsafe {
            assert_eq!(read_u32_field(bytes.as_ptr(), 2), 0x2B3C);
            assert_eq!(read_u32_field(bytes.as_ptr(), 8), 0x4F44);
        }
    }
}
