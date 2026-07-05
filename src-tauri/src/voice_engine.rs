//! Tauri command surface for the native voice engine (`window.electron.voiceEngine`
//! in the desktop shim). Wraps `fluxer_voice_native::VoiceEngine` — see that
//! crate's doc comment and the memory note `native-voice-engine-scope.md` for
//! why this exists (WebKitGTK ships without WebRTC on every mainstream Linux
//! distro, so the reference client's JS/LiveKit-in-webview path cannot work
//! there; voice runs in the native process instead, mirroring what Electron's
//! bundled Chromium effectively does).
//!
//! One engine instance for the process lifetime (module-level singleton,
//! matching `capture.rs`'s pattern) — the client expects a single native
//! voice bridge, not one scoped to a window or login session.

use fluxer_voice_native::{
    AudioDevice, AudioProcessing, BridgeStats, CameraDevice, ScreenSource, VideoFrameMsg,
    VoiceEngine, VoiceEngineError, VoiceResult,
};
use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::{self, UnboundedSender};

fn engine() -> &'static VoiceEngine {
    static ENGINE: OnceLock<VoiceEngine> = OnceLock::new();
    ENGINE.get_or_init(VoiceEngine::new)
}

// --- Remote video (onVideoFrame) plumbing --------------------------------
//
// Remote screenshare/camera frames are decoded natively (voice-native's
// video.rs) and pushed to the webview as raw I420 through a Tauri ipc Channel.
// The shim's `onVideoFrame(cb)` registers that Channel via
// `voice_engine_start_video`; the connect loop, on each subscribed remote video
// track, spawns a NativeVideoStream whose frames land here and get packed +
// sent. Using `InvokeResponseBody::Raw` sends the bytes as an ArrayBuffer (no
// JSON encode of the pixel payload — critical for 30fps video).

/// The webview-side Channel the shim's onVideoFrame handed us, if any.
fn video_channel() -> &'static Mutex<Option<Channel<InvokeResponseBody>>> {
    static CH: OnceLock<Mutex<Option<Channel<InvokeResponseBody>>>> = OnceLock::new();
    CH.get_or_init(|| Mutex::new(None))
}

/// The sender the connect loop clones per remote video track. The paired
/// receiver is drained by a task that packs frames and pushes them to the
/// webview Channel. Rebuilt on each connect.
fn video_tx_slot() -> &'static Mutex<Option<UnboundedSender<VideoFrameMsg>>> {
    static TX: OnceLock<Mutex<Option<UnboundedSender<VideoFrameMsg>>>> = OnceLock::new();
    TX.get_or_init(|| Mutex::new(None))
}

/// Pack one frame as: [u32 LE header length][JSON header][raw I420 bytes].
/// The header carries meta + dimensions so the shim can route the frame to the
/// right tile and build a WebCodecs VideoFrame; the pixels ride raw after it.
fn pack_video_frame(msg: &VideoFrameMsg) -> Vec<u8> {
    let header = serde_json::json!({
        "participantSid": msg.meta.participant_sid,
        "participantIdentity": msg.meta.participant_identity,
        "trackSid": msg.meta.track_sid,
        "source": msg.meta.source,
        "width": msg.width,
        "height": msg.height,
        "timestampUs": msg.timestamp_us,
    });
    let header_bytes = serde_json::to_vec(&header).unwrap_or_default();
    let mut out = Vec::with_capacity(4 + header_bytes.len() + msg.i420.len());
    out.extend_from_slice(&(header_bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(&header_bytes);
    out.extend_from_slice(&msg.i420);
    out
}

/// `VoiceEngineError` and `String` are both foreign to this crate, so a
/// `From` impl between them is an orphan-rule violation — this extension
/// trait stands in for the `?`-operator conversion instead.
trait VoiceResultExt<T> {
    fn stringify(self) -> Result<T, String>;
}

impl<T> VoiceResultExt<T> for VoiceResult<T> {
    fn stringify(self) -> Result<T, String> {
        self.map_err(|e: VoiceEngineError| e.to_string())
    }
}

#[derive(Debug, Serialize)]
pub struct VoiceEngineReadiness {
    pub ready: bool,
    pub reason: Option<String>,
}

// Field names match `VoiceEngineV2BridgeCapabilities` in
// reference/fluxer/packages/voice_engine_v2/src/bridge/types.ts exactly (only
// a subset is reported here — the rest fall back to the shim's `false`
// defaults for capabilities this P1 slice genuinely doesn't have, e.g.
// participantVolume/connectionStats/dataChannel — see
// native-voice-engine-scope.md for which are real no-ops vs. real gaps).
#[derive(Debug, Serialize)]
pub struct VoiceEngineCapabilities {
    #[serde(rename = "microphoneCapture")]
    pub microphone_capture: bool,
    #[serde(rename = "deviceLists")]
    pub device_lists: bool,
    #[serde(rename = "outputDeviceSelection")]
    pub output_device_selection: bool,
    #[serde(rename = "remoteTrackSubscription")]
    pub remote_track_subscription: bool,
    #[serde(rename = "cameraCapture")]
    pub camera_capture: bool,
    #[serde(rename = "screenShare")]
    pub screen_share: bool,
}

#[tauri::command]
pub async fn voice_engine_is_supported() -> bool {
    engine().is_supported().await
}

#[tauri::command]
pub async fn voice_engine_get_capabilities() -> VoiceEngineCapabilities {
    // Screen-share video is now backed by the native path (voice_engine_publish_screen
    // → fluxer_voice_native::publish_screen → platform ScreenCapture + frame pump),
    // so screen_share flips to true — the client routes screen share through the
    // native bridge instead of the graceful-degradation "not available" path.
    // Camera is now backed by the native path too (voice_engine_publish_camera
    // → fluxer_voice_native::publish_camera → nokhwa capture + frame pump). The
    // `camera` feature is enabled unconditionally on the fluxer-voice-native dep
    // (see src-tauri/Cargo.toml), so this flips to true whenever audio is
    // supported.
    let supported = engine().is_supported().await;
    VoiceEngineCapabilities {
        microphone_capture: supported,
        device_lists: supported,
        output_device_selection: supported,
        remote_track_subscription: supported,
        camera_capture: supported,
        screen_share: supported,
    }
}

#[tauri::command]
pub async fn voice_engine_prewarm() -> Result<(), String> {
    if engine().is_supported().await {
        Ok(())
    } else {
        Err("platform audio unavailable".into())
    }
}

#[tauri::command]
pub async fn voice_engine_get_readiness() -> VoiceEngineReadiness {
    if engine().is_supported().await {
        VoiceEngineReadiness { ready: true, reason: None }
    } else {
        VoiceEngineReadiness {
            ready: false,
            reason: Some("platform audio device module failed to initialize".into()),
        }
    }
}

/// Connect to a LiveKit room and start publishing the microphone. Spawns a
/// background task draining `RoomEvent`s and forwarding them to the frontend
/// as `voice-engine-event` Tauri events (mirrors `gateway.rs`'s
/// forward-events-via-emit pattern) until disconnect.
#[tauri::command]
pub async fn voice_engine_connect(app: AppHandle, url: String, token: String) -> Result<(), String> {
    // Connect with UNSPECIFIED processing (all `None` = leave WebRTC's own
    // defaults untouched, which resolve to on). The client always calls
    // publishMicrophone right after connect with its resolved voice-processing
    // mode, which routes to voice_engine_set_audio_processing below — so any
    // explicit override (e.g. direct input turning stages off) is applied there.
    // Passing all-None here means we don't pre-force anything on.
    let mut events = engine().connect(&url, &token, AudioProcessing::default()).await.stringify()?;

    // (Re)build the remote-video pipeline for this session: a channel the
    // per-track NativeVideoStreams push frames into, drained by a task that
    // packs each frame and forwards it to the webview Channel (if onVideoFrame
    // has registered one).
    let (video_tx, mut video_rx) = mpsc::unbounded_channel::<VideoFrameMsg>();
    *video_tx_slot().lock().unwrap() = Some(video_tx.clone());
    tauri::async_runtime::spawn(async move {
        while let Some(msg) = video_rx.recv().await {
            let packed = pack_video_frame(&msg);
            if let Some(ch) = video_channel().lock().unwrap().as_ref() {
                let _ = ch.send(InvokeResponseBody::Raw(packed));
            }
        }
    });

    tauri::async_runtime::spawn(async move {
        while let Some(ev) = events.recv().await {
            // On a subscribed remote VIDEO track, start a native stream that
            // decodes its frames and feeds them into the video pipeline above.
            if let livekit::RoomEvent::TrackSubscribed { track, publication, participant } = &ev {
                if let livekit::track::RemoteTrack::Video(video_track) = track {
                    if let Some(tx) = video_tx_slot().lock().unwrap().clone() {
                        let meta = fluxer_voice_native::VideoFrameMeta {
                            participant_sid: participant.sid().as_str().to_string(),
                            participant_identity: participant.identity().as_str().to_string(),
                            track_sid: publication.sid().as_str().to_string(),
                            source: source_str(publication.source()),
                        };
                        fluxer_voice_native::spawn_remote_video_stream(
                            video_track.clone(),
                            meta,
                            tx,
                        );
                    }
                }
            }
            let payload = crate::voice_engine_events::map_room_event(&ev);
            let _ = app.emit("voice-engine-event", payload);
        }
    });
    Ok(())
}

/// Map LiveKit's `TrackSource` to the client's lowercase source string. Mirrors
/// voice-native's private `source_str` (not re-exported, so duplicated here for
/// the video-meta path).
fn source_str(source: livekit::track::TrackSource) -> String {
    use livekit::track::TrackSource;
    match source {
        TrackSource::Camera => "camera",
        TrackSource::Microphone => "microphone",
        TrackSource::Screenshare => "screenshare",
        TrackSource::ScreenshareAudio => "screenshare_audio",
        TrackSource::Unknown => "unknown",
    }
    .to_string()
}

/// Register the webview Channel that remote video frames are pushed to. Called
/// by the shim's `onVideoFrame`. Each frame arrives as an ArrayBuffer:
/// `[u32 LE header-len][JSON header][I420 bytes]`.
#[tauri::command]
pub fn voice_engine_start_video(channel: Channel<InvokeResponseBody>) -> Result<(), String> {
    *video_channel().lock().unwrap() = Some(channel);
    Ok(())
}

/// Unregister the webview video Channel (onVideoFrame unsubscribe).
#[tauri::command]
pub fn voice_engine_stop_video() -> Result<(), String> {
    *video_channel().lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub async fn voice_engine_disconnect() -> Result<(), String> {
    engine().disconnect().await.stringify()
}

#[tauri::command]
pub async fn voice_engine_is_connected() -> bool {
    engine().is_connected().await
}

#[tauri::command]
pub async fn voice_engine_set_mic_enabled(enabled: bool) -> Result<(), String> {
    engine().set_mic_enabled(enabled).await.stringify()
}

/// Publish a data packet (video-codec gossip between peers). The shim passes the
/// payload as a byte array; `topic`/`reliable`/`destinationIdentities` are
/// optional (broadcast reliable by default is NOT chosen — the client's gossip
/// is fine on the lossy channel, but we honor whatever it sends).
#[tauri::command]
pub async fn voice_engine_publish_data(
    payload: Vec<u8>,
    topic: Option<String>,
    reliable: Option<bool>,
    destination_identities: Option<Vec<String>>,
) -> Result<(), String> {
    engine()
        .publish_data(
            payload,
            topic,
            reliable.unwrap_or(false),
            destination_identities.unwrap_or_default(),
        )
        .await
        .stringify()
}

#[tauri::command]
pub async fn voice_engine_list_audio_input_devices() -> Result<Vec<AudioDevice>, String> {
    engine().list_recording_devices().await.stringify()
}

#[tauri::command]
pub async fn voice_engine_list_audio_output_devices() -> Result<Vec<AudioDevice>, String> {
    engine().list_playout_devices().await.stringify()
}

#[tauri::command]
pub async fn voice_engine_set_audio_output_device(device_id: String) -> Result<(), String> {
    engine().set_playout_device(&device_id).await.stringify()
}

#[tauri::command]
pub async fn voice_engine_set_audio_input_device(device_id: String) -> Result<(), String> {
    engine().set_recording_device(&device_id).await.stringify()
}

/// Addressed by participant identity + source, NOT track sid: the client's v2
/// subscription pipeline is identity+source-based and never resolves a concrete
/// `trackSid` (a sid-keyed command received `trackSid: undefined` → Tauri
/// rejected it "missing required key trackSid"). The engine resolves the
/// concrete publication from identity+source.
#[tauri::command]
pub async fn voice_engine_set_remote_track_subscription(
    participant_identity: String,
    source: String,
    subscribed: bool,
) -> Result<(), String> {
    engine()
        .set_remote_track_subscription(&participant_identity, &source, subscribed)
        .await
        .stringify()
}

/// Takes the SID+volume as one options object (`{participantSid, volume}`) —
/// the shim's JS facade calls this with two separate args and forwards them
/// as one object, matching the IPC contract; see `native-voice-engine-scope.md`
/// on the two-args-vs-one-object mismatch between the facade and bridge layers.
#[tauri::command]
pub async fn voice_engine_set_participant_volume(participant_sid: String, volume: f32) -> Result<(), String> {
    engine().set_participant_volume(&participant_sid, volume).await.stringify()
}

#[tauri::command]
pub async fn voice_engine_set_speaking_detection(
    local_threshold_rms: f32,
    remote_threshold_rms: f32,
) -> Result<(), String> {
    engine().set_speaking_detection(local_threshold_rms, remote_threshold_rms).await.stringify()
}

/// Real WebRTC connection stats (rtt / bitrate / packet loss) for the client's
/// "Stats for Nerds" panel. The client polls this ~1 Hz; a poll failure is a
/// hard `Err` here (the shim degrades it to an empty payload via `tryInvoke`),
/// but the engine method itself only errors on "not connected" — a per-track
/// stat hiccup contributes nothing rather than failing the whole poll.
/// `BridgeStats` serializes directly to `VoiceEngineV2BridgeStats`.
#[tauri::command]
pub async fn voice_engine_get_connection_stats() -> Result<BridgeStats, String> {
    engine().get_connection_stats().await.stringify()
}

/// Reconfigure the mic DSP (AEC/NS/AGC). The shim calls this from
/// `publishMicrophone`, passing the client's resolved voice-processing mode.
///
/// TRI-STATE: each field is `Option<bool>`. `None` (the client left it unset)
/// means "leave WebRTC's default" — NOT "force on". This is the fix for the
/// over-processed clean mic: the shim used to coerce the client's `undefined`
/// into `true` and force full-strength AEC/AGC/NS on every desktop mic; now an
/// unset stage is passed through as `None` and left alone. An explicit `false`
/// (e.g. "direct input"/`studio` sending all three false) still disables that
/// stage. Applies to the persistent ADM so switching modes mid-call takes
/// effect without republishing. A "not connected" error can't occur (the ADM
/// is process-wide); the shim's tryInvoke swallows anything anyway.
#[tauri::command]
pub async fn voice_engine_set_audio_processing(
    echo_cancellation: Option<bool>,
    noise_suppression: Option<bool>,
    auto_gain_control: Option<bool>,
) -> Result<(), String> {
    engine()
        .set_audio_processing(AudioProcessing {
            echo_cancellation,
            noise_suppression,
            auto_gain_control,
        })
        .await
        .stringify()
}

// --- Screen share (native video) ------------------------------------------

/// Enumerate capturable screen/window sources for the client's picker. On Linux
/// this drives the compositor's portal picker (a modal dialog — the shim runs it
/// off the UI thread by awaiting this async command); on Windows it enumerates
/// monitors + windows. `ScreenSource { id, name, kind }` serializes to the shape
/// the shim maps into the bridge's source list.
#[tauri::command]
pub async fn voice_engine_list_screen_sources() -> Result<Vec<ScreenSource>, String> {
    // list_screen_sources is blocking (D-Bus / Win32 enumeration); run it on a
    // blocking thread so it never stalls the async runtime.
    tauri::async_runtime::spawn_blocking(VoiceEngine::list_screen_sources)
        .await
        .map_err(|e| format!("list_screen_sources task join: {e}"))?
        .stringify()
}

/// Publish a screen-share video track and start the native capture → frame pump
/// feeding it. `source_id`/`source_kind` identify the picked source; `width`/
/// `height` are capture dimensions; `fps`/`max_bitrate_bps` bound the encoder;
/// `codec` is the client's negotiated codec (`""` → SDK default). Maps from the
/// bridge's `VoiceEngineV2BridgePublishScreenOptions`.
#[tauri::command]
pub async fn voice_engine_publish_screen(
    source_id: String,
    source_kind: String,
    width: u32,
    height: u32,
    fps: u32,
    max_bitrate_bps: Option<f64>,
    codec: Option<String>,
    // The client's VoiceEngineV2 coordinator only accepts a published screen
    // track whose NAME equals this captureId — otherwise it drops it as a "stale
    // publication for a different capture" and falls back to the browser
    // getDisplayMedia path (WebView2 dialog + wrong/green capture + uncapped
    // preview). So the native track MUST be named the captureId, not "screen".
    capture_id: Option<String>,
) -> Result<(), String> {
    // The bridge sends bitrate as a JS number (f64); clamp to a sane u64.
    let max_bitrate = max_bitrate_bps
        .filter(|b| b.is_finite() && *b > 0.0)
        .map(|b| b as u64);
    engine()
        .publish_screen(
            &source_id,
            &source_kind,
            width,
            height,
            fps,
            max_bitrate,
            codec.as_deref().unwrap_or(""),
            capture_id.as_deref(),
        )
        .await
        .stringify()
}

/// Stop and unpublish the active screen share. Succeeds as a no-op when nothing
/// is being shared (the client may call this defensively).
#[tauri::command]
pub async fn voice_engine_unpublish_screen() -> Result<(), String> {
    engine().unpublish_screen().await.stringify()
}

// --- Camera (native video) ------------------------------------------------

/// Enumerate webcam devices for the client's device picker. `CameraDevice
/// { id, label }` serializes to the shape the shim maps into the bridge's device
/// list. Returns an empty list when the `camera` feature is compiled out.
#[tauri::command]
pub async fn voice_engine_list_camera_devices() -> Result<Vec<CameraDevice>, String> {
    // Device enumeration is blocking (per-OS capture backend query); run it on a
    // blocking thread so it never stalls the async runtime.
    tauri::async_runtime::spawn_blocking(VoiceEngine::list_camera_devices)
        .await
        .map_err(|e| format!("list_camera_devices task join: {e}"))?
        .stringify()
}

/// Publish a webcam video track and start the native capture → frame pump feeding
/// it. `device_id` identifies the picked camera (`""`/`"default"` → first);
/// `width`/`height` are capture dimensions; `fps`/`max_bitrate_bps` bound the
/// encoder; `codec` is the client's negotiated codec (`""` → SDK default). Maps
/// from the bridge's publish-camera options (mirrors `voice_engine_publish_screen`).
#[tauri::command]
pub async fn voice_engine_publish_camera(
    device_id: String,
    width: u32,
    height: u32,
    fps: u32,
    max_bitrate_bps: Option<f64>,
    codec: Option<String>,
) -> Result<(), String> {
    // The bridge sends bitrate as a JS number (f64); clamp to a sane u64.
    let max_bitrate = max_bitrate_bps
        .filter(|b| b.is_finite() && *b > 0.0)
        .map(|b| b as u64);
    // Pass the session's video-frame sender so the camera loops its frames back
    // for the LOCAL self-view (via onVideoFrame under 'native-camera'). Set by
    // voice_engine_connect; absent if somehow not connected (publish will error).
    let local_tx = video_tx_slot().lock().unwrap().clone();
    engine()
        .publish_camera(
            &device_id,
            width,
            height,
            fps,
            max_bitrate,
            codec.as_deref().unwrap_or(""),
            local_tx,
        )
        .await
        .stringify()
}

/// Stop and unpublish the active camera. Succeeds as a no-op when nothing is
/// being published (the client may call this defensively).
#[tauri::command]
pub async fn voice_engine_unpublish_camera() -> Result<(), String> {
    engine().unpublish_camera().await.stringify()
}
