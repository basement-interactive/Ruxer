//! Screen-share video capture + publishing for the native voice engine.
//!
//! Ports the reference engine's screen-video path
//! (`fluxer_desktop/native/webrtc-sender/src/engine.rs`) onto our workspace's
//! stripped capture crates (`fluxer_win_game_capture` /
//! `fluxer_linux_screen_capture`) and the *stock* upstream livekit Rust SDK.
//!
//! # Pipeline
//!
//! ```text
//!   platform ScreenCapture  ──push frames──►  fluxer_screen_frame_bus
//!        (WGC / PipeWire)                        (registered sink)
//!                                                     │
//!                                                     ▼
//!                                          BusVideoSink::enqueue
//!                                        (ScreenFrame → PendingFrame)
//!                                                     │  ArrayQueue
//!                                                     ▼
//!                                          frame-pump worker task
//!                                    (PendingFrame → livekit VideoFrame,
//!                                     NativeVideoSource::capture_frame)
//! ```
//!
//! # Frame format — CPU path only (stock SDK constraint)
//!
//! The reference relied on a **forked** libwebrtc whose `NativeBuffer` exposed
//! `from_fluxer_d3d11_texture` / `from_fluxer_dmabuf_texture`, letting it hand
//! GPU textures straight to the encoder (zero-copy). This workspace pins the
//! *stock* `livekit/rust-sdks` (rev 95187df), whose `NativeBuffer` has only
//! `from_cv_pixel_buffer` (macOS). There is therefore **no way to accept a
//! Windows D3D11 shared-texture handle or a Linux multi-plane DMA-BUF** into a
//! livekit `VideoFrame` on this SDK.
//!
//! So this first pass is a **correct CPU path**:
//!   * `ScreenFrame::Nv12` → `NV12Buffer` (Linux memfd/CPU capture). Works.
//!   * `ScreenFrame::Bgra` → `I420Buffer` (BGRA→I420). Works.
//!   * `ScreenFrame::Dmabuf` (Linux) → **rejected** — the stock SDK cannot
//!     import a multi-plane PipeWire DMA-BUF. On Linux we force the CPU-memfd
//!     path via `FLUXER_SCREEN_CAPTURE_DMABUF=off` in [`configure_linux_cpu_capture`]
//!     so NV12 CPU frames arrive instead. TODO(zero-copy): a real DMA-BUF path
//!     needs either an SDK fork or a GPU→CPU download here.
//!   * `ScreenFrame::Nv12` (Windows) → `NV12Buffer`. The Windows capture crate
//!     converts each frame to GPU NV12 then reads it back to CPU when
//!     `FLUXER_SCREEN_CAPTURE_FORCE_CPU` is set (see
//!     [`configure_windows_cpu_capture`]), so CPU NV12 frames arrive here just
//!     like the Linux memfd path. Works.
//!   * `ScreenFrame::SharedTexture` (Windows) → **rejected** — a raw GPU handle
//!     can't be imported into a stock-SDK `VideoFrame`. With CPU mode forced on
//!     (above) the crate emits `ScreenFrame::Nv12` instead, so this arm is only
//!     a defensive fallback.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crossbeam_queue::ArrayQueue;
use fluxer_screen_frame_bus::{
    self as frame_bus, BgraFrame as BusBgraFrame, EnqueueOutcome, Nv12Frame as BusNv12Frame,
    ScreenFrame as BusScreenFrame, ScreenFrameSink,
};
use livekit::options::{TrackPublishOptions, VideoCodec, VideoEncoderBackend, VideoEncoding};
use livekit::track::{LocalTrack, LocalVideoTrack, TrackSource};
use livekit::webrtc::video_frame::{I420Buffer, NV12Buffer, VideoFrame, VideoRotation};
use livekit::webrtc::video_source::native::NativeVideoSource;
use livekit::webrtc::video_source::{RtcVideoSource, VideoResolution};
use livekit::{Room, prelude::TrackSid};
use tokio::sync::Notify;

use crate::{VoiceEngineError, VoiceResult};

// The platform capture crate is cfg-selected. Each exposes a `ScreenCapture`
// with `new()/start(..)/stop()` plus a free `list_sources()`, so the rest of
// this module stays platform-agnostic by aliasing the concrete type.
#[cfg(target_os = "windows")]
use fluxer_win_game_capture as platform_capture;
#[cfg(target_os = "linux")]
use fluxer_linux_screen_capture as platform_capture;

/// Bounded queue between the frame-bus sink (producer, on the capture thread)
/// and the pump worker (consumer, a tokio task). Matches the reference's
/// `ENCODER_QUEUE_CAPACITY` intent: small, and full pushes coalesce (drop the
/// oldest) so a slow encoder never unbounds memory or adds latency.
const PENDING_QUEUE_CAPACITY: usize = 8;

/// A source descriptor for the client's screen-share picker. Field names match
/// the shim's expected shape (`{id, name, kind}`) so the Tauri command layer
/// passes it straight through.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ScreenSource {
    pub id: String,
    pub name: String,
    /// `"screen"` | `"window"` | `"game"`.
    pub kind: String,
}

/// Enumerate capturable screen/window sources on this platform.
///
/// On Linux this opens an xdg-desktop-portal ScreenCast session and drives the
/// **compositor's own picker** (Wayland owns source selection — the app cannot
/// pre-pick); the returned list reflects the user's choice, and the live portal
/// session is parked for the immediately-following `publish_screen` to adopt.
/// It performs blocking D-Bus I/O + shows a modal dialog, so callers run it off
/// the UI thread. On Windows it enumerates monitors + top-level windows.
pub fn list_screen_sources() -> VoiceResult<Vec<ScreenSource>> {
    #[cfg(target_os = "windows")]
    {
        let sources = platform_capture::list_sources()
            .map_err(|e| VoiceEngineError::Publish(format!("list_sources: {e}")))?;
        Ok(sources
            .into_iter()
            .map(|s| ScreenSource { id: s.id, name: s.name, kind: s.kind })
            .collect())
    }
    #[cfg(target_os = "linux")]
    {
        let sources = platform_capture::list_sources()
            .map_err(|e| VoiceEngineError::Publish(format!("list_sources: {e}")))?;
        Ok(sources
            .into_iter()
            .map(|s| ScreenSource { id: s.id, name: s.name, kind: s.kind })
            .collect())
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err(VoiceEngineError::Publish(
            "native screen capture is only supported on Windows and Linux".into(),
        ))
    }
}

/// One frame waiting in the queue, already in a CPU pixel format the stock SDK
/// can turn into a `VideoFrame`. GPU-texture variants are intentionally absent:
/// see the module doc — they can't be built into a stock-SDK `VideoFrame`, so
/// the sink rejects them before they'd ever reach the queue.
enum PendingFrame {
    Nv12 {
        data: Vec<u8>,
        width: u32,
        height: u32,
        stride_y: u32,
        stride_uv: u32,
        timestamp_us: i64,
    },
    Bgra {
        data: Vec<u8>,
        width: u32,
        height: u32,
        stride: u32,
        timestamp_us: i64,
    },
}

/// Frame-bus sink: converts each incoming `ScreenFrame` to a `PendingFrame` and
/// pushes it onto the bounded queue, waking the pump worker. Registered under a
/// generated `capture_id` that the platform `ScreenCapture::start` also gets, so
/// the capture crate routes its frames here (`frame_bus::get_sink`).
struct BusVideoSink {
    pending: Arc<ArrayQueue<PendingFrame>>,
    notify: Arc<Notify>,
    stop: Arc<AtomicBool>,
}

impl ScreenFrameSink for BusVideoSink {
    fn enqueue(&self, frame: BusScreenFrame) -> EnqueueOutcome {
        if self.stop.load(Ordering::Acquire) {
            return EnqueueOutcome::Rejected;
        }
        let pending = match frame {
            BusScreenFrame::Nv12(BusNv12Frame {
                data,
                width,
                height,
                stride_y,
                stride_uv,
                timestamp_us,
            }) => PendingFrame::Nv12 {
                data: data.into_vec(),
                width,
                height,
                stride_y,
                stride_uv,
                timestamp_us,
            },
            BusScreenFrame::Bgra(BusBgraFrame { data, width, height, stride, timestamp_us }) => {
                PendingFrame::Bgra { data, width, height, stride, timestamp_us }
            }
            // GPU-texture frames can't be built into a stock-SDK VideoFrame:
            //  * Windows SharedTexture — needs NativeBuffer::from_fluxer_d3d11_texture
            //    (fork-only). The Windows path is configured for CPU NV12 readback
            //    instead (see configure_windows_cpu_capture, which sets
            //    FLUXER_SCREEN_CAPTURE_FORCE_CPU so the capture crate emits
            //    ScreenFrame::Nv12), so this arm shouldn't normally fire.
            //  * Linux Dmabuf — needs multi-plane DMA-BUF import (fork-only); the
            //    Linux path is configured for CPU NV12 instead (see
            //    configure_linux_cpu_capture), so this arm shouldn't normally fire.
            #[cfg(target_os = "windows")]
            BusScreenFrame::SharedTexture(_) => return EnqueueOutcome::Rejected,
            #[cfg(target_os = "linux")]
            BusScreenFrame::Dmabuf(_) => return EnqueueOutcome::Rejected,
            #[cfg(target_os = "macos")]
            BusScreenFrame::MacCvPixelBuffer(_) => return EnqueueOutcome::Rejected,
        };
        // force_push drops+returns the OLDEST on a full queue (coalesce): a
        // stalled encoder gets the freshest frame, never old backlog.
        let coalesced = self.pending.force_push(pending).is_some();
        self.notify.notify_one();
        if coalesced { EnqueueOutcome::Coalesced } else { EnqueueOutcome::Accepted }
    }
}

/// Everything a live screen-share publication owns. Dropped/torn down by
/// `unpublish_screen`. The capture handle and the pump worker keep frames
/// flowing; `stop` signals the worker to exit and the sink to reject.
pub struct ScreenShareSlot {
    /// The published LiveKit track's SID — used to unpublish from the room.
    pub track_sid: TrackSid,
    /// The frame-bus id this publication registered its sink under.
    capture_id: String,
    /// Platform capture session (WGC / PipeWire). Dropping it stops capture.
    capture: platform_capture::ScreenCapture,
    /// Shared stop flag: set on teardown to exit the pump + reject late frames.
    stop: Arc<AtomicBool>,
    /// Wakes the pump so it observes `stop` promptly and exits.
    notify: Arc<Notify>,
}

impl ScreenShareSlot {
    /// Signal the pump worker + sink to stop and drop the capture session.
    /// Idempotent. The pump task exits on its own once it sees `stop`.
    pub fn shutdown(&self) {
        self.stop.store(true, Ordering::Release);
        self.notify.notify_waiters();
        let _ = self.capture.stop();
        frame_bus::unregister_sink(&self.capture_id);
    }
}

impl Drop for ScreenShareSlot {
    fn drop(&mut self) {
        // Belt-and-suspenders: even if unpublish_screen forgot, dropping the
        // slot must not leave a dangling sink registered or capture running.
        self.stop.store(true, Ordering::Release);
        self.notify.notify_waiters();
        let _ = self.capture.stop();
        frame_bus::unregister_sink(&self.capture_id);
    }
}

/// Map a client codec string to the SDK enum. `None`/empty → SDK default (VP8).
/// Unknown strings are treated as "let the SDK decide" rather than an error, so
/// a codec the client negotiates that we don't map doesn't fail the publish.
fn parse_codec(codec: &str) -> Option<VideoCodec> {
    match codec.trim().to_ascii_lowercase().as_str() {
        "" => None,
        "vp8" => Some(VideoCodec::VP8),
        "vp9" => Some(VideoCodec::VP9),
        "h264" => Some(VideoCodec::H264),
        "av1" => Some(VideoCodec::AV1),
        "h265" => Some(VideoCodec::H265),
        _ => None,
    }
}

/// Force the Linux capture crate onto its CPU (memfd NV12) path instead of
/// DMA-BUF, because the stock SDK can't import a multi-plane DMA-BUF. Sets the
/// crate's `FLUXER_SCREEN_CAPTURE_DMABUF=off` gate unless the operator already
/// set it. No-op on other platforms.
#[cfg(target_os = "linux")]
fn configure_linux_cpu_capture() {
    // SAFETY: single-threaded relative to capture start; set once before start.
    if std::env::var_os("FLUXER_SCREEN_CAPTURE_DMABUF").is_none() {
        unsafe { std::env::set_var("FLUXER_SCREEN_CAPTURE_DMABUF", "off") };
    }
}

/// Force the Windows capture crate to read its GPU NV12 output back to CPU and
/// emit `ScreenFrame::Nv12`, because the stock livekit SDK can't import a D3D11
/// shared texture. Sets the crate's `FLUXER_SCREEN_CAPTURE_FORCE_CPU` gate
/// unless the operator already set it. Analogous to
/// [`configure_linux_cpu_capture`]. No-op on other platforms.
#[cfg(target_os = "windows")]
fn configure_windows_cpu_capture() {
    // SAFETY: single-threaded relative to capture start; set once before start.
    if std::env::var_os("FLUXER_SCREEN_CAPTURE_FORCE_CPU").is_none() {
        unsafe { std::env::set_var("FLUXER_SCREEN_CAPTURE_FORCE_CPU", "1") };
    }
}

/// Publish a screen-share video track onto `room` and start the capture →
/// bus → pump pipeline feeding it.
///
/// Returns the populated [`ScreenShareSlot`] the caller stores on the session.
/// On a partial publish (track up but capture failed) we clean up inline:
/// the track is unpublished before erroring so the room never carries a dead
/// screen track.
#[allow(clippy::too_many_arguments)]
pub async fn publish_screen(
    room: &Room,
    source_id: &str,
    source_kind: &str,
    width: u32,
    height: u32,
    fps: u32,
    max_bitrate_bps: Option<u64>,
    codec: &str,
    capture_id: Option<&str>,
) -> VoiceResult<ScreenShareSlot> {
    if !valid_even_dims(width, height) {
        return Err(VoiceEngineError::Publish(format!(
            "invalid screen dimensions {width}x{height} (must be even, 2..=8192)"
        )));
    }

    // is_screencast=true: tells the source its content is a screen (affects the
    // encoder's degradation preference — maintain resolution over frame rate).
    let source = NativeVideoSource::new(VideoResolution { width, height }, true);
    // The track NAME must be the client's captureId: VoiceEngineV2's coordinator
    // (recordPublishedTrackSid) drops any published screen track whose trackName
    // != the active captureId as "stale ... for a different capture", which made
    // the client abandon the native publish and fall back to browser
    // getDisplayMedia (WebView2 dialog + wrong/green capture + uncapped preview).
    // Fall back to "screen" when no captureId was supplied.
    let track_name = capture_id.filter(|s| !s.is_empty()).unwrap_or("screen");
    let track =
        LocalVideoTrack::create_video_track(track_name, RtcVideoSource::Native(source.clone()));

    let mut options = TrackPublishOptions {
        source: TrackSource::Screenshare,
        // Screen simulcast is left off: our path publishes a single layer and
        // simulcast would ask the encoder for extra downscaled layers we don't
        // need.
        simulcast: false,
        // Prefer a HARDWARE encoder (NVENC / VAAPI / AMF / VideoToolbox). The SDK
        // routes to a HW factory when one is compiled + supported for the chosen
        // codec, and logs a warning + falls back to software otherwise — so this
        // is safe on machines/platforms without HW encode (e.g. stock-SDK Windows,
        // or a VP8/VP9 codec which no HW factory advertises). HW encode is the
        // difference between smooth high-res screenshare and a CPU-bound blocky
        // few-fps stream. Note: NVENC/VAAPI/AMF only accelerate H264/H265/AV1 —
        // the CLIENT already prefers those codecs when its GPU report says HW is
        // available (getGpuInfo), so `codec` here is usually a HW-capable one.
        video_encoder: VideoEncoderBackend::Hardware,
        ..Default::default()
    };
    if let Some(video_codec) = parse_codec(codec) {
        options.video_codec = video_codec;
    }
    if let Some(bitrate) = max_bitrate_bps.filter(|b| *b > 0) {
        options.video_encoding = Some(VideoEncoding {
            max_bitrate: bitrate,
            max_framerate: if fps > 0 { fps as f64 } else { 30.0 },
        });
    }

    let publication = room
        .local_participant()
        .publish_track(LocalTrack::Video(track), options)
        .await
        .map_err(|e| VoiceEngineError::Publish(format!("publish screen track: {e}")))?;
    let track_sid = publication.sid();

    // Generate a capture id unique to this publication and register the sink
    // BEFORE starting capture, so the very first captured frame has somewhere
    // to land (start→get_sink race avoided).
    let capture_id = generate_capture_id(&track_sid);
    let stop = Arc::new(AtomicBool::new(false));
    let notify = Arc::new(Notify::new());
    let pending = Arc::new(ArrayQueue::new(PENDING_QUEUE_CAPACITY));

    let sink = Arc::new(BusVideoSink {
        pending: pending.clone(),
        notify: notify.clone(),
        stop: stop.clone(),
    });
    frame_bus::register_sink(capture_id.clone(), sink);

    // Spawn the pump worker (bus queue → livekit source) before capture starts.
    spawn_pump_worker(source, pending, notify.clone(), stop.clone(), fps);

    // Start the platform capture pushing into our registered sink.
    let capture = platform_capture::ScreenCapture::new();
    if let Err(e) = start_platform_capture(
        &capture,
        source_id,
        source_kind,
        width,
        height,
        fps,
        &capture_id,
    ) {
        // Roll back: stop the pump, drop the sink, unpublish the dead track.
        stop.store(true, Ordering::Release);
        notify.notify_waiters();
        frame_bus::unregister_sink(&capture_id);
        let _ = room.local_participant().unpublish_track(&track_sid).await;
        return Err(VoiceEngineError::Publish(format!("start capture: {e}")));
    }

    Ok(ScreenShareSlot { track_sid, capture_id, capture, stop, notify })
}

/// Tear down a live publication: stop capture + pump + sink, then unpublish the
/// track from the room.
pub async fn unpublish_screen(room: &Room, slot: ScreenShareSlot) -> VoiceResult<()> {
    // Stop capture/pump/sink first (synchronous, cheap), then unpublish.
    slot.shutdown();
    let track_sid = slot.track_sid.clone();
    // Drop the slot (and its capture handle) before awaiting the unpublish so
    // the platform session is released promptly.
    drop(slot);
    room.local_participant()
        .unpublish_track(&track_sid)
        .await
        .map_err(|e| VoiceEngineError::Publish(format!("unpublish screen track: {e}")))?;
    Ok(())
}

/// The frame pump: pulls `PendingFrame`s off the bus queue and hands them to the
/// livekit `NativeVideoSource` as `VideoFrame`s. Runs until `stop` is set. FPS
/// is honored by the source-side pacing built into the capture crate; this
/// worker just converts+forwards as fast as frames arrive (dropping stale ones
/// happens at enqueue via coalescing).
fn spawn_pump_worker(
    source: NativeVideoSource,
    pending: Arc<ArrayQueue<PendingFrame>>,
    notify: Arc<Notify>,
    stop: Arc<AtomicBool>,
    _fps: u32,
) {
    tokio::spawn(async move {
        loop {
            if stop.load(Ordering::Acquire) {
                break;
            }
            let Some(frame) = pending.pop() else {
                // Wait to be woken by an enqueue or a stop; a short timeout also
                // guards against a missed notification during teardown.
                let _ = tokio::time::timeout(Duration::from_millis(250), notify.notified()).await;
                continue;
            };
            capture_pending_frame(&source, frame);
        }
    });
}

/// Convert one `PendingFrame` to a livekit `VideoFrame` and push it to `source`.
/// Ported from the reference's `capture_nv12_to_source`/`capture_bgra_to_source`.
fn capture_pending_frame(source: &NativeVideoSource, frame: PendingFrame) {
    match frame {
        PendingFrame::Nv12 { data, width, height, stride_y, stride_uv, timestamp_us } => {
            let mut buffer = NV12Buffer::with_strides(width, height, width, width);
            let (dst_stride_y, dst_stride_uv) = buffer.strides();
            let (dst_y, dst_uv) = buffer.data_mut();
            if !copy_nv12_planes(
                &data,
                width,
                height,
                stride_y,
                stride_uv,
                dst_y,
                dst_uv,
                dst_stride_y,
                dst_stride_uv,
            ) {
                return;
            }
            source.capture_frame(&VideoFrame {
                rotation: VideoRotation::VideoRotation0,
                timestamp_us: normalize_ts(timestamp_us),
                frame_metadata: None,
                buffer,
            });
        }
        PendingFrame::Bgra { data, width, height, stride, timestamp_us } => {
            let mut buffer = I420Buffer::new(width, height);
            let (stride_y, stride_u, stride_v) = buffer.strides();
            let (dst_y, dst_u, dst_v) = buffer.data_mut();
            if !bgra_to_i420_planes(
                &data, width, height, stride, dst_y, dst_u, dst_v, stride_y, stride_u, stride_v,
            ) {
                return;
            }
            source.capture_frame(&VideoFrame {
                rotation: VideoRotation::VideoRotation0,
                timestamp_us: normalize_ts(timestamp_us),
                frame_metadata: None,
                buffer,
            });
        }
    }
}

/// The capture crate stamps `timestamp_us`; a 0 means "no timestamp" — the SDK
/// then substitutes wall-clock. Pass through non-zero values so A/V sync is
/// preserved, fall back to now for 0.
fn normalize_ts(timestamp_us: i64) -> i64 {
    if timestamp_us != 0 {
        timestamp_us
    } else {
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_micros() as i64
    }
}

fn valid_even_dims(width: u32, height: u32) -> bool {
    width >= 2
        && height >= 2
        && width.is_multiple_of(2)
        && height.is_multiple_of(2)
        && width <= 8192
        && height <= 8192
}

/// A capture id unique per publication. The track SID is already unique per
/// publish, and the `Instant`-derived suffix guards a same-SID reuse edge.
fn generate_capture_id(track_sid: &TrackSid) -> String {
    let nanos = Instant::now().elapsed().as_nanos();
    format!("voice-native-screen:{}:{nanos}", track_sid.as_str())
}

// --- Platform capture start (facade over the two crates' differing signatures) --

#[cfg(target_os = "windows")]
fn start_platform_capture(
    capture: &platform_capture::ScreenCapture,
    source_id: &str,
    source_kind: &str,
    width: u32,
    height: u32,
    fps: u32,
    capture_id: &str,
) -> Result<(), String> {
    configure_windows_cpu_capture();
    capture
        .start(
            source_id.to_string(),
            source_kind.to_string(),
            Some(width),
            Some(height),
            Some(fps),
            None, // hook_path — only used for "game" source kind
            None, // hook_path_x86
            None, // injection_method
            Some(capture_id.to_string()),
            None, // start_options
        )
        .map(|_| ())
}

#[cfg(target_os = "linux")]
fn start_platform_capture(
    capture: &platform_capture::ScreenCapture,
    source_id: &str,
    source_kind: &str,
    width: u32,
    height: u32,
    fps: u32,
    capture_id: &str,
) -> Result<(), String> {
    configure_linux_cpu_capture();
    capture
        .start(
            source_id.to_string(),
            source_kind.to_string(),
            width,
            height,
            fps,
            Some(capture_id.to_string()),
            None, // capture_options
        )
        .map(|_| ())
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn start_platform_capture(
    _capture: &platform_capture::ScreenCapture,
    _source_id: &str,
    _source_kind: &str,
    _width: u32,
    _height: u32,
    _fps: u32,
    _capture_id: &str,
) -> Result<(), String> {
    Err("native screen capture is only supported on Windows and Linux".into())
}

// --- YUV conversion helpers (ported from webrtc-sender/src/yuv.rs) ------------

#[allow(clippy::too_many_arguments)]
fn copy_nv12_planes(
    src: &[u8],
    width: u32,
    height: u32,
    stride_y: u32,
    stride_uv: u32,
    dst_y: &mut [u8],
    dst_uv: &mut [u8],
    dst_stride_y: u32,
    dst_stride_uv: u32,
) -> bool {
    if !dims_ok(width, height) {
        return false;
    }
    let w = width as usize;
    let h = height as usize;
    let ch = h / 2;
    let sy = stride_y.max(width) as usize;
    let suv = stride_uv.max(width) as usize;
    let dsy = dst_stride_y as usize;
    let dsuv = dst_stride_uv as usize;
    if dsy < w || dsuv < w {
        return false;
    }
    let Some(uv_offset) = sy.checked_mul(h) else { return false };
    let Some(uv_len) = suv.checked_mul(ch) else { return false };
    let Some(needed) = uv_offset.checked_add(uv_len) else { return false };
    if src.len() < needed || dst_y.len() < dsy * h || dst_uv.len() < dsuv * ch {
        return false;
    }
    for row in 0..h {
        let s = row * sy;
        let d = row * dsy;
        dst_y[d..d + w].copy_from_slice(&src[s..s + w]);
    }
    for row in 0..ch {
        let s = uv_offset + row * suv;
        let d = row * dsuv;
        dst_uv[d..d + w].copy_from_slice(&src[s..s + w]);
    }
    true
}

fn dims_ok(width: u32, height: u32) -> bool {
    width >= 2 && height >= 2 && width.is_multiple_of(2) && height.is_multiple_of(2)
}

fn clamp_u8(value: i32) -> u8 {
    value.clamp(0, 255) as u8
}
fn rgb_to_y(r: i32, g: i32, b: i32) -> u8 {
    clamp_u8(((66 * r + 129 * g + 25 * b + 128) >> 8) + 16)
}
fn rgb_to_u(r: i32, g: i32, b: i32) -> u8 {
    clamp_u8(((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128)
}
fn rgb_to_v(r: i32, g: i32, b: i32) -> u8 {
    clamp_u8(((112 * r - 94 * g - 18 * b + 128) >> 8) + 128)
}

#[allow(clippy::too_many_arguments)]
fn bgra_to_i420_planes(
    src: &[u8],
    width: u32,
    height: u32,
    stride: u32,
    dst_y: &mut [u8],
    dst_u: &mut [u8],
    dst_v: &mut [u8],
    dst_stride_y: u32,
    dst_stride_u: u32,
    dst_stride_v: u32,
) -> bool {
    if !dims_ok(width, height) {
        return false;
    }
    let w = width as usize;
    let h = height as usize;
    let cw = w / 2;
    let ch = h / 2;
    let stride = stride.max(width * 4) as usize;
    if src.len() < stride * h {
        return false;
    }
    let dsy = dst_stride_y as usize;
    let dsu = dst_stride_u as usize;
    let dsv = dst_stride_v as usize;
    if dsy < w || dsu < cw || dsv < cw {
        return false;
    }
    if dst_y.len() < dsy * h || dst_u.len() < dsu * ch || dst_v.len() < dsv * ch {
        return false;
    }
    let px = |row: usize, col: usize| -> (i32, i32, i32) {
        let o = row * stride + col * 4;
        let b = src[o] as i32;
        let g = src[o + 1] as i32;
        let r = src[o + 2] as i32;
        (r, g, b)
    };
    for row in 0..h {
        for col in 0..w {
            let (r, g, b) = px(row, col);
            dst_y[row * dsy + col] = rgb_to_y(r, g, b);
        }
    }
    for cy in 0..ch {
        for cx in 0..cw {
            let (mut rs, mut gs, mut bs) = (0, 0, 0);
            for dy in 0..2 {
                for dx in 0..2 {
                    let (r, g, b) = px(cy * 2 + dy, cx * 2 + dx);
                    rs += r;
                    gs += g;
                    bs += b;
                }
            }
            let (r, g, b) = (rs / 4, gs / 4, bs / 4);
            dst_u[cy * dsu + cx] = rgb_to_u(r, g, b);
            dst_v[cy * dsv + cx] = rgb_to_v(r, g, b);
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_dims_rejects_odd_and_out_of_range() {
        assert!(valid_even_dims(1920, 1080));
        assert!(!valid_even_dims(1921, 1080));
        assert!(!valid_even_dims(0, 0));
        assert!(!valid_even_dims(8194, 100));
    }

    #[test]
    fn nv12_copy_round_trips_a_solid_frame() {
        let (w, h) = (64u32, 64u32);
        let y = (w * h) as usize;
        let uv = (w * (h / 2)) as usize;
        let mut src = vec![0u8; y + uv];
        src[..y].fill(120);
        src[y..].fill(128);

        let mut dst_y = vec![0u8; y];
        let mut dst_uv = vec![0u8; uv];
        assert!(copy_nv12_planes(&src, w, h, w, w, &mut dst_y, &mut dst_uv, w, w));
        assert!(dst_y.iter().all(|&b| b == 120));
        assert!(dst_uv.iter().all(|&b| b == 128));
    }

    #[test]
    fn nv12_copy_rejects_truncated_source() {
        let (w, h) = (64u32, 64u32);
        let src = vec![0u8; 10]; // far too small
        let mut dst_y = vec![0u8; (w * h) as usize];
        let mut dst_uv = vec![0u8; (w * (h / 2)) as usize];
        assert!(!copy_nv12_planes(&src, w, h, w, w, &mut dst_y, &mut dst_uv, w, w));
    }

    #[test]
    fn bgra_black_maps_to_i420_black() {
        let (w, h) = (16u32, 16u32);
        let src = vec![0u8; (w * h * 4) as usize]; // all-zero BGRA = black
        let mut dst_y = vec![0u8; (w * h) as usize];
        let mut dst_u = vec![0u8; (w / 2 * (h / 2)) as usize];
        let mut dst_v = vec![0u8; (w / 2 * (h / 2)) as usize];
        assert!(bgra_to_i420_planes(
            &src, w, h, w * 4, &mut dst_y, &mut dst_u, &mut dst_v, w, w / 2, w / 2,
        ));
        // BT.601 black: Y=16, U=V=128.
        assert!(dst_y.iter().all(|&b| b == 16));
        assert!(dst_u.iter().all(|&b| b == 128));
        assert!(dst_v.iter().all(|&b| b == 128));
    }

    #[test]
    fn parse_codec_maps_known_and_defaults_unknown() {
        assert!(matches!(parse_codec("vp8"), Some(VideoCodec::VP8)));
        assert!(matches!(parse_codec("H264"), Some(VideoCodec::H264)));
        assert!(parse_codec("").is_none());
        assert!(parse_codec("nonsense").is_none());
    }

    // RUNTIME hardware-encoder probe. `VideoEncoderBackend::list_available()`
    // calls the C++ `video_encoder_backend_list()`, which under
    // USE_NVIDIA_VIDEO_CODEC runs `NvidiaVideoEncoderFactory::IsSupported()` —
    // the REAL NVENC probe: it dlopens/LoadLibrary's nvEncodeAPI64.dll, cuInit()s,
    // creates a CUDA context on GPU 0, and opens+destroys an actual NVENC encode
    // session. If that all succeeds, `Nvenc` (and `Hardware`) appear in the list.
    // This is end-to-end proof that the vendored+patched webrtc-sys NVENC path
    // WORKS on the machine's real GPU — no UI, no LiveKit room, no second peer.
    // Ignored by default (requires an NVIDIA GPU + driver); run with:
    //   cargo test -p fluxer-voice-native -- --ignored --nocapture nvenc_runtime_probe
    #[test]
    #[ignore]
    fn nvenc_runtime_probe() {
        let backends: Vec<_> =
            VideoEncoderBackend::list_available().into_iter().collect();
        println!("available video encoder backends: {backends:?}");
        // Auto + Software are always present.
        assert!(backends.contains(&VideoEncoderBackend::Auto));
        assert!(backends.contains(&VideoEncoderBackend::Software));
        // On this NVIDIA box the vendored NVENC build must expose a HW backend.
        let has_nvenc = backends.contains(&VideoEncoderBackend::Nvenc);
        let has_hw = backends.contains(&VideoEncoderBackend::Hardware);
        assert!(
            has_nvenc && has_hw,
            "expected NVENC + Hardware backends from the vendored webrtc-sys \
             NVENC build on this NVIDIA GPU, got {backends:?}"
        );
        println!("NVENC hardware encoder is RUNTIME-AVAILABLE on this GPU ✓");
    }
}
