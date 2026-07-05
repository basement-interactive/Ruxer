//! Native LiveKit voice engine (P1 slice: connect, publish mic, hear remote
//! participants). Exists because WebKitGTK on every mainstream Linux distro
//! ships without WebRTC compiled in, so the reference client's own
//! JS/LiveKit-in-webview path cannot work there — see the memory note
//! `native-voice-engine-scope.md` for the full investigation. This crate
//! implements the client's `window.electron.voiceEngine` contract on top of
//! LiveKit's official Rust SDK, running voice in the native process instead
//! of the webview (mirroring what Electron's bundled Chromium effectively
//! does, just explicitly).
//!
//! Audio I/O is NOT hand-rolled: `livekit::PlatformAudio` wraps WebRTC's own
//! Audio Device Module, which owns mic capture AND speaker playout on
//! Windows/macOS/Linux (PulseAudio/ALSA) transparently — once a remote
//! participant's audio track exists on the peer connection, WebRTC plays it
//! out automatically. There is no manual "attach remote track to speaker"
//! step in the P1 slice.

mod camera;
mod screen;
mod video;

pub use video::{spawn_remote_video_stream, VideoFrameMeta, VideoFrameMsg};
pub use screen::ScreenSource;
pub use camera::CameraDevice;

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use livekit::{
    options::{AudioEncoding, TrackPublishOptions},
    track::{LocalAudioTrack, LocalTrack, TrackSource},
    webrtc::audio_source::RtcAudioSource,
    AudioProcessingOptions, PlatformAudio, Room, RoomEvent, RoomOptions,
};
// Only referenced by the connection-stats path, which is compiled out on Linux
// (see get_connection_stats' abort guard) — importing them there would warn.
#[cfg(not(target_os = "linux"))]
use livekit::{track::TrackKind, webrtc::stats::RtcStats};
use thiserror::Error;
use tokio::sync::{mpsc, Mutex};

#[derive(Debug, Error)]
pub enum VoiceEngineError {
    #[error("already connected to a room")]
    AlreadyConnected,
    #[error("not connected to a room")]
    NotConnected,
    #[error("room connect failed: {0}")]
    Connect(String),
    #[error("platform audio init failed: {0}")]
    Audio(String),
    #[error("publish failed: {0}")]
    Publish(String),
}

pub type VoiceResult<T> = Result<T, VoiceEngineError>;

/// Microphone DSP toggles the client threads through when publishing / when the
/// user changes their voice-processing mode mid-call. On the native path the
/// mic is captured by WebRTC's Audio Device Module (ADM), and the ADM's
/// software Audio Processing Module (APM) — AEC/NS/AGC — is the ONLY processing
/// applied to `RtcAudioSource::Device` (per-track `AudioSourceOptions` are a
/// documented no-op for the Device source; the webview never touches this
/// audio). So flipping these three off is the complete "direct input / 100%
/// untouched mic" story here — see the module docs and the client's `studio`
/// (Direct input) voice-processing mode, which sends all three false.
///
/// `deep_filter` is NOT represented: that's a separate LiveKit noise-reduction
/// track filter, and voice-native applies no audio filter at all (plain
/// `RoomOptions`/`TrackPublishOptions`), so there is nothing to disable —
/// direct input gets raw audio for free on that axis.
/// Tri-state per field: `None` = "leave WebRTC's current/default setting", not
/// "force on". This mirrors the reference engine's `Option<bool>` APM intent
/// (`engine.rs:4254-4256`) rather than the old bool-per-field shape that made
/// an unset field indistinguishable from an explicit `true` — the whole reason
/// a clean desktop mic was getting full-strength AEC/AGC/NS forced on it (the
/// shim coerced the client's `undefined` into `true`, see the shim's
/// `publishMicrophone`). Only the fields the client explicitly set are applied;
/// the rest fall through to whatever the ADM already has.
///
/// IMPORTANT SDK REALITY (upstream livekit 0.7.x, the version this crate uses —
/// NOT the reference's patched webrtc-sys): for `RtcAudioSource::Device` (our
/// mic), `RtcAudioSource::set_audio_options` is a documented no-op
/// (libwebrtc audio_source.rs — "Device source options are managed by the
/// Platform ADM"), and `PlatformAudio::configure_audio_processing` only toggles
/// *hardware* AEC/AGC/NS, which are all UNAVAILABLE on desktop (Windows/Linux) —
/// so that call is effectively inert for the software APM here. The upstream SDK
/// exposes no handle to the software APM for the Device source. Consequently the
/// load-bearing mic-quality fix lives in the shim's default selection (it stops
/// forcing NS/AGC on a clean mic); this tri-state keeps the CORRECT semantics
/// end-to-end and applies whatever the ADM does honor, and is ready to become
/// fully effective if a future SDK exposes a software-APM control.
#[derive(Debug, Clone, Copy, Default)]
pub struct AudioProcessing {
    pub echo_cancellation: Option<bool>,
    pub noise_suppression: Option<bool>,
    pub auto_gain_control: Option<bool>,
}

impl AudioProcessing {
    /// Map to LiveKit's ADM options, resolving each unset (`None`) field against
    /// `AudioProcessingOptions::default()` (WebRTC's normal all-on defaults) so
    /// we never *lower* a stage the client didn't ask to change.
    /// `prefer_hardware_processing: false` matches the desktop default (ignored
    /// on desktop anyway since hardware AEC/AGC/NS is unavailable — the software
    /// APM is the only path).
    fn to_livekit(self) -> AudioProcessingOptions {
        let defaults = AudioProcessingOptions::default();
        AudioProcessingOptions {
            echo_cancellation: self.echo_cancellation.unwrap_or(defaults.echo_cancellation),
            noise_suppression: self.noise_suppression.unwrap_or(defaults.noise_suppression),
            auto_gain_control: self.auto_gain_control.unwrap_or(defaults.auto_gain_control),
            prefer_hardware_processing: false,
        }
    }
}

/// One live session: the room handle and the mic track/publication (if
/// published). NOTE: the Platform ADM handle is NOT owned here anymore — it
/// lives on `VoiceEngine::platform_audio` for the whole process lifetime, so
/// dropping a session (on disconnect) no longer releases the ADM or risks
/// flipping playout to synthetic mode. See that field's docs.
struct Session {
    room: Room,
    mic_track: Option<LocalAudioTrack>,
    /// The active screen-share publication (track + capture + frame pump), if
    /// the user is sharing their screen. `None` until `publish_screen`. Torn
    /// down by `unpublish_screen` or when the session drops.
    screen: Option<screen::ScreenShareSlot>,
    /// The active webcam publication (track + capture thread + frame pump), if
    /// the user is publishing their camera. `None` until `publish_camera`. Torn
    /// down by `unpublish_camera` or when the session drops.
    camera: Option<camera::CameraSlot>,
    /// Previous cumulative byte counts per RTP stream, keyed by the WebRTC
    /// stat `id` (stable across polls for the same ssrc). WebRTC stats are
    /// cumulative counters, so instantaneous bitrate is only derivable as a
    /// delta between two polls — this holds the prior sample. Reset implicitly
    /// on reconnect (a fresh Session is constructed). See `get_connection_stats`.
    /// Unread on Linux (stats path gated off there).
    #[cfg_attr(target_os = "linux", allow(dead_code))]
    stat_samples: Mutex<HashMap<String, ByteSample>>,
}

/// A prior cumulative-bytes reading plus when it was taken, for bitrate deltas.
/// Only used by the non-Linux stats path (`get_connection_stats` is gated off on
/// Linux to dodge the SDK's cxx-callback unwrap abort — see there).
#[cfg_attr(target_os = "linux", allow(dead_code))]
#[derive(Clone, Copy)]
struct ByteSample {
    bytes: u64,
    at: Instant,
}

impl ByteSample {
    /// Kbps between this (previous) sample and a newer cumulative reading.
    /// Returns 0 when the counter went backwards (stream reset) or no time
    /// elapsed — both are "no meaningful rate yet" rather than errors.
    #[cfg_attr(target_os = "linux", allow(dead_code))]
    fn kbps_to(&self, bytes_now: u64, now: Instant) -> f64 {
        let dt = now.duration_since(self.at).as_secs_f64();
        if dt <= 0.0 || bytes_now < self.bytes {
            return 0.0;
        }
        let delta_bytes = (bytes_now - self.bytes) as f64;
        // bytes → bits → kilobits per second
        (delta_bytes * 8.0) / dt / 1000.0
    }
}

/// The engine — one instance per app, holds at most one active session.
/// Matches the client's expectation of a singleton native voice bridge.
pub struct VoiceEngine {
    session: Arc<Mutex<Option<Session>>>,
    /// Process-lifetime Platform ADM handle, created lazily and then NEVER
    /// dropped for the life of the engine (which is the life of the process —
    /// it's a `OnceLock` singleton in src-tauri). This is the fix for the
    /// "audio output unreliable / silent" bug: `PlatformAudio` is ref-counted
    /// (a global `Weak` in the SDK); when the last strong ref drops, the ADM
    /// stops platform playout+recording and flips to SYNTHETIC mode (output
    /// goes nowhere). The old code created a THROWAWAY `PlatformAudio::new()`
    /// in `is_supported`/`list_*_devices` and dropped it immediately, so at
    /// startup the ADM ref-count thrashed 0↔1 six-plus times and whether the
    /// next call landed on real speakers or silent synthetic playout was a
    /// race. Holding one strong ref here pins the ref-count ≥1 forever, so the
    /// ADM never falls back to synthetic mode. Sessions borrow a `.clone()` of
    /// this handle (also just an Arc bump), and dropping a session no longer
    /// releases the ADM — only the process exit does. Mirrors the reference
    /// engine's `platform_audio: Arc<Mutex<Option<PlatformAudio>>>`
    /// (`engine.rs:1940`) + `platform_audio()` helper (`engine.rs:2493-2504`).
    platform_audio: Arc<Mutex<Option<PlatformAudio>>>,
}

impl Default for VoiceEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl VoiceEngine {
    pub fn new() -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
            platform_audio: Arc::new(Mutex::new(None)),
        }
    }

    /// Get the process-lifetime Platform ADM handle, creating it on first use.
    /// Returns a clone (an `Arc` bump) so callers can enumerate devices /
    /// configure processing without ever letting the ref-count drop. The cached
    /// strong ref stays in `self.platform_audio` for the process lifetime, so
    /// the ADM never flips to synthetic playout. Mirrors the reference's
    /// `platform_audio()` (`engine.rs:2493-2504`).
    async fn platform_audio(&self) -> VoiceResult<PlatformAudio> {
        let mut guard = self.platform_audio.lock().await;
        if let Some(audio) = guard.as_ref() {
            return Ok(audio.clone());
        }
        let audio = PlatformAudio::new().map_err(|e| VoiceEngineError::Audio(e.to_string()))?;
        *guard = Some(audio.clone());
        Ok(audio)
    }

    /// Bridge-version-gate value the client checks before switching to the
    /// native path (`NATIVE_VOICE_ENGINE_BRIDGE_VERSION` in the reference
    /// client). Kept here so the Tauri command layer and the JS shim agree
    /// on one number without duplicating it.
    pub const BRIDGE_VERSION: u32 = 18;

    /// Whether platform audio can actually be initialized on this machine —
    /// the P1 "isSupported" check. Goes through the PERSISTENT handle (creating
    /// it on first call) rather than a throwaway `PlatformAudio::new()` that's
    /// dropped immediately: the client calls this 6+ times at startup
    /// (isSupported/prewarm/getReadiness/getCapabilities), and each throwaway
    /// acquire→release cycle bounced the ADM ref-count 0↔1, races that left
    /// playout on silent synthetic mode. Now the FIRST call creates the handle
    /// and every subsequent call just confirms it exists — the ADM ref-count
    /// stays pinned at ≥1 and never falls back to synthetic playout.
    pub async fn is_supported(&self) -> bool {
        self.platform_audio().await.is_ok()
    }

    /// Connect to a LiveKit room and start publishing the default microphone.
    /// Returns a channel of `RoomEvent`s the caller forwards to the client's
    /// `onEvent` callback (mapped to the bridge's event shape at the Tauri
    /// command layer, not here — this crate stays LiveKit-native).
    pub async fn connect(
        &self,
        url: &str,
        token: &str,
        processing: AudioProcessing,
    ) -> VoiceResult<mpsc::UnboundedReceiver<RoomEvent>> {
        let mut guard = self.session.lock().await;
        if guard.is_some() {
            return Err(VoiceEngineError::AlreadyConnected);
        }

        let (room, events) = Room::connect(url, token, RoomOptions::default())
            .await
            .map_err(|e| VoiceEngineError::Connect(e.to_string()))?;

        // REUSE the persistent Platform ADM handle rather than creating a second
        // `PlatformAudio` owned by the session. The old code did the latter, and
        // since the session owned that handle, disconnect dropped it — releasing
        // the ADM ref and (if it was the last one) tearing playout down to
        // synthetic mode between calls. Now the ADM lives on the engine for the
        // whole process; connect just borrows it to configure processing, and
        // disconnect leaves it untouched.
        let platform_audio = self.platform_audio().await?;

        // Apply the requested processing BEFORE publishing so the very first
        // published audio already honors it. Swallow a failure (log only): a
        // processing-config hiccup must not block joining the call — the ADM
        // just keeps its current settings. (On desktop this only reaches the
        // hardware-APM toggles, which are unavailable — see AudioProcessing's
        // note — so it's effectively a no-op here, but harmless and correct.)
        if let Err(e) = platform_audio.configure_audio_processing(processing.to_livekit()) {
            tracing::warn!("initial configure_audio_processing failed: {e}");
        }

        *guard = Some(Session {
            room,
            mic_track: None,
            screen: None,
            camera: None,
            stat_samples: Mutex::new(HashMap::new()),
        });
        drop(guard);

        // Publish the mic right away — P1 has no separate "arm the mic
        // without publishing" step; setMicEnabled(false) below just mutes
        // the already-published track (matches the client's own toggle
        // semantics for the JS path: mute, don't unpublish, so mute/unmute
        // is instant).
        self.publish_microphone().await?;

        Ok(events)
    }

    /// Reconfigure the ADM audio processing (AEC/NS/AGC) — how toggling "direct
    /// input" (or any voice-processing mode) mid-call takes effect without
    /// republishing the track. Acts on the PERSISTENT ADM handle (the same one
    /// the live session captures through), so the change reaches the active
    /// capture path. Works even before a session exists (the client can sync
    /// its voice-processing mode ahead of connect); the setting then carries
    /// into the next call. (Desktop caveat: this only reaches hardware-APM
    /// toggles, which are unavailable — see `AudioProcessing` — so it's inert
    /// for the software APM here; kept for correctness and non-desktop targets.)
    pub async fn set_audio_processing(&self, processing: AudioProcessing) -> VoiceResult<()> {
        let audio = self.platform_audio().await?;
        audio
            .configure_audio_processing(processing.to_livekit())
            .map_err(|e| VoiceEngineError::Audio(e.to_string()))
    }

    pub async fn disconnect(&self) -> VoiceResult<()> {
        let mut guard = self.session.lock().await;
        let Some(mut session) = guard.take() else {
            return Err(VoiceEngineError::NotConnected);
        };
        // Stop any live screen share first: signals the capture thread + frame
        // pump to exit and unregisters the frame-bus sink. `room.close()` below
        // drops the track anyway, so we don't await a separate unpublish here.
        if let Some(slot) = session.screen.as_ref() {
            slot.shutdown();
        }
        // Same for a live camera share: stop the capture thread + frame pump.
        if let Some(mut slot) = session.camera.take() {
            slot.shutdown();
        }
        // The Platform ADM is intentionally NOT released here: it's owned by
        // `VoiceEngine::platform_audio` for the process lifetime, so playout
        // stays on real speakers between calls instead of dropping to synthetic
        // mode. Only `room.close()` tears down this session's tracks/transport.
        session
            .room
            .close()
            .await
            .map_err(|e| VoiceEngineError::Connect(e.to_string()))?;
        Ok(())
    }

    pub async fn is_connected(&self) -> bool {
        self.session.lock().await.is_some()
    }

    async fn publish_microphone(&self) -> VoiceResult<()> {
        let mut guard = self.session.lock().await;
        let session = guard.as_mut().ok_or(VoiceEngineError::NotConnected)?;

        let track = LocalAudioTrack::create_audio_track(
            "microphone",
            RtcAudioSource::Device, // routes through PlatformAudio's ADM, not manual PCM push
        );
        session
            .room
            .local_participant()
            .publish_track(
                LocalTrack::Audio(track.clone()),
                TrackPublishOptions {
                    source: TrackSource::Microphone,
                    // HIGH-QUALITY MIC. Default (audio_encoding=None) caps opus at
                    // MUSIC=48kbps mono-ish — audibly compressed. Request 128kbps
                    // (= the SDK's MUSIC_HIGH_QUALITY_STEREO tier): the SDK
                    // unconditionally munges `stereo=1` into the opus fmtp, so a
                    // stereo-capable source gets true music-grade stereo for free.
                    audio_encoding: Some(AudioEncoding { max_bitrate: 128_000 }),
                    // Disable DTX (discontinuous transmission): DTX gates quiet
                    // passages to save bandwidth, which hurts music/high-fidelity
                    // and clips soft speech onsets. RED (loss-redundancy) stays on.
                    dtx: false,
                    ..Default::default()
                },
            )
            .await
            .map_err(|e| VoiceEngineError::Publish(e.to_string()))?;
        session.mic_track = Some(track);
        Ok(())
    }

    /// Publish a data-channel packet (the client uses this for video-codec
    /// gossip between peers — `MediaEngineFacade.syncWatchedStreamCodecGossip`).
    /// Previously a rejecting stub, which spammed "Native data publish failed"
    /// every ~6s whenever a remote video stream existed AND blocked codec
    /// negotiation from completing. `reliable` picks the ordered/retransmitted
    /// channel; `topic` is an optional routing hint; empty `destination_identities`
    /// broadcasts to the room.
    pub async fn publish_data(
        &self,
        payload: Vec<u8>,
        topic: Option<String>,
        reliable: bool,
        destination_identities: Vec<String>,
    ) -> VoiceResult<()> {
        let guard = self.session.lock().await;
        let session = guard.as_ref().ok_or(VoiceEngineError::NotConnected)?;
        session
            .room
            .local_participant()
            .publish_data(livekit::DataPacket {
                payload,
                topic,
                reliable,
                destination_identities: destination_identities
                    .into_iter()
                    .map(Into::into)
                    .collect(),
            })
            .await
            .map_err(|e| VoiceEngineError::Publish(format!("publish data: {e}")))
    }

    /// Mute/unmute without unpublishing (matches client toggle semantics —
    /// see the comment in `connect`).
    pub async fn set_mic_enabled(&self, enabled: bool) -> VoiceResult<()> {
        let guard = self.session.lock().await;
        let session = guard.as_ref().ok_or(VoiceEngineError::NotConnected)?;
        let track = session.mic_track.as_ref().ok_or(VoiceEngineError::NotConnected)?;
        if enabled {
            track.unmute();
        } else {
            track.mute();
        }
        Ok(())
    }

    // --- Screen share (P2 native video) ------------------------------------

    /// Enumerate capturable screen/window sources for the client's picker.
    /// Static (no live session needed): on Linux this drives the compositor's
    /// portal picker; on Windows it enumerates monitors + windows. See
    /// `screen::list_screen_sources`.
    pub fn list_screen_sources() -> VoiceResult<Vec<ScreenSource>> {
        screen::list_screen_sources()
    }

    /// Publish a screen-share video track onto the live room and start feeding
    /// it captured frames. `source_id`/`source_kind` come from
    /// `list_screen_sources` (or the desktop-sources picker); `width`/`height`
    /// are the capture dimensions; `max_bitrate_bps`/`fps` bound the encoder.
    /// Republishing while already sharing replaces the previous share.
    #[allow(clippy::too_many_arguments)]
    pub async fn publish_screen(
        &self,
        source_id: &str,
        source_kind: &str,
        width: u32,
        height: u32,
        fps: u32,
        max_bitrate_bps: Option<u64>,
        codec: &str,
        // Track NAME to publish under. The client's VoiceEngineV2 coordinator
        // rejects a screen track whose name != this captureId. `None` falls back
        // to "screen" (Linux/non-native-coordinator callers).
        capture_id: Option<&str>,
    ) -> VoiceResult<()> {
        let mut guard = self.session.lock().await;
        let session = guard.as_mut().ok_or(VoiceEngineError::NotConnected)?;
        // Replace an existing share cleanly first, so the room never briefly
        // carries two screen tracks and the old capture/pump is torn down.
        if let Some(old) = session.screen.take() {
            let _ = screen::unpublish_screen(&session.room, old).await;
        }
        let slot = screen::publish_screen(
            &session.room,
            source_id,
            source_kind,
            width,
            height,
            fps,
            max_bitrate_bps,
            codec,
            capture_id,
        )
        .await?;
        session.screen = Some(slot);
        Ok(())
    }

    /// Stop and unpublish the active screen share. A no-op-success if nothing is
    /// being shared (the client may call this defensively).
    pub async fn unpublish_screen(&self) -> VoiceResult<()> {
        let mut guard = self.session.lock().await;
        let session = guard.as_mut().ok_or(VoiceEngineError::NotConnected)?;
        let Some(slot) = session.screen.take() else {
            return Ok(());
        };
        screen::unpublish_screen(&session.room, slot).await
    }

    // --- Camera (native video) ---------------------------------------------

    /// Enumerate webcam devices for the client's device picker. Static (no live
    /// session needed) — see `camera::list_camera_devices`. Returns an empty list
    /// when the `camera` feature is compiled out.
    pub fn list_camera_devices() -> VoiceResult<Vec<CameraDevice>> {
        camera::list_camera_devices()
    }

    /// Publish a webcam video track onto the live room and start feeding it
    /// captured frames. `device_id` comes from `list_camera_devices` (an index
    /// string or a device path; `""`/`"default"` → first camera); `width`/
    /// `height` are the capture dimensions; `fps`/`max_bitrate_bps` bound the
    /// encoder. Republishing while already publishing replaces the previous
    /// camera. Errors with "camera support not compiled in" when the feature is
    /// off. Mirrors `publish_screen`.
    pub async fn publish_camera(
        &self,
        device_id: &str,
        width: u32,
        height: u32,
        fps: u32,
        max_bitrate_bps: Option<u64>,
        codec: &str,
        // Optional sink for the LOCAL camera self-view — the Tauri layer passes
        // the same video-frame channel remote video uses, so the user's own
        // camera loops back through onVideoFrame (else the self-preview is blank).
        local_frame_tx: Option<mpsc::UnboundedSender<VideoFrameMsg>>,
    ) -> VoiceResult<()> {
        let mut guard = self.session.lock().await;
        let session = guard.as_mut().ok_or(VoiceEngineError::NotConnected)?;
        // Replace an existing camera cleanly first, so the room never briefly
        // carries two camera tracks and the old capture/pump is torn down.
        if let Some(old) = session.camera.take() {
            let _ = camera::unpublish_camera(&session.room, old).await;
        }
        let slot = camera::publish_camera(
            &session.room,
            device_id,
            width,
            height,
            fps,
            max_bitrate_bps,
            codec,
            local_frame_tx,
        )
        .await?;
        session.camera = Some(slot);
        Ok(())
    }

    /// Stop and unpublish the active camera. A no-op-success if nothing is being
    /// published (the client may call this defensively). Mirrors
    /// `unpublish_screen`.
    pub async fn unpublish_camera(&self) -> VoiceResult<()> {
        let mut guard = self.session.lock().await;
        let session = guard.as_mut().ok_or(VoiceEngineError::NotConnected)?;
        let Some(slot) = session.camera.take() else {
            return Ok(());
        };
        camera::unpublish_camera(&session.room, slot).await
    }

    /// Recording (microphone) device list — the client's device picker needs
    /// this even in a voice-only slice. Enumerates off the PERSISTENT ADM handle
    /// (creating it on first use) rather than a throwaway `PlatformAudio::new()`
    /// that was dropped the instant enumeration finished — those drops were part
    /// of the ADM ref-count thrash that flipped playout to synthetic mode. Now
    /// the handle stays alive, so enumerating never disturbs playout.
    pub async fn list_recording_devices(&self) -> VoiceResult<Vec<AudioDevice>> {
        let audio = self.platform_audio().await?;
        Ok(audio
            .recording_devices()
            .map(|d| AudioDevice { id: d.id.as_str().to_string(), label: d.name, is_default: d.index == 0 })
            .collect())
    }

    pub async fn list_playout_devices(&self) -> VoiceResult<Vec<AudioDevice>> {
        let audio = self.platform_audio().await?;
        Ok(audio
            .playout_devices()
            .map(|d| AudioDevice { id: d.id.as_str().to_string(), label: d.name, is_default: d.index == 0 })
            .collect())
    }

    /// Switch the active output device on the PERSISTENT ADM handle (not a fresh
    /// throwaway `PlatformAudio::new()`, and no longer gated on an active session
    /// — the ADM lives process-wide, so a device switch can apply pre-call and
    /// simply stick).
    ///
    /// ROOT CAUSE #3 fix: the client feeds this its OWN device-picker id (a
    /// WebAudio-style `enumerateDevices` id), which won't match one of the ADM's
    /// own GUIDs (from `list_playout_devices`). The SDK's `set_playout_device`
    /// validates the id against the enumerated device list and returns
    /// `DeviceNotFound` on a miss — so passing the raw client id straight in
    /// made the switch a silent no-op almost every time (device selection never
    /// took effect). We now RESOLVE the client id to a real ADM playout GUID
    /// first (`resolve_playout_guid`), mirroring the reference's
    /// `audio::resolve_playout_device_guid` (`engine.rs:3274-3298`). Only if
    /// resolution fails do we fall back to leaving the current device — logged,
    /// not errored, since the client syncs on every device change and a
    /// per-tick error would re-spam "Native output-device sync failed".
    pub async fn set_playout_device(&self, device_id: &str) -> VoiceResult<()> {
        let audio = self.platform_audio().await?;
        let Some(guid) = resolve_playout_guid(&audio, device_id) else {
            tracing::debug!("set_playout_device({device_id}): no matching ADM device, leaving current");
            return Ok(());
        };
        if let Err(e) = audio.set_playout_device(&livekit::PlayoutDeviceId::from_unchecked_guid(&guid)) {
            tracing::debug!("set_playout_device({device_id} -> {guid}) ignored: {e}");
        }
        Ok(())
    }

    pub async fn set_recording_device(&self, device_id: &str) -> VoiceResult<()> {
        // Same resolution + tolerance as set_playout_device: the client's
        // WebAudio id rarely matches an ADM GUID directly, and the SDK's
        // `switch_recording_device` validates the id and errors on a miss. Map
        // to a real ADM recording GUID first; leave the current input if nothing
        // matches (logged, not errored — the client syncs before connecting and
        // on every device change).
        let audio = self.platform_audio().await?;
        let Some(guid) = resolve_recording_guid(&audio, device_id) else {
            tracing::debug!("set_recording_device({device_id}): no matching ADM device, leaving current");
            return Ok(());
        };
        if let Err(e) =
            audio.switch_recording_device(&livekit::RecordingDeviceId::from_unchecked_guid(&guid))
        {
            tracing::debug!("set_recording_device({device_id} -> {guid}) ignored: {e}");
        }
        Ok(())
    }

    /// Subscribe/unsubscribe a specific remote track, addressed by
    /// participant identity + source (`"camera"`/`"microphone"`/
    /// `"screenshare"`/...) — NOT by track SID. The client's v2 subscription
    /// pipeline (`VideoSubscriptionManager` →
    /// `buildVoiceMediaGraphNativeCameraSubscriptionCommand`) is entirely
    /// identity+source-based and never resolves a concrete `trackSid` before
    /// calling us; a sid-keyed command received `trackSid: undefined` and Tauri
    /// rejected it ("missing required key trackSid"). We resolve the concrete
    /// publication here by scanning the named participant's tracks for the
    /// matching source.
    ///
    /// A not-yet-known participant/source is a benign no-op, NOT an error: the
    /// client subscribes optimistically and can call this before the remote
    /// publication has arrived over the signaling channel. Returning Err made
    /// the client log "Native remote track subscription update failed" on every
    /// such call — noise for a normal transient state. Silently succeed; the
    /// client re-subscribes when the publication shows up.
    pub async fn set_remote_track_subscription(
        &self,
        participant_identity: &str,
        source: &str,
        subscribed: bool,
    ) -> VoiceResult<()> {
        let guard = self.session.lock().await;
        let session = guard.as_ref().ok_or(VoiceEngineError::NotConnected)?;
        for participant in session.room.remote_participants().values() {
            if participant.identity().as_str() != participant_identity {
                continue;
            }
            for publication in participant.track_publications().values() {
                if source_str(publication.source()) == source {
                    publication.set_subscribed(subscribed);
                    return Ok(());
                }
            }
            // Found the participant but the source's publication hasn't
            // arrived yet — benign, the client re-subscribes on publish.
            return Ok(());
        }
        Ok(())
    }

    /// Per-participant remote volume. The SDK has no continuous per-participant
    /// GAIN control (confirmed — nothing on `Room`/`RemoteParticipant`/
    /// `RemoteTrackPublication` sets a volume level), so true 0..1 volume still
    /// isn't possible. BUT the one case the client actually drives this for is
    /// DEAFEN: on deafen it pushes `volume 0` for EVERY participant
    /// (`NativeVoiceDeviceSync`: "deafened local user must push volume 0 for
    /// every participant"), and on undeafen a nonzero value. We honor exactly
    /// that binary: `volume <= 0` pauses that participant's audio delivery,
    /// nonzero resumes it. Uses `set_enabled` (pause delivery, keep the
    /// subscription) rather than `set_subscribed` so UNDEAFEN is instant — no
    /// re-subscribe signaling round-trip. This makes native deafen actually work
    /// (before, deafened users still heard everyone) with zero frontend change.
    pub async fn set_participant_volume(&self, participant_sid: &str, volume: f32) -> VoiceResult<()> {
        let guard = self.session.lock().await;
        let session = guard.as_ref().ok_or(VoiceEngineError::NotConnected)?;
        let enabled = volume > 0.0;
        for participant in session.room.remote_participants().values() {
            if participant.sid().as_str() != participant_sid {
                continue;
            }
            for publication in participant.track_publications().values() {
                // Audio publications only — leave video subscription untouched.
                if source_str(publication.source()) == "microphone"
                    || matches!(publication.kind(), livekit::track::TrackKind::Audio)
                {
                    publication.set_enabled(enabled);
                }
            }
            return Ok(());
        }
        Ok(())
    }

    /// LiveKit's ADM auto-detects speaking (surfaced via
    /// `RoomEvent::ActiveSpeakersChanged`) with no separate arm/disarm step,
    /// so P1 has nothing to configure here. Kept as an explicit accepted
    /// no-op — same reasoning as `set_participant_volume` above — rather than
    /// omitted, since the client's readiness gate requires the method exist.
    /// Parameters match the real contract
    /// (`VoiceEngineV2BridgeSpeakingDetectionOptions`, types.ts:472-475 —
    /// `localThresholdRms`/`remoteThresholdRms`, no `enabled` flag exists
    /// there at all) rather than an invented boolean, so a future real
    /// implementation doesn't inherit a parameter shape nothing in the
    /// client ever actually sends.
    pub async fn set_speaking_detection(
        &self,
        _local_threshold_rms: f32,
        _remote_threshold_rms: f32,
    ) -> VoiceResult<()> {
        Ok(())
    }

    /// Real WebRTC connection stats for the client's "Stats for Nerds" panel.
    /// Audio-only (P1): collects the mic's outbound RTP stats and each
    /// subscribed remote audio track's inbound RTP stats, deriving bitrate as a
    /// delta against the previous poll (the client polls ~1 Hz). RTT is taken
    /// from the send peer connection's candidate-pair `current_round_trip_time`
    /// (the room-level round trip), falling back to the mic's
    /// remote-inbound-rtp `round_trip_time` report.
    ///
    /// Never errors on a per-track stat fetch failure — a missing transceiver
    /// or not-yet-negotiated track just contributes nothing, keeping the
    /// per-second poll silent (returning Err would re-spam the very warnings
    /// this whole path exists to stop). Only "not connected" is a hard error,
    /// which the shim degrades to an empty payload.
    pub async fn get_connection_stats(&self) -> VoiceResult<BridgeStats> {
        // LINUX ABORT GUARD: every `get_stats()` call below routes into the
        // pinned SDK's stats callback, which does
        // `serde_json::from_str(&stats).unwrap()` (rtp_sender.rs:53,
        // rtp_receiver.rs:68, peer_connection.rs:423 — comment there literally
        // says "Unwrap because it should not happens"). On the Linux libwebrtc
        // build that assumption is FALSE: libwebrtc emits a stats JSON with a
        // non-string object key, serde_json fails with
        // `Error("key must be a string")`, and the panic happens INSIDE the cxx
        // FFI callback — a non-unwinding panic that `abort()`s the whole process
        // the moment the client's ~1 Hz "Stats for Nerds" poll fires after
        // joining a call. Our `if let Ok(..)` guards can't catch it because the
        // panic is upstream of the Result. Windows' libwebrtc build emits valid
        // JSON, so it's fine there. Until the SDK is forked to make the parse
        // non-fatal, skip stat collection entirely on Linux and return an empty
        // (but successful) payload — the panel shows blank, voice keeps working.
        // Still require an active session so the shim's "not connected" →
        // empty-payload degradation is unchanged. See [[native-voice-engine-scope]].
        #[cfg(target_os = "linux")]
        {
            let guard = self.session.lock().await;
            let _session = guard.as_ref().ok_or(VoiceEngineError::NotConnected)?;
            return Ok(BridgeStats {
                rtt_ms: None,
                outbound: Vec::new(),
                inbound: Vec::new(),
            });
        }

        #[cfg(not(target_os = "linux"))]
        {
        let guard = self.session.lock().await;
        let session = guard.as_ref().ok_or(VoiceEngineError::NotConnected)?;
        let now = Instant::now();

        // Snapshot the prior byte samples, then rebuild the map from this poll
        // so it never accumulates entries for streams that have gone away.
        let mut prev = session.stat_samples.lock().await;
        let mut next: HashMap<String, ByteSample> = HashMap::new();

        let mut rtt_ms: Option<f64> = None;
        let mut outbound: Vec<OutboundStat> = Vec::new();
        let mut inbound: Vec<InboundStat> = Vec::new();

        // --- Outbound: the local microphone track --------------------------
        if let Some(mic) = session.mic_track.as_ref() {
            let track_sid = mic.sid().as_str().to_string();
            if let Ok(stats) = mic.get_stats().await {
                // A candidate-pair current RTT (seconds) is the truest
                // room-level round trip; prefer it, then fall back to the
                // remote-inbound report below.
                let mut cp_rtt: Option<f64> = None;
                let mut ri_rtt: Option<f64> = None;
                let mut remote_packets_lost: Option<i64> = None;

                for stat in &stats {
                    match stat {
                        RtcStats::CandidatePair(cp) => {
                            let rtt = cp.candidate_pair.current_round_trip_time;
                            if rtt > 0.0 {
                                cp_rtt = Some(rtt * 1000.0);
                            }
                        }
                        RtcStats::RemoteInboundRtp(r) => {
                            let rtt = r.remote_inbound.round_trip_time;
                            if rtt > 0.0 {
                                ri_rtt = Some(rtt * 1000.0);
                            }
                            // Loss the *receiver* reports back about our send.
                            remote_packets_lost = Some(r.received.packets_lost);
                        }
                        _ => {}
                    }
                }
                rtt_ms = cp_rtt.or(ri_rtt);

                for stat in &stats {
                    if let RtcStats::OutboundRtp(o) = stat {
                        let id = o.rtc.id.clone();
                        let bytes_now = o.sent.bytes_sent;
                        let bitrate_kbps = prev
                            .get(&id)
                            .map(|p| p.kbps_to(bytes_now, now))
                            .unwrap_or(0.0);
                        next.insert(id, ByteSample { bytes: bytes_now, at: now });

                        outbound.push(OutboundStat {
                            track_sid: track_sid.clone(),
                            source: source_str(mic.source()),
                            kind: "audio",
                            codec: None,
                            bitrate_kbps,
                            // Prefer the receiver-reported loss; fall back to
                            // this outbound stream's own retransmit-less count
                            // (0 for a healthy stream) if no RR arrived yet.
                            packets_lost: remote_packets_lost.unwrap_or(0).max(0) as u64,
                        });
                    }
                }
            }
        }

        // --- Inbound: subscribed remote audio tracks -----------------------
        for participant in session.room.remote_participants().values() {
            let participant_sid = participant.sid().as_str().to_string();
            let participant_identity = participant.identity().as_str().to_string();

            for publication in participant.track_publications().values() {
                if publication.kind() != TrackKind::Audio {
                    continue;
                }
                let Some(track) = publication.track() else {
                    continue; // not subscribed yet
                };
                let track_sid = publication.sid().as_str().to_string();

                let Ok(stats) = track.get_stats().await else {
                    continue;
                };
                for stat in &stats {
                    if let RtcStats::InboundRtp(i) = stat {
                        let id = i.rtc.id.clone();
                        let bytes_now = i.inbound.bytes_received;
                        let bitrate_kbps = prev
                            .get(&id)
                            .map(|p| p.kbps_to(bytes_now, now))
                            .unwrap_or(0.0);
                        next.insert(id, ByteSample { bytes: bytes_now, at: now });

                        // jitter is reported in seconds; audio_level is the
                        // 0..1 linear level. Both are cheap optionals.
                        let jitter_ms = i.received.jitter * 1000.0;
                        let audio_level = i.inbound.audio_level;

                        inbound.push(InboundStat {
                            participant_sid: participant_sid.clone(),
                            participant_identity: Some(participant_identity.clone()),
                            track_sid: track_sid.clone(),
                            source: Some(source_str(publication.source())),
                            kind: "audio",
                            codec: None,
                            bitrate_kbps,
                            packets_lost: i.received.packets_lost.max(0) as u64,
                            jitter_ms: Some(jitter_ms),
                            audio_level: Some(audio_level),
                        });
                    }
                }
            }
        }

        *prev = next;
        drop(prev);

        Ok(BridgeStats { rtt_ms, outbound, inbound })
        } // end #[cfg(not(target_os = "linux"))]
    }
}

/// Resolve a client-supplied output device id (a WebAudio-style
/// `enumerateDevices` deviceId — `""`/`"default"`, an ADM GUID, or a label
/// fragment) to a concrete ADM playout GUID the SDK will accept. Mirrors the
/// reference's `audio::resolve_playout_device_guid` (`engine.rs:3274-3298`):
/// empty/`"default"` → the default device (ADM index 0), else an exact GUID
/// match, else a case-insensitive name/substring match as a best-effort bridge
/// between the two id namespaces. `None` means "no confident match" → the caller
/// leaves the current device rather than erroring.
fn resolve_playout_guid(audio: &PlatformAudio, requested: &str) -> Option<String> {
    let requested = requested.trim();
    let devices: Vec<_> = audio.playout_devices().collect();
    if requested.is_empty() || requested.eq_ignore_ascii_case("default") {
        return devices
            .iter()
            .find(|d| d.index == 0)
            .or_else(|| devices.first())
            .map(|d| d.id.as_str().to_string());
    }
    // Exact GUID match first (the reference's primary path).
    if let Some(d) = devices.iter().find(|d| d.id.as_str() == requested) {
        return Some(d.id.as_str().to_string());
    }
    // Best-effort name bridge: the client's WebAudio id won't equal an ADM GUID,
    // but its label sometimes overlaps — match on a case-insensitive substring.
    let needle = requested.to_ascii_lowercase();
    devices
        .iter()
        .find(|d| {
            let name = d.name.to_ascii_lowercase();
            name == needle || name.contains(&needle) || needle.contains(&name)
        })
        .map(|d| d.id.as_str().to_string())
}

/// Recording-device counterpart to `resolve_playout_guid` — same semantics for
/// the microphone input side.
fn resolve_recording_guid(audio: &PlatformAudio, requested: &str) -> Option<String> {
    let requested = requested.trim();
    let devices: Vec<_> = audio.recording_devices().collect();
    if requested.is_empty() || requested.eq_ignore_ascii_case("default") {
        return devices
            .iter()
            .find(|d| d.index == 0)
            .or_else(|| devices.first())
            .map(|d| d.id.as_str().to_string());
    }
    if let Some(d) = devices.iter().find(|d| d.id.as_str() == requested) {
        return Some(d.id.as_str().to_string());
    }
    let needle = requested.to_ascii_lowercase();
    devices
        .iter()
        .find(|d| {
            let name = d.name.to_ascii_lowercase();
            name == needle || name.contains(&needle) || needle.contains(&name)
        })
        .map(|d| d.id.as_str().to_string())
}

/// Map LiveKit's `TrackSource` to the client's lowercase source string
/// (`VoiceEngineV2` uses `'microphone' | 'camera' | 'screenshare' | ...`).
fn source_str(source: TrackSource) -> &'static str {
    match source {
        TrackSource::Camera => "camera",
        TrackSource::Microphone => "microphone",
        TrackSource::Screenshare => "screenshare",
        TrackSource::ScreenshareAudio => "screenshare_audio",
        TrackSource::Unknown => "unknown",
    }
}

/// Field names/shape match `VoiceEngineV2BridgeAudioInputDevice`/
/// `VoiceEngineV2BridgeAudioOutputDevice` (types.ts:271-287) directly, so the
/// Tauri command layer and shim can pass this through unchanged — same
/// convention as `desktop_bridge.rs`'s `GpuDeviceInfo`. `is_default` is
/// index==0 (the SDK exposes no other "is this the system default" signal —
/// confirmed via `RecordingDeviceInfo`/`PlayoutDeviceInfo` in
/// livekit::platform_audio, which only carry id/name/index).
#[derive(Debug, Clone, serde::Serialize)]
pub struct AudioDevice {
    #[serde(rename = "deviceId")]
    pub id: String,
    pub label: String,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
}

/// Serializes to `VoiceEngineV2BridgeStats` (types.ts:401) — the shim passes
/// this through to the client unchanged. `rttMs` is null when no RTT sample is
/// available yet (e.g. immediately after connect, before the first RTCP RR).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStats {
    pub rtt_ms: Option<f64>,
    pub outbound: Vec<OutboundStat>,
    pub inbound: Vec<InboundStat>,
}

/// Serializes to `VoiceEngineV2BridgeOutboundStat` (types.ts:351). Only the
/// required fields plus cheaply-available optionals are populated for the P1
/// audio slice; video-only fields (fps/width/…) are omitted (skipped when
/// `None`).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboundStat {
    pub track_sid: String,
    pub source: &'static str,
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codec: Option<String>,
    pub bitrate_kbps: f64,
    pub packets_lost: u64,
}

/// Serializes to `VoiceEngineV2BridgeInboundStat` (types.ts:381).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboundStat {
    pub participant_sid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participant_identity: Option<String>,
    pub track_sid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<&'static str>,
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codec: Option<String>,
    pub bitrate_kbps: f64,
    pub packets_lost: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub jitter_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_level: Option<f64>,
}
