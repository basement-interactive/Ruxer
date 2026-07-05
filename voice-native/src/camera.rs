//! Webcam video capture + publishing for the native voice engine.
//!
//! Mirrors [`crate::screen`] exactly — same `NativeVideoSource` +
//! `LocalVideoTrack::create_video_track` publish, same `ArrayQueue` → pump-worker
//! → `NativeVideoSource::capture_frame` pipeline, same `Slot`+`shutdown()`+`Drop`
//! teardown — but the frame source is a webcam (via [`nokhwa`]) instead of the
//! platform screen-capture crate, and the published track is `TrackSource::Camera`.
//!
//! Ports the reference engine's camera path
//! (`fluxer_desktop/native/webrtc-sender/src/camera.rs`, nokhwa 0.10) onto the
//! *stock* upstream livekit Rust SDK: device enumeration (`nokhwa::query`),
//! format selection (prefer `NV12` > `YUYV` > `MJPEG`), a capture loop on a
//! `std::thread` (nokhwa's `Camera` is not async), and per-frame conversion to
//! I420 (with MJPEG decoded via `RgbFormat`).
//!
//! # Frame format — CPU I420 path only (stock SDK constraint)
//!
//! Same constraint [`crate::screen`] documents: the stock `livekit/rust-sdks`
//! `NativeBuffer` can only accept CPU pixel buffers, never a GPU texture. So each
//! webcam frame is converted to a CPU `I420Buffer` (NV12/YUYV/RGB/BGR converted
//! directly, MJPEG decoded to RGB first) and handed to `NativeVideoSource`. There
//! is no camera background/blur here — that was ONNX-based in the reference and is
//! intentionally out of scope.
//!
//! # Feature gate
//!
//! All nokhwa-touching code is behind `#[cfg(feature = "camera")]` because
//! nokhwa's `decoding` feature pulls `mozjpeg-sys`, which needs NASM on Windows.
//! The default build stays NASM-free. With the feature off,
//! [`list_camera_devices`] returns an empty list and [`publish_camera`] errors
//! with "camera support not compiled in".

/// A camera device descriptor for the client's device picker. Field names match
/// the shim's expected shape (`{id, label}`, camelCase like
/// [`crate::AudioDevice`]) so the Tauri command layer passes it straight through.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraDevice {
    pub id: String,
    pub label: String,
}

// ===========================================================================
// Feature ON: real nokhwa-backed implementation.
// ===========================================================================
#[cfg(feature = "camera")]
mod imp {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::thread::JoinHandle;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    use crossbeam_queue::ArrayQueue;
    use livekit::options::{TrackPublishOptions, VideoCodec, VideoEncoderBackend, VideoEncoding};
    use livekit::track::{LocalTrack, LocalVideoTrack, TrackSource};
    use livekit::webrtc::video_frame::{I420Buffer, VideoFrame, VideoRotation};
    use livekit::webrtc::video_source::native::NativeVideoSource;
    use livekit::webrtc::video_source::{RtcVideoSource, VideoResolution};
    use livekit::{Room, prelude::TrackSid};
    use nokhwa::pixel_format::RgbFormat;
    use nokhwa::utils::{
        ApiBackend, CameraFormat, CameraIndex, FrameFormat, RequestedFormat, RequestedFormatType,
        Resolution,
    };
    use nokhwa::{Buffer, Camera, query};
    use tokio::sync::Notify;
    use tokio::sync::mpsc::UnboundedSender;

    use super::CameraDevice;
    use crate::video::{VideoFrameMeta, VideoFrameMsg};
    use crate::{VoiceEngineError, VoiceResult};

    /// The synthetic track id the client keys the LOCAL camera self-preview off
    /// (shim `publishCamera` returns `{trackSid:'native-camera'}`). Local frames
    /// are looped back through onVideoFrame under this id so the user sees their
    /// own camera — the remote publish (real track sid) is a separate path.
    const LOCAL_CAMERA_TRACK_SID: &str = "native-camera";

    /// Bounded queue between the capture thread (producer) and the pump worker
    /// (consumer). Same intent as `screen::PENDING_QUEUE_CAPACITY`: small, and a
    /// full push coalesces (drops the oldest) so a slow encoder never unbounds
    /// memory or adds latency.
    const PENDING_QUEUE_CAPACITY: usize = 8;

    /// Max compatible-format candidates we score when picking a capture format.
    const MAX_COMPATIBLE_CAMERA_FORMAT_CANDIDATES: usize = 128;
    /// After this many consecutive `camera.frame()` failures the capture loop
    /// gives up (a disconnected/errored camera won't spin forever).
    const CAMERA_FRAME_FAILURES_CONSECUTIVE_MAX: u32 = 600;
    const CAMERA_FRAME_FAILURE_RETRY_DELAY: Duration = Duration::from_millis(5);

    /// One captured webcam frame, already converted to tight I420 (the only
    /// format the stock SDK can build a `VideoFrame` from — see module doc).
    struct PendingI420 {
        y: Vec<u8>,
        u: Vec<u8>,
        v: Vec<u8>,
        width: u32,
        height: u32,
        timestamp_us: i64,
    }

    /// Everything a live camera publication owns. Dropped/torn down by
    /// [`unpublish_camera`]. Mirrors `screen::ScreenShareSlot`: the capture
    /// thread + pump worker keep frames flowing; `stop` signals both to exit.
    pub struct CameraSlot {
        /// The published LiveKit track's SID — used to unpublish from the room.
        pub track_sid: TrackSid,
        /// Shared stop flag: set on teardown to exit the capture thread + pump.
        stop: Arc<AtomicBool>,
        /// Wakes the pump so it observes `stop` promptly and exits.
        notify: Arc<Notify>,
        /// The capture thread handle (nokhwa `Camera` runs off-async). Joined on
        /// shutdown so the camera device is released before we return.
        capture_thread: Option<JoinHandle<()>>,
    }

    impl CameraSlot {
        /// Signal the capture thread + pump worker to stop, then join the capture
        /// thread so the camera device is released. Idempotent.
        pub fn shutdown(&mut self) {
            self.stop.store(true, Ordering::Release);
            self.notify.notify_waiters();
            if let Some(handle) = self.capture_thread.take() {
                let _ = handle.join();
            }
        }
    }

    impl Drop for CameraSlot {
        fn drop(&mut self) {
            // Belt-and-suspenders: even if unpublish_camera forgot, dropping the
            // slot must not leave the capture thread running or the camera held.
            self.stop.store(true, Ordering::Release);
            self.notify.notify_waiters();
            if let Some(handle) = self.capture_thread.take() {
                let _ = handle.join();
            }
        }
    }

    /// Enumerate webcam devices via `nokhwa::query(ApiBackend::Auto)`.
    pub fn list_camera_devices() -> VoiceResult<Vec<CameraDevice>> {
        let devices =
            query(ApiBackend::Auto).map_err(|e| VoiceEngineError::Publish(format!("query cameras: {e}")))?;
        Ok(devices
            .into_iter()
            .map(|device| {
                let misc = device.misc();
                let index_string = device.index().as_string();
                // Prefer the stable device path (`misc`) as the id; fall back to
                // the index string. Matches the reference's device-id choice.
                let id = if misc.trim().is_empty() { index_string } else { misc };
                CameraDevice { id, label: device.human_name() }
            })
            .collect())
    }

    /// Map a client codec string to the SDK enum. `None`/empty/unknown → SDK
    /// default. Mirrors `screen::parse_codec`.
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

    fn valid_even_dims(width: u32, height: u32) -> bool {
        width >= 2
            && height >= 2
            && width.is_multiple_of(2)
            && height.is_multiple_of(2)
            && width <= 8192
            && height <= 8192
    }

    /// Formats we can convert to I420 (either directly or via an RGB decode),
    /// in priority order: prefer `NV12`, then `YUYV`, then MJPEG (which needs a
    /// full decode). `RAWRGB`/`RAWBGR` also convert directly.
    fn accepted_camera_formats() -> &'static [FrameFormat] {
        &[
            FrameFormat::NV12,
            FrameFormat::YUYV,
            FrameFormat::RAWRGB,
            FrameFormat::RAWBGR,
            FrameFormat::MJPEG,
        ]
    }

    fn camera_format_priority(frame_format: FrameFormat) -> usize {
        accepted_camera_formats()
            .iter()
            .position(|candidate| *candidate == frame_format)
            .unwrap_or(accepted_camera_formats().len())
    }

    /// Score a format: nearest resolution first, then nearest fps, then format
    /// priority. Lower is better. Ported from the reference's
    /// `camera_format_score`.
    fn camera_format_score(format: &CameraFormat, width: u32, height: u32, fps: u32) -> (u64, u32, usize) {
        let resolution = format.resolution();
        let width_delta = u64::from(resolution.width().abs_diff(width));
        let height_delta = u64::from(resolution.height().abs_diff(height));
        (
            width_delta * width_delta + height_delta * height_delta,
            format.frame_rate().abs_diff(fps),
            camera_format_priority(format.format()),
        )
    }

    /// Pick the best I420-convertible capture format for the requested geometry.
    fn select_best_camera_format(
        formats: &[CameraFormat],
        width: u32,
        height: u32,
        fps: u32,
    ) -> Option<CameraFormat> {
        // FILTER to convertible formats FIRST, then cap the candidate count.
        // Some cameras expose hundreds of formats (a C920 lists 546) with the
        // accepted NV12/etc. entries sitting past the first N — capping before
        // filtering could drop every convertible format and force the worse
        // `Closest` fallback. Filtering first guarantees scoring sees them.
        formats
            .iter()
            .filter(|format| accepted_camera_formats().contains(&format.format()))
            .take(MAX_COMPATIBLE_CAMERA_FORMAT_CANDIDATES)
            .min_by_key(|format| camera_format_score(format, width, height, fps))
            .copied()
    }

    fn camera_index_for_device(device_id: &str) -> CameraIndex {
        let trimmed = device_id.trim();
        if trimmed.is_empty() || trimmed == "default" {
            return CameraIndex::Index(0);
        }
        match trimmed.parse::<u32>() {
            Ok(index) => CameraIndex::Index(index),
            Err(_) => CameraIndex::String(trimmed.to_string()),
        }
    }

    /// Resolve a string device id to a concrete index by scanning `query()`,
    /// matching against each device's `misc` path or index string. Returns `None`
    /// if the selector is already an index or no match is found.
    fn fallback_camera_index(device_id: &str) -> Option<CameraIndex> {
        let requested = device_id.trim();
        if requested.is_empty() || requested.parse::<u32>().is_ok() {
            return None;
        }
        let devices = query(ApiBackend::Auto).ok()?;
        for device in devices.into_iter().take(64) {
            let index_string = device.index().as_string();
            let misc = device.misc();
            let device_id = if misc.trim().is_empty() { index_string.as_str() } else { misc.as_str() };
            if requested == device_id.trim() || requested == index_string.trim() {
                if let Ok(index) = device.index().as_index() {
                    return Some(CameraIndex::Index(index));
                }
            }
        }
        None
    }

    /// Opened-camera geometry after nokhwa picks a concrete format (the requested
    /// dims may not be exactly supported). Retained for parity with the reference
    /// and future pacing; the I420 pump reads dimensions off each frame directly,
    /// so the fields are informational for now.
    #[derive(Clone, Copy)]
    #[allow(dead_code)]
    struct OpenedCamera {
        width: u32,
        height: u32,
        fps: u32,
    }

    fn open_stream(mut camera: Camera) -> Result<(Camera, OpenedCamera), String> {
        camera.open_stream().map_err(|e| format!("open camera stream: {e}"))?;
        let resolution = camera.resolution();
        let fps = camera.frame_rate();
        let opened = OpenedCamera {
            width: resolution.width() & !1,
            height: resolution.height() & !1,
            fps,
        };
        Ok((camera, opened))
    }

    /// Open the camera and negotiate the best I420-convertible format for the
    /// requested geometry. Tries `compatible_camera_formats` → best-scored exact
    /// format first, then falls back to a `Closest` request, then to any format.
    fn open_best_camera(
        index: CameraIndex,
        width: u32,
        height: u32,
        fps: u32,
    ) -> Result<(Camera, OpenedCamera), String> {
        // First: enumerate compatible formats and pick the best convertible one.
        let none_req = RequestedFormat::new::<RgbFormat>(RequestedFormatType::None);
        if let Ok(mut camera) = Camera::new(index.clone(), none_req) {
            if let Ok(formats) = camera.compatible_camera_formats() {
                if let Some(best) = select_best_camera_format(&formats, width, height, fps) {
                    let exact = RequestedFormat::new::<RgbFormat>(RequestedFormatType::Exact(best));
                    if camera.set_camera_requset(exact).is_ok() {
                        if let Ok(opened) = open_stream(camera) {
                            return Ok(opened);
                        }
                        // set succeeded but stream failed — fall through to retry
                        // via a fresh Camera below.
                    }
                }
            }
        }

        // Fallback: request a closest match at the desired geometry (let nokhwa
        // pick the source format).
        let closest = RequestedFormat::new::<RgbFormat>(RequestedFormatType::Closest(
            CameraFormat::new(Resolution::new(width, height), FrameFormat::NV12, fps),
        ));
        match Camera::new(index.clone(), closest) {
            Ok(camera) => match open_stream(camera) {
                Ok(opened) => return Ok(opened),
                Err(e) => {
                    // Last resort: any format at all.
                    let any = RequestedFormat::new::<RgbFormat>(RequestedFormatType::None);
                    let camera = Camera::new(index, any)
                        .map_err(|e2| format!("open camera: {e2} (after closest: {e})"))?;
                    return open_stream(camera);
                }
            },
            Err(e) => {
                let any = RequestedFormat::new::<RgbFormat>(RequestedFormatType::None);
                let camera =
                    Camera::new(index, any).map_err(|e2| format!("open camera: {e2} (closest new: {e})"))?;
                open_stream(camera)
            }
        }
    }

    fn open_camera(
        device_id: &str,
        width: u32,
        height: u32,
        fps: u32,
    ) -> Result<(Camera, OpenedCamera), String> {
        let primary = camera_index_for_device(device_id);
        match open_best_camera(primary.clone(), width, height, fps) {
            Ok(opened) => Ok(opened),
            Err(primary_err) => match fallback_camera_index(device_id) {
                Some(fallback) if fallback != primary => open_best_camera(fallback, width, height, fps)
                    .map_err(|fb_err| format!("open by selector failed: {primary_err}; fallback: {fb_err}")),
                _ => Err(primary_err),
            },
        }
    }

    /// Publish a webcam video track onto `room` and start the capture-thread →
    /// queue → pump pipeline feeding it. Mirrors `screen::publish_screen`, but
    /// `is_screencast=false`, `TrackSource::Camera`, track name `"camera"`, and
    /// the frame source is a nokhwa `Camera` on a `std::thread`.
    #[allow(clippy::too_many_arguments)]
    pub async fn publish_camera(
        room: &Room,
        device_id: &str,
        width: u32,
        height: u32,
        fps: u32,
        max_bitrate_bps: Option<u64>,
        codec: &str,
        // When set, each captured frame is ALSO sent here (tagged with the
        // local-camera track id) so the user sees their own camera self-view.
        // Without it, only the remote peer sees the camera. See LOCAL_CAMERA_TRACK_SID.
        local_frame_tx: Option<UnboundedSender<VideoFrameMsg>>,
    ) -> VoiceResult<CameraSlot> {
        if !valid_even_dims(width, height) {
            return Err(VoiceEngineError::Publish(format!(
                "invalid camera dimensions {width}x{height} (must be even, 2..=8192)"
            )));
        }
        let fps = if fps > 0 { fps } else { 30 };

        // is_screencast=false: a webcam is normal video content (the encoder's
        // degradation preference should favor frame rate, unlike a screen).
        let source = NativeVideoSource::new(VideoResolution { width, height }, false);
        let track =
            LocalVideoTrack::create_video_track("camera", RtcVideoSource::Native(source.clone()));

        let mut options = TrackPublishOptions {
            source: TrackSource::Camera,
            simulcast: false,
            // Prefer HW encode (NVENC/VAAPI/AMF/VideoToolbox) — safe fallback to
            // software when unavailable or for a non-HW codec. See screen.rs for
            // the full rationale.
            video_encoder: VideoEncoderBackend::Hardware,
            ..Default::default()
        };
        if let Some(video_codec) = parse_codec(codec) {
            options.video_codec = video_codec;
        }
        if let Some(bitrate) = max_bitrate_bps.filter(|b| *b > 0) {
            options.video_encoding = Some(VideoEncoding {
                max_bitrate: bitrate,
                max_framerate: fps as f64,
            });
        }

        let publication = room
            .local_participant()
            .publish_track(LocalTrack::Video(track), options)
            .await
            .map_err(|e| VoiceEngineError::Publish(format!("publish camera track: {e}")))?;
        let track_sid = publication.sid();
        // The client registers the local self-view tile under the REAL room
        // track sid + local participant identity (from the LocalTrackPublished
        // event), NOT the synthetic "native-camera". Frame routing keys strictly
        // by (trackSid), and the auto-register fallback requires a non-empty
        // participantSid — so loopback frames tagged with "native-camera"/empty
        // were dropped as "unregistered track" and the self-view stayed blank.
        // Tag the loopback with the real ids so they land on the client's tile.
        let local = room.local_participant();
        let local_sid = local.sid().to_string();
        let local_identity = local.identity().to_string();
        let local_track_sid = track_sid.to_string();

        let stop = Arc::new(AtomicBool::new(false));
        let notify = Arc::new(Notify::new());
        let pending: Arc<ArrayQueue<PendingI420>> = Arc::new(ArrayQueue::new(PENDING_QUEUE_CAPACITY));

        // Spawn the pump worker (queue → livekit source) before capture starts.
        spawn_pump_worker(
            source,
            pending.clone(),
            notify.clone(),
            stop.clone(),
            local_frame_tx,
            local_sid,
            local_identity,
            local_track_sid,
        );

        // Open the camera AND run the capture loop on one dedicated std::thread:
        // nokhwa's `Camera` is `!Send` (its backend is a `Box<dyn
        // CaptureBackendTrait>`), so it can't cross a thread boundary — the same
        // reason the reference opens it inside its capture worker. The thread
        // reports open success/failure back over a oneshot `std::sync::mpsc` so we
        // can roll the just-published track back on failure. Mirrors the
        // reference's `spawn_capture_worker` result-channel handshake.
        let device_id_owned = device_id.to_string();
        let (open_tx, open_rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let capture_thread = spawn_capture_thread(
            device_id_owned,
            width,
            height,
            fps,
            pending,
            notify.clone(),
            stop.clone(),
            open_tx,
        );

        // Await the open result off the async runtime (the recv is blocking). A
        // `RecvError` means the thread died before reporting — treat it as a
        // generic open failure. Flatten both to `Result<(), String>`.
        let open_result = tokio::task::spawn_blocking(move || open_rx.recv())
            .await
            .map_err(|e| VoiceEngineError::Publish(format!("camera open task join: {e}")))?;
        let open_result: Result<(), String> = match open_result {
            Ok(inner) => inner,
            Err(_) => Err("capture thread exited before reporting".to_string()),
        };

        if let Err(e) = open_result {
            // Roll back: stop the pump, join the (already-exiting) capture
            // thread, unpublish the just-published dead track.
            stop.store(true, Ordering::Release);
            notify.notify_waiters();
            let _ = capture_thread.join();
            let _ = room.local_participant().unpublish_track(&track_sid).await;
            return Err(VoiceEngineError::Publish(format!("open camera: {e}")));
        }

        Ok(CameraSlot { track_sid, stop, notify, capture_thread: Some(capture_thread) })
    }

    /// Tear down a live camera publication: stop capture + pump, join the capture
    /// thread, then unpublish the track. Mirrors `screen::unpublish_screen`.
    pub async fn unpublish_camera(room: &Room, mut slot: CameraSlot) -> VoiceResult<()> {
        slot.shutdown();
        let track_sid = slot.track_sid.clone();
        drop(slot);
        room.local_participant()
            .unpublish_track(&track_sid)
            .await
            .map_err(|e| VoiceEngineError::Publish(format!("unpublish camera track: {e}")))?;
        Ok(())
    }

    /// The capture thread: opens the nokhwa `Camera` (reporting success/failure
    /// over `open_tx`), then reads frames, converts each to tight I420, and
    /// pushes it onto the bounded queue (coalescing on full), waking the pump.
    /// Exits when `stop` is set or after too many consecutive frame failures.
    /// Opening happens HERE (not on the caller) because `Camera` is `!Send`.
    /// Ported from the reference's `spawn_capture_worker` + `run_capture_loop`
    /// (minus mirror/background — out of scope here).
    #[allow(clippy::too_many_arguments)]
    fn spawn_capture_thread(
        device_id: String,
        width: u32,
        height: u32,
        fps: u32,
        pending: Arc<ArrayQueue<PendingI420>>,
        notify: Arc<Notify>,
        stop: Arc<AtomicBool>,
        open_tx: std::sync::mpsc::Sender<Result<(), String>>,
    ) -> JoinHandle<()> {
        std::thread::spawn(move || {
            let (mut camera, _opened) = match open_camera(&device_id, width, height, fps) {
                Ok(pair) => pair,
                Err(e) => {
                    let _ = open_tx.send(Err(e));
                    return;
                }
            };
            // Report success; if the receiver is gone the publish was aborted.
            if open_tx.send(Ok(())).is_err() {
                let _ = camera.stop_stream();
                return;
            }
            let start = Instant::now();
            let mut consecutive_failures: u32 = 0;
            while !stop.load(Ordering::Acquire) {
                let frame = match camera.frame() {
                    Ok(f) => f,
                    Err(_) => {
                        consecutive_failures += 1;
                        if consecutive_failures >= CAMERA_FRAME_FAILURES_CONSECUTIVE_MAX {
                            break;
                        }
                        std::thread::sleep(CAMERA_FRAME_FAILURE_RETRY_DELAY);
                        continue;
                    }
                };
                consecutive_failures = 0;
                if stop.load(Ordering::Acquire) {
                    break;
                }
                let fw = frame.resolution().width() & !1;
                let fh = frame.resolution().height() & !1;
                if fw < 2 || fh < 2 {
                    continue;
                }
                let timestamp_us = start.elapsed().as_micros() as i64;
                if let Some(i420) = camera_frame_to_i420(&frame, fw, fh, timestamp_us) {
                    // Coalesce on a full queue: drop the oldest so a stalled
                    // encoder always gets the freshest frame.
                    let _ = pending.force_push(i420);
                    notify.notify_one();
                }
            }
            let _ = camera.stop_stream();
        })
    }

    /// The frame pump: pulls `PendingI420`s off the queue and hands them to the
    /// livekit `NativeVideoSource` as `VideoFrame`s. Runs until `stop` is set.
    /// Mirrors `screen::spawn_pump_worker`.
    fn spawn_pump_worker(
        source: NativeVideoSource,
        pending: Arc<ArrayQueue<PendingI420>>,
        notify: Arc<Notify>,
        stop: Arc<AtomicBool>,
        local_frame_tx: Option<UnboundedSender<VideoFrameMsg>>,
        local_sid: String,
        local_identity: String,
        local_track_sid: String,
    ) {
        tokio::spawn(async move {
            loop {
                if stop.load(Ordering::Acquire) {
                    break;
                }
                let Some(frame) = pending.pop() else {
                    let _ = tokio::time::timeout(Duration::from_millis(250), notify.notified()).await;
                    continue;
                };
                // Loop the frame back for the LOCAL self-view BEFORE moving it into
                // the SDK source. The client renders its own camera tile from
                // onVideoFrame under LOCAL_CAMERA_TRACK_SID (there's no separate
                // local capture on this path), so without this the user's own
                // camera preview is blank even though the remote peer sees them.
                if let Some(tx) = local_frame_tx.as_ref() {
                    // Pack the tight I420 planes (Y|U|V) into one buffer — the
                    // same layout the remote-video path (video.rs pack_i420) and
                    // the client's i420VideoFrameLayout expect.
                    let mut i420 =
                        Vec::with_capacity(frame.y.len() + frame.u.len() + frame.v.len());
                    i420.extend_from_slice(&frame.y);
                    i420.extend_from_slice(&frame.u);
                    i420.extend_from_slice(&frame.v);
                    let _ = tx.send(VideoFrameMsg {
                        meta: VideoFrameMeta {
                            participant_sid: local_sid.clone(),
                            participant_identity: local_identity.clone(),
                            track_sid: local_track_sid.clone(),
                            source: "camera".to_string(),
                        },
                        width: frame.width,
                        height: frame.height,
                        timestamp_us: frame.timestamp_us,
                        i420,
                    });
                }
                capture_i420_frame(&source, frame);
            }
        });
    }

    /// Convert one tight `PendingI420` to a livekit `VideoFrame` (copying planes
    /// into an `I420Buffer`, honoring its strides) and push it to `source`.
    fn capture_i420_frame(source: &NativeVideoSource, frame: PendingI420) {
        let PendingI420 { y, u, v, width, height, timestamp_us } = frame;
        let mut buffer = I420Buffer::new(width, height);
        let (stride_y, stride_u, stride_v) = buffer.strides();
        {
            let (dst_y, dst_u, dst_v) = buffer.data_mut();
            copy_plane(dst_y, &y, width as usize, stride_y as usize, height as usize);
            let cw = (width / 2) as usize;
            let ch = (height / 2) as usize;
            copy_plane(dst_u, &u, cw, stride_u as usize, ch);
            copy_plane(dst_v, &v, cw, stride_v as usize, ch);
        }
        source.capture_frame(&VideoFrame {
            rotation: VideoRotation::VideoRotation0,
            timestamp_us: normalize_ts(timestamp_us),
            frame_metadata: None,
            buffer,
        });
    }

    fn copy_plane(dst: &mut [u8], src: &[u8], width: usize, dst_stride: usize, rows: usize) {
        for row in 0..rows {
            let s = row * width;
            let d = row * dst_stride;
            if s + width <= src.len() && d + width <= dst.len() {
                dst[d..d + width].copy_from_slice(&src[s..s + width]);
            }
        }
    }

    fn normalize_ts(timestamp_us: i64) -> i64 {
        if timestamp_us != 0 {
            timestamp_us
        } else {
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_micros() as i64
        }
    }

    /// Convert a nokhwa camera frame to a tight `PendingI420`, dispatching on its
    /// source pixel format. NV12/YUYV/RGB/BGR convert directly; MJPEG (and other
    /// compressed/unknown formats) decode to RGB via `decode_image::<RgbFormat>`
    /// first. Ported from the reference's `camera_frame_to_i420_into`.
    fn camera_frame_to_i420(frame: &Buffer, width: u32, height: u32, timestamp_us: i64) -> Option<PendingI420> {
        let w = width as usize;
        let h = height as usize;
        let cw = w / 2;
        let ch = h / 2;
        let mut y = vec![0u8; w * h];
        let mut u = vec![0u8; cw * ch];
        let mut v = vec![0u8; cw * ch];

        let ok = match frame.source_frame_format() {
            FrameFormat::NV12 => {
                nv12_to_i420(frame.buffer(), width, height, width, width, &mut y, &mut u, &mut v)
            }
            FrameFormat::YUYV => {
                yuyv_to_i420(frame.buffer(), width, height, width * 2, &mut y, &mut u, &mut v)
            }
            FrameFormat::RAWRGB => rgb_to_i420(frame.buffer(), width, height, &mut y, &mut u, &mut v, true),
            FrameFormat::RAWBGR => rgb_to_i420(frame.buffer(), width, height, &mut y, &mut u, &mut v, false),
            // MJPEG / GRAY / anything else: decode to RGB, then convert.
            _ => match frame.decode_image::<RgbFormat>() {
                Ok(rgb) if rgb.width() == width && rgb.height() == height => {
                    rgb_to_i420(&rgb.into_raw(), width, height, &mut y, &mut u, &mut v, true)
                }
                _ => false,
            },
        };

        if ok {
            Some(PendingI420 { y, u, v, width, height, timestamp_us })
        } else {
            None
        }
    }

    // --- YUV conversion helpers (ported from webrtc-sender/src/yuv.rs) ---------

    #[allow(clippy::too_many_arguments)]
    fn nv12_to_i420(
        src: &[u8],
        width: u32,
        height: u32,
        stride_y: u32,
        stride_uv: u32,
        dst_y: &mut [u8],
        dst_u: &mut [u8],
        dst_v: &mut [u8],
    ) -> bool {
        let w = width as usize;
        let h = height as usize;
        let cw = w / 2;
        let ch = h / 2;
        let sy = stride_y.max(width) as usize;
        let suv = stride_uv.max(width) as usize;
        let Some(uv_offset) = sy.checked_mul(h) else { return false };
        let Some(uv_len) = suv.checked_mul(ch) else { return false };
        let Some(needed) = uv_offset.checked_add(uv_len) else { return false };
        if src.len() < needed || dst_y.len() < w * h || dst_u.len() < cw * ch || dst_v.len() < cw * ch {
            return false;
        }
        for row in 0..h {
            let s = row * sy;
            dst_y[row * w..row * w + w].copy_from_slice(&src[s..s + w]);
        }
        for row in 0..ch {
            let base = uv_offset + row * suv;
            for x in 0..cw {
                dst_u[row * cw + x] = src[base + 2 * x];
                dst_v[row * cw + x] = src[base + 2 * x + 1];
            }
        }
        true
    }

    fn yuyv_to_i420(
        src: &[u8],
        width: u32,
        height: u32,
        stride: u32,
        dst_y: &mut [u8],
        dst_u: &mut [u8],
        dst_v: &mut [u8],
    ) -> bool {
        let w = width as usize;
        let h = height as usize;
        let cw = w / 2;
        let ch = h / 2;
        let stride = stride.max(width * 2) as usize;
        if src.len() < stride * h || dst_y.len() < w * h || dst_u.len() < cw * ch || dst_v.len() < cw * ch {
            return false;
        }
        for row in 0..h {
            let row_base = row * stride;
            for pair in 0..cw {
                let src_offset = row_base + pair * 4;
                let dst_offset = row * w + pair * 2;
                dst_y[dst_offset] = src[src_offset];
                dst_y[dst_offset + 1] = src[src_offset + 2];
            }
        }
        for cy in 0..ch {
            for cx in 0..cw {
                let top = (cy * 2) * stride + cx * 4;
                let bottom = (cy * 2 + 1) * stride + cx * 4;
                dst_u[cy * cw + cx] = ((u16::from(src[top + 1]) + u16::from(src[bottom + 1])) / 2) as u8;
                dst_v[cy * cw + cx] = ((u16::from(src[top + 3]) + u16::from(src[bottom + 3])) / 2) as u8;
            }
        }
        true
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

    /// Convert packed 24-bit RGB (`rgb_order = true`) or BGR (`false`) to tight
    /// I420. Chroma is 2x2-averaged. Ported from `yuv::rgb_to_i420_into` /
    /// `bgr_to_i420_into`.
    fn rgb_to_i420(
        src: &[u8],
        width: u32,
        height: u32,
        dst_y: &mut [u8],
        dst_u: &mut [u8],
        dst_v: &mut [u8],
        rgb_order: bool,
    ) -> bool {
        let w = width as usize;
        let h = height as usize;
        let cw = w / 2;
        let ch = h / 2;
        let stride = w * 3;
        if src.len() < stride * h || dst_y.len() < w * h || dst_u.len() < cw * ch || dst_v.len() < cw * ch {
            return false;
        }
        let px = |row: usize, col: usize| -> (i32, i32, i32) {
            let o = row * stride + col * 3;
            let c0 = src[o] as i32;
            let g = src[o + 1] as i32;
            let c2 = src[o + 2] as i32;
            // RGB: (r,g,b) = (c0,g,c2). BGR: (r,g,b) = (c2,g,c0).
            if rgb_order { (c0, g, c2) } else { (c2, g, c0) }
        };
        for row in 0..h {
            for col in 0..w {
                let (r, g, b) = px(row, col);
                dst_y[row * w + col] = rgb_to_y(r, g, b);
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
                dst_u[cy * cw + cx] = rgb_to_u(r, g, b);
                dst_v[cy * cw + cx] = rgb_to_v(r, g, b);
            }
        }
        true
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn parse_codec_maps_known_and_defaults_unknown() {
            assert!(matches!(parse_codec("vp8"), Some(VideoCodec::VP8)));
            assert!(matches!(parse_codec("H264"), Some(VideoCodec::H264)));
            assert!(parse_codec("").is_none());
            assert!(parse_codec("nonsense").is_none());
        }

        #[test]
        fn format_selection_prefers_nv12_over_yuyv_and_mjpeg() {
            let formats = vec![
                CameraFormat::new(Resolution::new(1280, 720), FrameFormat::MJPEG, 30),
                CameraFormat::new(Resolution::new(1280, 720), FrameFormat::YUYV, 30),
                CameraFormat::new(Resolution::new(1280, 720), FrameFormat::NV12, 30),
            ];
            let selected = select_best_camera_format(&formats, 1280, 720, 30).unwrap();
            assert_eq!(selected.format(), FrameFormat::NV12);
        }

        #[test]
        fn format_selection_prefers_nearest_resolution_before_format_priority() {
            let formats = vec![
                CameraFormat::new(Resolution::new(1920, 1080), FrameFormat::NV12, 30),
                CameraFormat::new(Resolution::new(1024, 768), FrameFormat::YUYV, 30),
            ];
            let selected = select_best_camera_format(&formats, 1280, 720, 30).unwrap();
            assert_eq!(selected.resolution(), Resolution::new(1024, 768));
            assert_eq!(selected.format(), FrameFormat::YUYV);
        }

        #[test]
        fn nv12_2x2_deinterleaves() {
            let src = [1u8, 2, 3, 4, 10, 20];
            let mut y = [0u8; 4];
            let mut u = [0u8; 1];
            let mut v = [0u8; 1];
            assert!(nv12_to_i420(&src, 2, 2, 2, 2, &mut y, &mut u, &mut v));
            assert_eq!(y, [1, 2, 3, 4]);
            assert_eq!(u, [10]);
            assert_eq!(v, [20]);
        }

        #[test]
        fn rgb_black_maps_to_i420_black() {
            let src = vec![0u8; 2 * 2 * 3];
            let mut y = [0u8; 4];
            let mut u = [0u8; 1];
            let mut v = [0u8; 1];
            assert!(rgb_to_i420(&src, 2, 2, &mut y, &mut u, &mut v, true));
            assert!(y.iter().all(|&b| b == 16));
            assert_eq!(u, [128]);
            assert_eq!(v, [128]);
        }
    }
}

#[cfg(feature = "camera")]
pub use imp::{CameraSlot, list_camera_devices, publish_camera, unpublish_camera};

// ===========================================================================
// Feature OFF: NASM-free stubs. list returns empty, publish errors.
// ===========================================================================
#[cfg(not(feature = "camera"))]
mod stub {
    use super::CameraDevice;
    use crate::video::VideoFrameMsg;
    use crate::{VoiceEngineError, VoiceResult};
    use livekit::{Room, prelude::TrackSid};
    use tokio::sync::mpsc::UnboundedSender;

    /// Placeholder slot when camera support is compiled out. Never constructed
    /// (publish always errors), but keeps `Session.camera: Option<CameraSlot>`
    /// well-typed regardless of feature flags.
    pub struct CameraSlot {
        #[allow(dead_code)]
        pub track_sid: TrackSid,
    }

    impl CameraSlot {
        pub fn shutdown(&mut self) {}
    }

    /// With the `camera` feature off, no devices are enumerable.
    pub fn list_camera_devices() -> VoiceResult<Vec<CameraDevice>> {
        Ok(Vec::new())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn publish_camera(
        _room: &Room,
        _device_id: &str,
        _width: u32,
        _height: u32,
        _fps: u32,
        _max_bitrate_bps: Option<u64>,
        _codec: &str,
        _local_frame_tx: Option<UnboundedSender<VideoFrameMsg>>,
    ) -> VoiceResult<CameraSlot> {
        Err(VoiceEngineError::Publish("camera support not compiled in".into()))
    }

    pub async fn unpublish_camera(_room: &Room, mut slot: CameraSlot) -> VoiceResult<()> {
        slot.shutdown();
        Ok(())
    }
}

#[cfg(not(feature = "camera"))]
pub use stub::{CameraSlot, list_camera_devices, publish_camera, unpublish_camera};
