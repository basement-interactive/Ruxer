// SPDX-License-Identifier: AGPL-3.0-or-later

#![deny(clippy::all)]
#![allow(unsafe_op_in_unsafe_fn)]

//! Windows game/screen capture core (Windows.Graphics.Capture + DXGI + D3D11).
//!
//! This crate was originally a napi (Node/Electron) native addon. The napi
//! surface has been stripped so it can be consumed as a plain Rust `rlib` from
//! the Tauri backend. The capture core (`CaptureInner`, the WGC/DXGI/game
//! sessions, and the capture loops) is unchanged; only the FFI shell was
//! replaced with a pure-Rust API.
//!
//! Frame delivery: frames are pushed into `fluxer_screen_frame_bus`. A consumer
//! registers a sink via `fluxer_screen_frame_bus::register_sink(capture_id, ..)`
//! and then calls [`ScreenCapture::start`] with the same `capture_id`. Alterna-
//! tively a native `NativeScreenFrameSinkHandleRef` can be installed directly
//! via [`ScreenCapture::set_frame_sink_handle`], which takes precedence.
//!
//! Lifecycle/diagnostic events: instead of a napi ThreadsafeFunction, install a
//! plain Rust callback via [`ScreenCapture::set_lifecycle_callback`].

#[cfg(any(target_os = "windows", test))]
mod compatibility;
#[cfg(any(target_os = "windows", test))]
mod dxgi_capture;
pub mod encoder_attach;
mod fallback;
#[cfg(target_os = "windows")]
mod game_capture;
mod game_capture_abi;
mod gpu_priority;
mod hdr;
#[cfg(target_os = "windows")]
mod nv12_gpu;
mod sources;
#[cfg(target_os = "windows")]
mod vulkan_layer_registry;
#[cfg(target_os = "windows")]
mod wgc_capture;

pub use encoder_attach::{EncoderAttachError, EncoderAttachStats, EncoderAttachment};

use parking_lot::{Mutex, RwLock};
use std::sync::Arc;

#[cfg(target_os = "windows")]
use dxgi_capture::DxgiCaptureSession;
use fluxer_encoder_ring::EncoderFrameRate;
#[cfg(target_os = "windows")]
use fluxer_screen_frame_bus::EnqueueOutcome;
#[cfg(target_os = "windows")]
use game_capture::GameCaptureSession;
#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
#[cfg(target_os = "windows")]
use wgc_capture::WgcCaptureSession;

const START_OPTION_UNSUPPORTED_LIMIT: usize = 4;

/// Lifecycle/diagnostic event callback. Receives `(event_type, message)`.
///
/// Formerly a napi ThreadsafeFunction dispatched to JS; now a plain Rust
/// callback. The engine-wiring layer installs this to forward events; if none
/// is installed events are silently dropped.
pub type LifecycleCallback = Arc<dyn Fn(String, String) + Send + Sync>;

#[derive(Clone, Debug)]
pub struct ScreenCaptureRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Default)]
pub struct ScreenCaptureStartOptions {
    pub show_cursor_clicks: Option<bool>,
    pub capture_rect: Option<ScreenCaptureRect>,
    pub color_range: Option<String>,
    pub color_space: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct CaptureStartOptionsDiagnostics {
    pub show_cursor_clicks: Option<bool>,
    pub capture_rect: Option<ScreenCaptureRect>,
    pub color_range: Option<String>,
    pub color_space: Option<String>,
    pub unsupported_options: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct CaptureStartResult {
    pub width: u32,
    pub height: u32,
    pub frame_rate: u32,
    pub pixel_format: String,
}

#[derive(Clone, Debug)]
pub struct ScreenCaptureSourceDescriptor {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub target_pid: Option<u32>,
}

#[derive(Clone, Debug)]
pub struct AvailabilityInfo {
    pub available: bool,
    pub backend: String,
    pub reason: Option<String>,
}

#[derive(Clone, Debug)]
pub struct CaptureDiagnostics {
    pub state: u32,
    pub api_type: u32,
    pub transport: u32,
    pub fallback_reason: u32,
    pub capture_flags: u32,
    pub width: u32,
    pub height: u32,
    pub dxgi_format: u32,
    pub frame_counter: f64,
    pub dropped_frame_counter: f64,
    pub last_present_timestamp_us: f64,
    pub last_error: u32,
    pub requested_injection_method: String,
    pub injection_method: String,
    pub active_strategy: String,
    pub last_fallback_reason: String,
    pub start_options: CaptureStartOptionsDiagnostics,
    pub frame_sink_accepted: f64,
    pub frame_sink_coalesced: f64,
    pub frame_sink_rejected: f64,
    pub media_frames_dropped_without_sink: f64,
    pub cpu_fallback_frames_dropped: f64,
}

#[derive(Clone, Debug)]
pub struct EncoderAttachDiagnostics {
    pub attached: bool,
    pub width: u32,
    pub height: u32,
    pub capacity: u32,
    pub frames_submitted: f64,
    pub frames_dropped: f64,
    pub ring_full_events: f64,
    pub failed_blits: f64,
}

#[derive(Clone, Debug)]
pub struct FrameSinkDiagnostics {
    pub accepted: f64,
    pub coalesced: f64,
    pub rejected: f64,
    pub media_frames_dropped_without_sink: f64,
    pub cpu_fallback_frames_dropped: f64,
}

#[derive(Clone, Debug)]
pub struct SharedTextureHandleInfo {
    pub handle: u64,
    pub width: u32,
    pub height: u32,
    pub dxgi_format: u32,
    pub timestamp_us: f64,
}

#[derive(Clone, Debug)]
pub struct VulkanLayerRegistrationState {
    pub registered: bool,
    pub manifest_exists: bool,
    pub dll_exists: bool,
    pub manifest_path: String,
}

pub struct CaptureInner {
    pub lifecycle_callback: Mutex<Option<LifecycleCallback>>,
    #[cfg(target_os = "windows")]
    pub session: Mutex<Option<DxgiCaptureSession>>,
    #[cfg(target_os = "windows")]
    pub(crate) wgc_session: Mutex<Option<WgcCaptureSession>>,
    #[cfg(target_os = "windows")]
    pub game_session: Mutex<Option<Arc<GameCaptureSession>>>,
    pub running: std::sync::atomic::AtomicBool,
    pub fallback: Mutex<Option<fallback::FallbackTracker>>,
    pub capture_id: Mutex<Option<String>>,
    pub start_options: Mutex<CaptureStartOptionsDiagnostics>,
    pub encoder_attachment: RwLock<Option<Arc<EncoderAttachment>>>,
    pub native_frame_sink:
        Mutex<Option<Arc<fluxer_screen_frame_bus::NativeScreenFrameSinkHandleRef>>>,
    #[cfg(target_os = "windows")]
    pub frame_sink_accepted: AtomicU64,
    #[cfg(target_os = "windows")]
    pub frame_sink_coalesced: AtomicU64,
    #[cfg(target_os = "windows")]
    pub frame_sink_rejected: AtomicU64,
    #[cfg(target_os = "windows")]
    pub media_frames_dropped_without_sink: AtomicU64,
    #[cfg(target_os = "windows")]
    pub cpu_fallback_frames_dropped: AtomicU64,
    #[cfg(target_os = "windows")]
    pub frame_sink_backpressure_emitted: AtomicBool,
    #[cfg(target_os = "windows")]
    pub frame_sink_missing_emitted: AtomicBool,
    #[cfg(target_os = "windows")]
    pub cpu_fallback_emitted: AtomicBool,
}

pub fn emit_lifecycle(inner: &CaptureInner, event_type: &str, message: &str) {
    let guard = inner.lifecycle_callback.lock();
    if let Some(callback) = guard.as_ref() {
        callback(event_type.to_string(), message.to_string());
    }
}

#[cfg(target_os = "windows")]
struct BusSharedTexture {
    handle: u64,
    width: u32,
    height: u32,
    dxgi_format: u32,
    timestamp_us: i64,
}

#[cfg(target_os = "windows")]
impl BusSharedTexture {
    fn into_bus_desc(self) -> fluxer_screen_frame_bus::SharedTextureDesc {
        fluxer_screen_frame_bus::SharedTextureDesc {
            handle: self.handle,
            width: self.width,
            height: self.height,
            dxgi_format: self.dxgi_format,
            timestamp_us: self.timestamp_us,
        }
    }
}

#[derive(Clone, Copy)]
struct FrameSinkCounterSnapshot {
    accepted: u64,
    coalesced: u64,
    rejected: u64,
    dropped_without_sink: u64,
    cpu_fallback_dropped: u64,
}

#[cfg(target_os = "windows")]
fn frame_sink_counter_snapshot(inner: &CaptureInner) -> FrameSinkCounterSnapshot {
    FrameSinkCounterSnapshot {
        accepted: inner.frame_sink_accepted.load(Ordering::Acquire),
        coalesced: inner.frame_sink_coalesced.load(Ordering::Acquire),
        rejected: inner.frame_sink_rejected.load(Ordering::Acquire),
        dropped_without_sink: inner
            .media_frames_dropped_without_sink
            .load(Ordering::Acquire),
        cpu_fallback_dropped: inner.cpu_fallback_frames_dropped.load(Ordering::Acquire),
    }
}

#[cfg(target_os = "windows")]
fn frame_sink_diagnostics_from(snapshot: FrameSinkCounterSnapshot) -> FrameSinkDiagnostics {
    FrameSinkDiagnostics {
        accepted: snapshot.accepted as f64,
        coalesced: snapshot.coalesced as f64,
        rejected: snapshot.rejected as f64,
        media_frames_dropped_without_sink: snapshot.dropped_without_sink as f64,
        cpu_fallback_frames_dropped: snapshot.cpu_fallback_dropped as f64,
    }
}

#[cfg(target_os = "windows")]
pub(crate) enum FrameSinkRef {
    Native(Arc<fluxer_screen_frame_bus::NativeScreenFrameSinkHandleRef>),
    Bus(Arc<dyn fluxer_screen_frame_bus::ScreenFrameSink>),
}

#[cfg(target_os = "windows")]
pub(crate) fn resolve_frame_sink(
    inner: &CaptureInner,
    capture_id: Option<&str>,
) -> Option<FrameSinkRef> {
    if let Some(sink) = native_frame_sink_for(inner) {
        return Some(FrameSinkRef::Native(sink));
    }
    let capture_id = capture_id?;
    fluxer_screen_frame_bus::get_sink(capture_id).map(FrameSinkRef::Bus)
}

#[cfg(target_os = "windows")]
pub(crate) fn emit_shared_texture_frame(
    inner: &CaptureInner,
    sink: &FrameSinkRef,
    handle: u64,
    width: u32,
    height: u32,
    dxgi_format: u32,
    timestamp_us: i64,
) -> bool {
    assert!(handle != 0, "shared texture handle is non-zero");
    assert!(width > 0, "shared texture width is positive");
    assert!(height > 0, "shared texture height is positive");
    let desc = BusSharedTexture {
        handle,
        width,
        height,
        dxgi_format,
        timestamp_us,
    }
    .into_bus_desc();
    let outcome = match sink {
        FrameSinkRef::Native(sink) => sink.enqueue_shared_texture(desc),
        FrameSinkRef::Bus(sink) => {
            sink.enqueue(fluxer_screen_frame_bus::ScreenFrame::SharedTexture(desc))
        }
    };
    record_frame_sink_outcome(inner, outcome);
    frame_sink_outcome_delivered(outcome)
}

/// True when the consumer requested CPU NV12 frames (via the
/// `FLUXER_SCREEN_CAPTURE_FORCE_CPU` env gate). In this mode the capture loops
/// read their GPU NV12 output back to CPU and emit `ScreenFrame::Nv12` rather
/// than a GPU shared texture, so a sink that cannot import a D3D11 texture
/// (stock livekit SDK) still receives usable frames.
#[cfg(target_os = "windows")]
pub(crate) fn cpu_nv12_readback_enabled() -> bool {
    game_capture_abi::env_flag_enabled(game_capture_abi::ENV_FORCE_CPU_NV12_READBACK)
}

/// Emit a tightly-packed CPU NV12 frame into the frame sink. The Y plane is
/// `height` rows of `width` bytes (stride `width`) followed immediately by the
/// half-height interleaved UV plane (stride `width`) — matching
/// `fluxer_screen_frame_bus::Nv12Frame`.
#[cfg(target_os = "windows")]
pub(crate) fn emit_nv12_cpu_frame(
    inner: &CaptureInner,
    sink: &FrameSinkRef,
    cpu: crate::nv12_gpu::CpuNv12,
    timestamp_us: i64,
) -> bool {
    assert!(cpu.width > 0, "cpu nv12 width is positive");
    assert!(cpu.height > 0, "cpu nv12 height is positive");
    let crate::nv12_gpu::CpuNv12 {
        data,
        width,
        height,
        stride_y,
        stride_uv,
    } = cpu;
    let outcome = match sink {
        FrameSinkRef::Native(sink) => {
            sink.enqueue_nv12_copy(&data, width, height, stride_y, stride_uv, timestamp_us)
        }
        FrameSinkRef::Bus(sink) => {
            sink.enqueue(fluxer_screen_frame_bus::ScreenFrame::Nv12(
                fluxer_screen_frame_bus::Nv12Frame {
                    data: data.into(),
                    width,
                    height,
                    stride_y,
                    stride_uv,
                    timestamp_us,
                },
            ))
        }
    };
    record_frame_sink_outcome(inner, outcome);
    frame_sink_outcome_delivered(outcome)
}

#[cfg(target_os = "windows")]
fn frame_sink_outcome_delivered(outcome: EnqueueOutcome) -> bool {
    !matches!(outcome, EnqueueOutcome::Rejected)
}

#[cfg(target_os = "windows")]
fn record_frame_sink_outcome(inner: &CaptureInner, outcome: EnqueueOutcome) {
    match outcome {
        EnqueueOutcome::Accepted => {
            inner.frame_sink_accepted.fetch_add(1, Ordering::AcqRel);
        }
        EnqueueOutcome::Coalesced => {
            inner.frame_sink_coalesced.fetch_add(1, Ordering::AcqRel);
            emit_frame_sink_backpressure_once(
                inner,
                "Windows shared texture frame coalesced by native frame sink",
            );
        }
        EnqueueOutcome::Rejected => {
            inner.frame_sink_rejected.fetch_add(1, Ordering::AcqRel);
            emit_frame_sink_backpressure_once(
                inner,
                "Windows shared texture frame rejected by native frame sink",
            );
        }
    }
}

#[cfg(target_os = "windows")]
fn emit_frame_sink_backpressure_once(inner: &CaptureInner, message: &'static str) {
    if inner
        .frame_sink_backpressure_emitted
        .swap(true, Ordering::AcqRel)
    {
        return;
    }
    emit_lifecycle(inner, "diagnostic", message);
}

#[cfg(target_os = "windows")]
pub(crate) fn note_media_frame_without_sink(inner: &CaptureInner, message: &'static str) {
    inner
        .media_frames_dropped_without_sink
        .fetch_add(1, Ordering::AcqRel);
    if inner
        .frame_sink_missing_emitted
        .swap(true, Ordering::AcqRel)
    {
        return;
    }
    emit_lifecycle(inner, "diagnostic", message);
}

#[cfg(target_os = "windows")]
pub(crate) fn note_cpu_fallback_frame_dropped(inner: &CaptureInner, message: &'static str) {
    inner
        .cpu_fallback_frames_dropped
        .fetch_add(1, Ordering::AcqRel);
    if inner.cpu_fallback_emitted.swap(true, Ordering::AcqRel) {
        return;
    }
    emit_lifecycle(inner, "diagnostic", message);
}

#[cfg(target_os = "windows")]
fn native_frame_sink_for(
    inner: &CaptureInner,
) -> Option<Arc<fluxer_screen_frame_bus::NativeScreenFrameSinkHandleRef>> {
    inner.native_frame_sink.lock().as_ref().cloned()
}

pub fn observe_fallback(
    inner: &CaptureInner,
    signature: fallback::FailureSignature,
) -> Option<fallback::FallbackDecision> {
    let decision = {
        let mut guard = inner.fallback.lock();
        guard.as_mut().map(|tracker| tracker.observe(signature))
    };
    if let Some(decision) = decision.as_ref() {
        let (kind, message) = fallback::decision_lifecycle(decision);
        emit_lifecycle(inner, kind, &message);
    }
    decision
}

pub struct ScreenCapture {
    inner: Arc<CaptureInner>,
}

impl ScreenCapture {
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        Self {
            inner: Arc::new(CaptureInner {
                lifecycle_callback: Mutex::new(None),
                #[cfg(target_os = "windows")]
                session: Mutex::new(None),
                #[cfg(target_os = "windows")]
                wgc_session: Mutex::new(None),
                #[cfg(target_os = "windows")]
                game_session: Mutex::new(None),
                running: std::sync::atomic::AtomicBool::new(false),
                fallback: Mutex::new(None),
                capture_id: Mutex::new(None),
                start_options: Mutex::new(CaptureStartOptionsDiagnostics::default()),
                encoder_attachment: RwLock::new(None),
                native_frame_sink: Mutex::new(None),
                #[cfg(target_os = "windows")]
                frame_sink_accepted: AtomicU64::new(0),
                #[cfg(target_os = "windows")]
                frame_sink_coalesced: AtomicU64::new(0),
                #[cfg(target_os = "windows")]
                frame_sink_rejected: AtomicU64::new(0),
                #[cfg(target_os = "windows")]
                media_frames_dropped_without_sink: AtomicU64::new(0),
                #[cfg(target_os = "windows")]
                cpu_fallback_frames_dropped: AtomicU64::new(0),
                #[cfg(target_os = "windows")]
                frame_sink_backpressure_emitted: AtomicBool::new(false),
                #[cfg(target_os = "windows")]
                frame_sink_missing_emitted: AtomicBool::new(false),
                #[cfg(target_os = "windows")]
                cpu_fallback_emitted: AtomicBool::new(false),
            }),
        }
    }

    /// Install a lifecycle/diagnostic event callback. `callback(event_type,
    /// message)` is invoked from the capture thread. Formerly a napi
    /// ThreadsafeFunction to JS.
    pub fn set_lifecycle_callback<F>(&self, callback: F)
    where
        F: Fn(String, String) + Send + Sync + 'static,
    {
        let mut guard = self.inner.lifecycle_callback.lock();
        *guard = Some(Arc::new(callback));
    }

    /// Install a native frame-sink handle. Frames captured while this is set are
    /// pushed directly to the native sink (takes precedence over the frame-bus
    /// `capture_id` lookup). Formerly took a napi External; now takes the
    /// retained handle ref directly.
    pub fn set_frame_sink_handle(
        &self,
        sink: Arc<fluxer_screen_frame_bus::NativeScreenFrameSinkHandleRef>,
    ) {
        let mut guard = self.inner.native_frame_sink.lock();
        *guard = Some(sink);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn start(
        &self,
        source_id: String,
        source_kind: String,
        width: Option<u32>,
        height: Option<u32>,
        frame_rate: Option<u32>,
        hook_path: Option<String>,
        hook_path_x86: Option<String>,
        injection_method: Option<String>,
        capture_id: Option<String>,
        start_options: Option<ScreenCaptureStartOptions>,
    ) -> Result<CaptureStartResult, String> {
        let start_options = record_start_options(&self.inner, start_options)?;
        let normalized_capture_id = capture_id
            .map(|raw| raw.trim().to_string())
            .filter(|trimmed| !trimmed.is_empty());
        {
            let mut guard = self.inner.capture_id.lock();
            *guard = normalized_capture_id;
        }
        #[cfg(target_os = "windows")]
        {
            self.start_windows(
                source_id,
                source_kind,
                width,
                height,
                frame_rate,
                hook_path,
                hook_path_x86,
                injection_method,
                start_options,
            )
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = (
                source_id,
                source_kind,
                width,
                height,
                frame_rate,
                hook_path,
                hook_path_x86,
                injection_method,
                start_options,
            );
            Err("native game capture only supported on Windows".to_string())
        }
    }

    pub fn get_diagnostics(&self) -> Option<CaptureDiagnostics> {
        let snapshot = {
            let guard = self.inner.fallback.lock();
            guard.as_ref().map(|tracker| tracker.snapshot())
        }?;

        #[cfg(target_os = "windows")]
        {
            let frame_sink = frame_sink_counter_snapshot(&self.inner);
            let guard = self.inner.game_session.lock();
            if let Some(session) = guard.as_ref() {
                let requested_injection_method = session.requested_injection_method().to_string();
                let injection_method = session.used_injection_method().to_string();
                if let Some(info) = session.read_shared_info() {
                    return Some(CaptureDiagnostics {
                        state: info.state,
                        api_type: info.api_type,
                        transport: info.transport,
                        fallback_reason: info.fallback_reason,
                        capture_flags: info.capture_flags,
                        width: info.width,
                        height: info.height,
                        dxgi_format: info.dxgi_format,
                        frame_counter: info.frame_counter as f64,
                        dropped_frame_counter: info.dropped_frame_counter as f64,
                        last_present_timestamp_us: info.last_present_timestamp_us as f64,
                        last_error: info.last_error,
                        requested_injection_method,
                        injection_method,
                        active_strategy: snapshot.active_strategy,
                        last_fallback_reason: snapshot.last_fallback_reason,
                        start_options: current_start_options(&self.inner),
                        frame_sink_accepted: frame_sink.accepted as f64,
                        frame_sink_coalesced: frame_sink.coalesced as f64,
                        frame_sink_rejected: frame_sink.rejected as f64,
                        media_frames_dropped_without_sink: frame_sink.dropped_without_sink as f64,
                        cpu_fallback_frames_dropped: frame_sink.cpu_fallback_dropped as f64,
                    });
                }
                return Some(strategy_only_diagnostics(
                    &snapshot,
                    requested_injection_method,
                    injection_method,
                    current_start_options(&self.inner),
                    frame_sink,
                ));
            }
            Some(strategy_only_diagnostics(
                &snapshot,
                String::new(),
                String::new(),
                current_start_options(&self.inner),
                frame_sink,
            ))
        }

        #[cfg(not(target_os = "windows"))]
        Some(strategy_only_diagnostics(
            &snapshot,
            String::new(),
            String::new(),
            current_start_options(&self.inner),
            FrameSinkCounterSnapshot {
                accepted: 0,
                coalesced: 0,
                rejected: 0,
                dropped_without_sink: 0,
                cpu_fallback_dropped: 0,
            },
        ))
    }

    pub fn get_frame_sink_diagnostics(&self) -> FrameSinkDiagnostics {
        #[cfg(target_os = "windows")]
        {
            frame_sink_diagnostics_from(frame_sink_counter_snapshot(&self.inner))
        }
        #[cfg(not(target_os = "windows"))]
        {
            FrameSinkDiagnostics {
                accepted: 0.0,
                coalesced: 0.0,
                rejected: 0.0,
                media_frames_dropped_without_sink: 0.0,
                cpu_fallback_frames_dropped: 0.0,
            }
        }
    }

    pub fn get_shared_texture_handle(&self) -> Option<SharedTextureHandleInfo> {
        #[cfg(target_os = "windows")]
        {
            let guard = self.inner.game_session.lock();
            let session = guard.as_ref()?;
            if let Some(native_texture) = session.read_native_texture_info() {
                return Some(SharedTextureHandleInfo {
                    handle: native_texture.handle,
                    width: native_texture.width,
                    height: native_texture.height,
                    dxgi_format: native_texture.dxgi_format,
                    timestamp_us: native_texture.timestamp_us as f64,
                });
            }
            None
        }
        #[cfg(not(target_os = "windows"))]
        {
            None
        }
    }

    pub fn stop(&self) -> Result<(), String> {
        self.inner
            .running
            .store(false, std::sync::atomic::Ordering::Release);
        self.inner.capture_id.lock().take();
        self.inner.native_frame_sink.lock().take();
        if let Some(attachment) = self.inner.encoder_attachment.write().take() {
            attachment.detach();
        }
        #[cfg(target_os = "windows")]
        {
            let mut guard = self.inner.session.lock();
            *guard = None;
            let mut wgc_guard = self.inner.wgc_session.lock();
            *wgc_guard = None;
            let mut game_guard = self.inner.game_session.lock();
            *game_guard = None;
        }
        {
            let mut fallback_guard = self.inner.fallback.lock();
            *fallback_guard = None;
        }
        Ok(())
    }

    pub fn attach_encoder(
        &self,
        width: u32,
        height: u32,
        frame_rate: Option<u32>,
    ) -> Result<(), String> {
        if width == 0 || height == 0 {
            return Err("ScreenCapture.attach_encoder requires positive dimensions".to_string());
        }
        let frame_rate = EncoderFrameRate::from_fps(frame_rate.unwrap_or(30));
        let attachment = EncoderAttachment::try_new_with_frame_rate(width, height, frame_rate)
            .map_err(|e| format!("attach_encoder failed: {e}"))?;
        *self.inner.encoder_attachment.write() = Some(attachment);
        emit_lifecycle(
            &self.inner,
            "diagnostic",
            &format!(
                "encoder ring attached: {width}x{height}@{}fps, capacity=8",
                frame_rate.numerator
            ),
        );
        Ok(())
    }

    pub fn detach_encoder(&self) -> Result<(), String> {
        if let Some(attachment) = self.inner.encoder_attachment.write().take() {
            attachment.detach();
        }
        emit_lifecycle(&self.inner, "diagnostic", "encoder ring detached");
        Ok(())
    }

    pub fn is_encoder_attached(&self) -> bool {
        self.inner
            .encoder_attachment
            .read()
            .as_ref()
            .map(|attachment| attachment.is_attached())
            .unwrap_or(false)
    }

    pub fn encoder_ring_full_count(&self) -> u32 {
        self.inner
            .encoder_attachment
            .read()
            .as_ref()
            .map(|attachment| attachment.stats().ring_full_events.min(u32::MAX as u64) as u32)
            .unwrap_or(0)
    }

    pub fn get_encoder_attach_diagnostics(&self) -> Option<EncoderAttachDiagnostics> {
        let guard = self.inner.encoder_attachment.read();
        let attachment = guard.as_ref()?;
        let stats = attachment.stats();
        Some(EncoderAttachDiagnostics {
            attached: attachment.is_attached(),
            width: attachment.width(),
            height: attachment.height(),
            capacity: attachment.capacity().min(u32::MAX as usize) as u32,
            frames_submitted: stats.frames_submitted as f64,
            frames_dropped: stats.frames_dropped as f64,
            ring_full_events: stats.ring_full_events as f64,
            failed_blits: stats.failed_blits as f64,
        })
    }
}

fn record_start_options(
    inner: &CaptureInner,
    options: Option<ScreenCaptureStartOptions>,
) -> Result<CaptureStartOptionsDiagnostics, String> {
    let state = build_start_option_diagnostics(options.unwrap_or_default())?;
    if !state.unsupported_options.is_empty() {
        emit_lifecycle(
            inner,
            "diagnostic",
            &format!(
                "Windows capture start options currently unsupported: {}",
                state.unsupported_options.join(", ")
            ),
        );
    }
    let mut guard = inner.start_options.lock();
    *guard = state.clone();
    Ok(state)
}

fn current_start_options(inner: &CaptureInner) -> CaptureStartOptionsDiagnostics {
    inner.start_options.lock().clone()
}

fn build_start_option_diagnostics(
    options: ScreenCaptureStartOptions,
) -> Result<CaptureStartOptionsDiagnostics, String> {
    validate_capture_rect(options.capture_rect.as_ref())?;
    validate_enum_option(
        options.color_range.as_deref(),
        "colorRange",
        &["full", "limited"],
    )?;
    validate_enum_option(
        options.color_space.as_deref(),
        "colorSpace",
        &["rec709", "srgb"],
    )?;

    let mut unsupported_options = Vec::with_capacity(START_OPTION_UNSUPPORTED_LIMIT);
    if options.show_cursor_clicks.is_some() {
        unsupported_options.push("showCursorClicks".to_string());
    }
    if options.capture_rect.is_some() {
        unsupported_options.push("captureRect".to_string());
    }
    if options.color_range.is_some() {
        unsupported_options.push("colorRange".to_string());
    }
    if options.color_space.is_some() {
        unsupported_options.push("colorSpace".to_string());
    }
    assert!(
        unsupported_options.len() <= START_OPTION_UNSUPPORTED_LIMIT,
        "unsupported start-option list bounded"
    );

    Ok(CaptureStartOptionsDiagnostics {
        show_cursor_clicks: options.show_cursor_clicks,
        capture_rect: options.capture_rect,
        color_range: options.color_range,
        color_space: options.color_space,
        unsupported_options,
    })
}

fn validate_capture_rect(rect: Option<&ScreenCaptureRect>) -> Result<(), String> {
    let Some(rect) = rect else {
        return Ok(());
    };
    if !rect.x.is_finite() || !rect.y.is_finite() {
        return Err("captureRect x/y must be finite numbers".to_string());
    }
    if !rect.width.is_finite() || !rect.height.is_finite() {
        return Err("captureRect width/height must be finite numbers".to_string());
    }
    if rect.width <= 0.0 || rect.height <= 0.0 {
        return Err("captureRect requires positive width and height".to_string());
    }
    Ok(())
}

fn validate_enum_option(value: Option<&str>, name: &str, allowed: &[&str]) -> Result<(), String> {
    let Some(value) = value else {
        return Ok(());
    };
    if allowed.contains(&value) {
        return Ok(());
    }
    Err(format!("invalid {name}: {value}"))
}

impl Drop for ScreenCapture {
    fn drop(&mut self) {
        self.inner.native_frame_sink.lock().take();
    }
}

#[cfg(target_os = "windows")]
impl ScreenCapture {
    #[allow(clippy::too_many_arguments)]
    fn start_windows(
        &self,
        source_id: String,
        source_kind: String,
        width: Option<u32>,
        height: Option<u32>,
        frame_rate: Option<u32>,
        hook_path: Option<String>,
        hook_path_x86: Option<String>,
        injection_method: Option<String>,
        _start_options: CaptureStartOptionsDiagnostics,
    ) -> Result<CaptureStartResult, String> {
        use std::sync::atomic::Ordering;

        if self.inner.running.load(Ordering::Acquire) {
            return Err("Capture already running".to_string());
        }

        if source_kind == "game" {
            return self.start_windows_game(
                source_id,
                source_kind,
                width,
                height,
                frame_rate,
                hook_path,
                hook_path_x86,
                injection_method,
                _start_options,
            );
        }
        let _ = (hook_path, hook_path_x86, injection_method);
        let target_frame_rate = frame_rate.unwrap_or(30).clamp(1, 144);
        let frame_interval =
            std::time::Duration::from_nanos(1_000_000_000 / target_frame_rate as u64);

        if source_kind == "screen" {
            let monitor = wgc_capture::parse_monitor_source_id(&source_id, &source_kind)
                .ok_or_else(|| format!("Invalid source: {source_kind}:{source_id}"))?;
            if !wgc_capture::wgc_capture_supported() {
                return Err(
                    "Windows Graphics Capture is unavailable for screen capture".to_string(),
                );
            }
            let session = WgcCaptureSession::new_monitor(monitor, width, height)
                .map_err(|e| format!("Failed to create WGC screen capture: {e}"))?;
            return self.start_windows_wgc_session(session, target_frame_rate);
        }

        let hwnd = dxgi_capture::parse_window_source_id(&source_id, &source_kind)
            .ok_or_else(|| format!("Invalid source: {source_kind}:{source_id}"))?;

        if let Some(result) = self.try_start_windows_wgc(hwnd, width, height, target_frame_rate)? {
            return Ok(result);
        }

        let session = DxgiCaptureSession::new(hwnd, width, height)
            .map_err(|e| format!("Failed to create DXGI capture: {e}"))?;

        let capture_width = session.capture_width();
        let capture_height = session.capture_height();

        {
            let mut guard = self.inner.session.lock();
            *guard = Some(session);
        }
        {
            let mut guard = self.inner.fallback.lock();
            *guard = Some(fallback::FallbackTracker::new(
                fallback::CaptureStrategy::DxgiDuplication,
            ));
        }

        self.inner.running.store(true, Ordering::Release);

        let inner = Arc::clone(&self.inner);

        std::thread::Builder::new()
            .name("dxgi-capture".into())
            .spawn(move || {
                dxgi_capture::capture_loop(&inner, frame_interval);
            })
            .map_err(|e| format!("Failed to spawn capture thread: {e}"))?;

        Ok(CaptureStartResult {
            width: capture_width,
            height: capture_height,
            frame_rate: target_frame_rate,
            pixel_format: "bgra".to_string(),
        })
    }

    fn try_start_windows_wgc(
        &self,
        hwnd: windows::Win32::Foundation::HWND,
        width: Option<u32>,
        height: Option<u32>,
        target_frame_rate: u32,
    ) -> Result<Option<CaptureStartResult>, String> {
        assert!(target_frame_rate >= 1, "frame rate at least 1");
        assert!(target_frame_rate <= 144, "frame rate at most 144");
        if !wgc_capture::wgc_capture_supported() {
            return Ok(None);
        }
        let session = match WgcCaptureSession::new(hwnd, width, height) {
            Ok(session) => session,
            Err(e) => {
                emit_lifecycle(
                    &self.inner,
                    "diagnostic",
                    &format!("WGC window capture unavailable; using DXGI duplication: {e}"),
                );
                return Ok(None);
            }
        };
        self.start_windows_wgc_session(session, target_frame_rate)
            .map(Some)
    }

    fn start_windows_wgc_session(
        &self,
        session: WgcCaptureSession,
        target_frame_rate: u32,
    ) -> Result<CaptureStartResult, String> {
        assert!(target_frame_rate >= 1, "frame rate at least 1");
        assert!(target_frame_rate <= 144, "frame rate at most 144");
        let capture_width = session.capture_width();
        let capture_height = session.capture_height();

        {
            let mut guard = self.inner.wgc_session.lock();
            *guard = Some(session);
        }
        {
            let mut guard = self.inner.fallback.lock();
            *guard = Some(fallback::FallbackTracker::new(
                fallback::CaptureStrategy::Wgc,
            ));
        }

        self.inner.running.store(true, Ordering::Release);

        let inner = Arc::clone(&self.inner);
        let frame_interval =
            std::time::Duration::from_nanos(1_000_000_000 / target_frame_rate as u64);

        std::thread::Builder::new()
            .name("wgc-capture".into())
            .spawn(move || {
                wgc_capture::capture_loop(&inner, frame_interval);
            })
            .map_err(|e| format!("Failed to spawn WGC capture thread: {e}"))?;

        Ok(CaptureStartResult {
            width: capture_width,
            height: capture_height,
            frame_rate: target_frame_rate,
            pixel_format: "bgra".to_string(),
        })
    }

    #[allow(clippy::too_many_arguments)]
    fn start_windows_game(
        &self,
        source_id: String,
        source_kind: String,
        width: Option<u32>,
        height: Option<u32>,
        frame_rate: Option<u32>,
        hook_path: Option<String>,
        hook_path_x86: Option<String>,
        injection_method: Option<String>,
        _start_options: CaptureStartOptionsDiagnostics,
    ) -> Result<CaptureStartResult, String> {
        use std::sync::atomic::Ordering;

        if game_capture_abi::env_flag_enabled(game_capture_abi::ENV_DISABLE_HOOK) {
            return Err(
                "game capture hook disabled via FLUXER_GAME_CAPTURE_DISABLE_HOOK".to_string(),
            );
        }

        let hook_path = hook_path.ok_or_else(|| "missing game capture hook DLL path".to_string())?;
        let target_frame_rate = frame_rate.unwrap_or(30).clamp(1, 144);
        let session = GameCaptureSession::new(
            &source_id,
            &source_kind,
            width,
            height,
            target_frame_rate,
            &hook_path,
            hook_path_x86.as_deref(),
            injection_method.as_deref(),
        )
        .map_err(|e| format!("Failed to create game capture: {e}"))?;
        let capture_width = session.capture_width();
        let capture_height = session.capture_height();
        let session = Arc::new(session);

        {
            let mut guard = self.inner.game_session.lock();
            *guard = Some(session);
        }
        {
            let mut guard = self.inner.fallback.lock();
            *guard = Some(fallback::FallbackTracker::new(
                fallback::CaptureStrategy::GameHook,
            ));
        }

        self.inner.running.store(true, Ordering::Release);

        let inner = Arc::clone(&self.inner);
        let frame_interval =
            std::time::Duration::from_nanos(1_000_000_000 / target_frame_rate as u64);

        std::thread::Builder::new()
            .name("game-capture".into())
            .spawn(move || {
                game_capture::capture_loop(&inner, frame_interval);
            })
            .map_err(|e| format!("Failed to spawn game capture thread: {e}"))?;

        Ok(CaptureStartResult {
            width: capture_width,
            height: capture_height,
            frame_rate: target_frame_rate,
            pixel_format: "bgra".to_string(),
        })
    }
}

fn strategy_only_diagnostics(
    snapshot: &fallback::FallbackSnapshot,
    requested_injection_method: String,
    injection_method: String,
    start_options: CaptureStartOptionsDiagnostics,
    frame_sink: FrameSinkCounterSnapshot,
) -> CaptureDiagnostics {
    CaptureDiagnostics {
        state: 0,
        api_type: 0,
        transport: 0,
        fallback_reason: 0,
        capture_flags: 0,
        width: 0,
        height: 0,
        dxgi_format: 0,
        frame_counter: 0.0,
        dropped_frame_counter: 0.0,
        last_present_timestamp_us: 0.0,
        last_error: 0,
        requested_injection_method,
        injection_method,
        active_strategy: snapshot.active_strategy.clone(),
        last_fallback_reason: snapshot.last_fallback_reason.clone(),
        start_options,
        frame_sink_accepted: frame_sink.accepted as f64,
        frame_sink_coalesced: frame_sink.coalesced as f64,
        frame_sink_rejected: frame_sink.rejected as f64,
        media_frames_dropped_without_sink: frame_sink.dropped_without_sink as f64,
        cpu_fallback_frames_dropped: frame_sink.cpu_fallback_dropped as f64,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_options_are_kept_as_explicit_unsupported_state() {
        let state = build_start_option_diagnostics(ScreenCaptureStartOptions {
            show_cursor_clicks: Some(true),
            capture_rect: Some(ScreenCaptureRect {
                x: 10.0,
                y: 20.0,
                width: 300.0,
                height: 200.0,
            }),
            color_range: Some("full".to_string()),
            color_space: Some("rec709".to_string()),
        })
        .expect("valid options");

        assert_eq!(state.show_cursor_clicks, Some(true));
        assert_eq!(state.color_range.as_deref(), Some("full"));
        assert_eq!(state.color_space.as_deref(), Some("rec709"));
        assert_eq!(
            state.unsupported_options,
            vec![
                "showCursorClicks".to_string(),
                "captureRect".to_string(),
                "colorRange".to_string(),
                "colorSpace".to_string(),
            ]
        );
    }

    #[test]
    fn capture_rect_requires_positive_dimensions() {
        let err = build_start_option_diagnostics(ScreenCaptureStartOptions {
            capture_rect: Some(ScreenCaptureRect {
                x: 0.0,
                y: 0.0,
                width: 0.0,
                height: 10.0,
            }),
            ..ScreenCaptureStartOptions::default()
        })
        .err();
        assert!(err.is_some(), "invalid captureRect is rejected");
    }
}

pub fn is_supported() -> bool {
    cfg!(target_os = "windows")
}

pub fn get_availability() -> AvailabilityInfo {
    AvailabilityInfo {
        available: cfg!(target_os = "windows"),
        backend: "windows-game-capture".to_string(),
        reason: if cfg!(target_os = "windows") {
            None
        } else {
            Some("unsupported-platform".to_string())
        },
    }
}

pub fn list_sources() -> Result<Vec<ScreenCaptureSourceDescriptor>, String> {
    Ok(sources::list_sources())
}

pub fn elevate_gpu_scheduling_priority(
    process_id: Option<u32>,
    priority_class: Option<String>,
) -> Result<(), String> {
    gpu_priority::elevate(process_id, priority_class)
}

pub fn restore_gpu_scheduling_priority(process_id: Option<u32>) -> Result<(), String> {
    gpu_priority::restore(process_id)
}

pub fn register_vulkan_layer_manifest(manifest_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        vulkan_layer_registry::register_manifest(&manifest_path)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = manifest_path;
        Err("Vulkan game capture layer only supported on Windows".to_string())
    }
}

pub fn unregister_vulkan_layer_manifest(manifest_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        vulkan_layer_registry::unregister_manifest(&manifest_path)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = manifest_path;
        Err("Vulkan game capture layer only supported on Windows".to_string())
    }
}

pub fn get_vulkan_layer_registration_state(manifest_path: String) -> VulkanLayerRegistrationState {
    #[cfg(target_os = "windows")]
    {
        let state = vulkan_layer_registry::registration_state(&manifest_path);
        VulkanLayerRegistrationState {
            registered: state.registered,
            manifest_exists: state.manifest_exists,
            dll_exists: state.dll_exists,
            manifest_path: state.manifest_path,
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        VulkanLayerRegistrationState {
            registered: false,
            manifest_exists: false,
            dll_exists: false,
            manifest_path,
        }
    }
}
