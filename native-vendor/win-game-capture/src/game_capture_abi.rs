// SPDX-License-Identifier: AGPL-3.0-or-later

#![allow(dead_code)]

pub const GAME_CAPTURE_MAGIC: u32 = 0x4658_4743;
pub const GAME_CAPTURE_ABI_VERSION: u32 = 4;
pub const GAME_CAPTURE_ABI_VERSION_PRESENT_CLOCK: u32 = 4;

pub const GAME_CAPTURE_PRESENT_CLOCK_WALL: u32 = 0;
pub const GAME_CAPTURE_PRESENT_CLOCK_QPC: u32 = 1;

pub const GAME_CAPTURE_STATE_INIT: u32 = 0;
pub const GAME_CAPTURE_STATE_ACTIVE: u32 = 1;
pub const GAME_CAPTURE_STATE_STOPPED: u32 = 2;
pub const GAME_CAPTURE_STATE_ERROR: u32 = 3;
pub const GAME_CAPTURE_STATE_RESIZE_REQUIRED: u32 = 4;

pub const GAME_CAPTURE_BUFFER_COUNT: usize = 2;
pub const GAME_CAPTURE_BYTES_PER_PIXEL: u32 = 4;
pub const GAME_CAPTURE_TRANSPORT_MEMORY: u32 = 0;
pub const GAME_CAPTURE_TRANSPORT_SHARED_TEXTURE: u32 = 1;

pub const GAME_CAPTURE_API_UNKNOWN: u32 = 0;
pub const GAME_CAPTURE_API_OPENGL: u32 = 1;
pub const GAME_CAPTURE_API_D3D8: u32 = 2;
pub const GAME_CAPTURE_API_D3D9: u32 = 3;
pub const GAME_CAPTURE_API_D3D10: u32 = 4;
pub const GAME_CAPTURE_API_D3D11: u32 = 5;
pub const GAME_CAPTURE_API_D3D12: u32 = 6;
pub const GAME_CAPTURE_API_VULKAN: u32 = 7;

pub const GAME_CAPTURE_FALLBACK_NONE: u32 = 0;
pub const GAME_CAPTURE_FALLBACK_SHARED_TEXTURE_UNSUPPORTED: u32 = 1;
pub const GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED: u32 = 2;
pub const GAME_CAPTURE_FALLBACK_FORCED_CPU: u32 = 3;
pub const GAME_CAPTURE_FALLBACK_EXTERNAL_MEMORY_UNSUPPORTED: u32 = 4;
pub const GAME_CAPTURE_FALLBACK_MULTISAMPLED: u32 = 5;
pub const GAME_CAPTURE_FALLBACK_DEVICE_LOST: u32 = 6;

pub const GAME_CAPTURE_FLAG_HDR: u32 = 1 << 0;
pub const GAME_CAPTURE_FLAG_MULTISAMPLED: u32 = 1 << 1;
pub const GAME_CAPTURE_FLAG_FLIP_VERTICAL: u32 = 1 << 2;
pub const GAME_CAPTURE_FLAG_PROTECTED: u32 = 1 << 3;
pub const GAME_CAPTURE_FLAG_TEN_BIT: u32 = 1 << 4;

pub const ENV_DISABLE_HOOK: &str = "FLUXER_GAME_CAPTURE_DISABLE_HOOK";
pub const ENV_DISABLE_D3D12: &str = "FLUXER_GAME_CAPTURE_DISABLE_D3D12";
pub const ENV_DISABLE_VULKAN: &str = "DISABLE_FLUXER_VULKAN_CAPTURE";
pub const ENV_FORCE_CPU: &str = "FLUXER_GAME_CAPTURE_FORCE_CPU";
/// When set (non-empty), every capture backend (WGC / DXGI / game) reads its
/// GPU NV12 output back to CPU memory and emits `ScreenFrame::Nv12` instead of a
/// GPU `ScreenFrame::SharedTexture`. Consumers that cannot import a D3D11 shared
/// texture into their encoder (e.g. voice-native on the stock livekit SDK) set
/// this before `ScreenCapture::start`. Mirror of the Linux crate's
/// `FLUXER_SCREEN_CAPTURE_DMABUF=off` CPU-forcing gate.
pub const ENV_FORCE_CPU_NV12_READBACK: &str = "FLUXER_SCREEN_CAPTURE_FORCE_CPU";
pub const ENV_FORCE_SHARED_TEXTURE: &str = "FLUXER_GAME_CAPTURE_FORCE_SHARED_TEXTURE";
pub const ENV_ENABLE_OPENGL_SHARED_TEXTURE: &str =
    "FLUXER_GAME_CAPTURE_ENABLE_OPENGL_SHARED_TEXTURE";
pub const ENV_DISABLE_OPENGL_SHARED_TEXTURE: &str =
    "FLUXER_GAME_CAPTURE_DISABLE_OPENGL_SHARED_TEXTURE";
pub const ENV_VERBOSE: &str = "FLUXER_GAME_CAPTURE_VERBOSE";
pub const ENV_INJECT_METHOD: &str = "FLUXER_GAME_CAPTURE_INJECT_METHOD";

pub const GAME_CAPTURE_CONTROL_DISABLE_SHARED_TEXTURE: u32 = 1 << 0;

pub fn env_flag_enabled(name: &str) -> bool {
    std::env::var_os(name)
        .map(|value| !value.is_empty())
        .unwrap_or(false)
}

pub const GAME_CAPTURE_INFO_PREFIX: &str = "FluxerGameCapture_Info_";
pub const GAME_CAPTURE_FRAME_PREFIX: &str = "FluxerGameCapture_Frame_";
pub const GAME_CAPTURE_READY_PREFIX: &str = "FluxerGameCapture_Ready_";
pub const GAME_CAPTURE_STOP_PREFIX: &str = "FluxerGameCapture_Stop_";
pub const GAME_CAPTURE_KEEPALIVE_PREFIX: &str = "FluxerGameCapture_KeepAlive_";
pub const GAME_CAPTURE_MUTEX_PREFIX: &str = "FluxerGameCapture_FrameMutex_";

#[repr(C)]
#[derive(Clone, Copy)]
pub struct GameCaptureSharedInfo {
    pub magic: u32,
    pub version: u32,
    pub state: u32,
    pub last_error: u32,
    pub hwnd: u64,
    pub max_width: u32,
    pub max_height: u32,
    pub width: u32,
    pub height: u32,
    pub pitch: u32,
    pub frame_index: u32,
    pub frame_counter: u64,
    pub timestamp_us: i64,
    pub target_frame_interval_ns: u64,
    pub transport: u32,
    pub dxgi_format: u32,
    pub texture_handle: u64,
    pub api_type: u32,
    pub fallback_reason: u32,
    pub capture_flags: u32,
    pub dropped_frame_counter: u64,
    pub last_present_timestamp_us: i64,
    pub control: u32,
    pub present_clock: u32,
    pub reserved: [u32; 23],
}

const _: () = assert!(std::mem::size_of::<GameCaptureSharedInfo>() == 224);

impl GameCaptureSharedInfo {
    pub fn new(hwnd: u64, max_width: u32, max_height: u32, frame_rate: u32) -> Self {
        Self {
            magic: GAME_CAPTURE_MAGIC,
            version: GAME_CAPTURE_ABI_VERSION,
            state: GAME_CAPTURE_STATE_INIT,
            last_error: 0,
            hwnd,
            max_width,
            max_height,
            width: 0,
            height: 0,
            pitch: max_width.saturating_mul(GAME_CAPTURE_BYTES_PER_PIXEL),
            frame_index: 0,
            frame_counter: 0,
            timestamp_us: 0,
            target_frame_interval_ns: frame_interval_ns(frame_rate),
            transport: GAME_CAPTURE_TRANSPORT_MEMORY,
            dxgi_format: 0,
            texture_handle: 0,
            api_type: GAME_CAPTURE_API_UNKNOWN,
            fallback_reason: GAME_CAPTURE_FALLBACK_NONE,
            capture_flags: 0,
            dropped_frame_counter: 0,
            last_present_timestamp_us: 0,
            control: 0,
            present_clock: GAME_CAPTURE_PRESENT_CLOCK_WALL,
            reserved: [0; 23],
        }
    }
}

pub fn host_supports_present_clock(version: u32) -> bool {
    version >= GAME_CAPTURE_ABI_VERSION_PRESENT_CLOCK
}

pub fn qpc_ticks_to_us(ticks: i64, frequency: i64) -> i64 {
    if frequency <= 0 {
        return 0;
    }
    if ticks <= 0 {
        return 0;
    }
    let whole_second_us = (ticks / frequency).saturating_mul(1_000_000);
    let fractional_us = (ticks % frequency).saturating_mul(1_000_000) / frequency;
    whole_second_us.saturating_add(fractional_us)
}

pub fn presented_recently(
    present_clock: u32,
    last_present_us: i64,
    wall_now_us: i64,
    qpc_now_us: i64,
    window_us: i64,
) -> bool {
    assert!(window_us > 0);
    if last_present_us <= 0 {
        return false;
    }
    let now_us = if present_clock == GAME_CAPTURE_PRESENT_CLOCK_QPC {
        qpc_now_us
    } else {
        wall_now_us
    };
    now_us.saturating_sub(last_present_us) < window_us
}

#[cfg(target_os = "windows")]
pub fn qpc_now_us() -> i64 {
    use windows_sys::Win32::System::Performance::{
        QueryPerformanceCounter, QueryPerformanceFrequency,
    };
    let mut ticks = 0i64;
    let mut frequency = 0i64;
    let counter_ok = unsafe { QueryPerformanceCounter(&mut ticks) };
    let frequency_ok = unsafe { QueryPerformanceFrequency(&mut frequency) };
    if counter_ok == 0 || frequency_ok == 0 {
        return 0;
    }
    qpc_ticks_to_us(ticks, frequency)
}

pub fn frame_interval_ns(frame_rate: u32) -> u64 {
    let rate = frame_rate.clamp(1, 144) as u64;
    1_000_000_000 / rate
}

pub fn frame_buffer_stride(width: u32) -> u32 {
    width.saturating_mul(GAME_CAPTURE_BYTES_PER_PIXEL)
}

pub fn frame_buffer_size(width: u32, height: u32) -> Option<usize> {
    frame_buffer_stride(width)
        .checked_mul(height)?
        .try_into()
        .ok()
}

pub fn shared_frame_mapping_size(width: u32, height: u32) -> Option<usize> {
    frame_buffer_size(width, height)?.checked_mul(GAME_CAPTURE_BUFFER_COUNT)
}

pub fn object_name(prefix: &str, pid: u32) -> String {
    format!("{prefix}{pid}")
}

pub fn mutex_name(pid: u32, index: usize) -> String {
    format!("{GAME_CAPTURE_MUTEX_PREFIX}{index}_{pid}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qpc_ticks_to_us_converts_whole_and_fractional_seconds() {
        assert_eq!(qpc_ticks_to_us(10_000_000, 10_000_000), 1_000_000);
        assert_eq!(qpc_ticks_to_us(15_000_000, 10_000_000), 1_500_000);
        assert_eq!(qpc_ticks_to_us(1, 10_000_000), 0);
        assert_eq!(qpc_ticks_to_us(10, 10_000_000), 1);
    }

    #[test]
    fn qpc_ticks_to_us_does_not_overflow_for_long_uptimes() {
        let frequency = 3_800_000_000i64;
        let uptime_seconds = 400 * 24 * 60 * 60i64;
        let ticks = frequency * uptime_seconds;
        assert_eq!(
            qpc_ticks_to_us(ticks, frequency),
            uptime_seconds * 1_000_000
        );
    }

    #[test]
    fn qpc_ticks_to_us_rejects_invalid_inputs() {
        assert_eq!(qpc_ticks_to_us(123, 0), 0);
        assert_eq!(qpc_ticks_to_us(123, -1), 0);
        assert_eq!(qpc_ticks_to_us(-123, 10_000_000), 0);
        assert_eq!(qpc_ticks_to_us(0, 10_000_000), 0);
    }

    #[test]
    fn host_supports_present_clock_gates_on_abi_version() {
        assert!(!host_supports_present_clock(0));
        assert!(!host_supports_present_clock(3));
        assert!(host_supports_present_clock(4));
        assert!(host_supports_present_clock(5));
    }

    #[test]
    fn presented_recently_uses_wall_clock_for_legacy_hooks() {
        assert!(presented_recently(
            GAME_CAPTURE_PRESENT_CLOCK_WALL,
            1_000_000,
            1_500_000,
            i64::MAX,
            1_000_000
        ));
        assert!(!presented_recently(
            GAME_CAPTURE_PRESENT_CLOCK_WALL,
            1_000_000,
            2_000_000,
            0,
            1_000_000
        ));
    }

    #[test]
    fn presented_recently_uses_qpc_for_present_clock_hooks() {
        assert!(presented_recently(
            GAME_CAPTURE_PRESENT_CLOCK_QPC,
            1_000_000,
            i64::MAX,
            1_500_000,
            1_000_000
        ));
        assert!(!presented_recently(
            GAME_CAPTURE_PRESENT_CLOCK_QPC,
            1_000_000,
            0,
            2_000_000,
            1_000_000
        ));
    }

    #[test]
    fn presented_recently_requires_an_observed_present() {
        assert!(!presented_recently(
            GAME_CAPTURE_PRESENT_CLOCK_WALL,
            0,
            1,
            1,
            1_000_000
        ));
        assert!(!presented_recently(
            GAME_CAPTURE_PRESENT_CLOCK_QPC,
            -1,
            1,
            1,
            1_000_000
        ));
    }
}
