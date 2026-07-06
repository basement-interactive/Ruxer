// LiveKitRoom: a thin wrapper around `livekit-client`'s `Room` that the
// VoiceStore drives. Keeps the LiveKit import surface in one place so the
// rest of the app talks to a small, typed API instead of the full SDK.
//
// Responsibilities:
//   - connect(endpoint, token): join a LiveKit room and publish the mic.
//   - disconnect: leave the room + stop all tracks.
//   - mic/camera/screen-share toggles that also reflect back into the store.
//   - per-participant volume (sets the remote audio track's element volume).
//   - voice-activity vs PTT: VAD via LiveKit's active-speaker tracking; PTT
//     is handled by the store calling `setMicEnabled` on hotkey down/up.
//   - event emission: participant connect/disconnect, track subscribed, active
//     speaker change, connection state change — the store reacts to these.

import {
  Room,
  RoomEvent,
  Track,
  type RoomConnectOptions,
  type AudioCaptureOptions,
  type VideoCaptureOptions,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
  type LocalParticipant,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type LocalTrackPublication,
  type Participant,
} from "livekit-client";

export type VoiceConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

/// A participant the UI can render: identity (Fluxer user id), display name,
/// and which tracks they have published. Local = the current user.
export interface VoiceParticipant {
  /// Raw LiveKit identity (`user_{userId}_{connectionId}`) — used to target the
  /// participant's audio track for volume.
  identity: string;
  /// Parsed Fluxer user id — used to match against our user/member ids.
  userId: string;
  name: string;
  isLocal: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  speaking: boolean;
  /// Whether the participant is deafened (local user reads serverDeafened).
  deafened: boolean;
  /// Per-participant volume set by the local user (0..1, default 1). Only
  /// meaningful for remote participants; local audio is never played back.
  volume: number;
  /// LiveKit connection quality (drives the signal-strength indicator).
  connectionQuality: "excellent" | "good" | "poor" | "lost" | "unknown";
}

/// The kind of a subscribed track, surfaced in `trackSubscribed` events.
export type SubscribedTrackKind = "audio" | "video" | "screen";

/// Events emitted by `LiveKitRoom` that the VoiceStore subscribes to.
export type VoiceRoomEvent =
  | { kind: "state"; state: VoiceConnectionState }
  | { kind: "participants"; participants: VoiceParticipant[] }
  | { kind: "activeSpeaker"; identity: string | null }
  | { kind: "trackSubscribed"; identity: string; trackKind: SubscribedTrackKind }
  | { kind: "error"; message: string };

export type VoiceRoomListener = (e: VoiceRoomEvent) => void;

/// Options passed to `connect`. All optional beyond endpoint + token.
export interface ConnectOptions {
  /// Publish the mic on join (default true).
  publishMic?: boolean;
  /// Publish the camera on join (default false).
  publishCamera?: boolean;
  /// Publish a screen-share track on join (default false).
  publishScreen?: boolean;
  /// Voice-activity detection flag (informational; the store reads it to
  /// decide whether a PTT hotkey should override VAD).
  voiceActivity?: boolean;
  /// Audio capture options (device id, echo cancellation, noise suppression,
  /// auto-gain). Passed through to `setMicrophoneEnabled`.
  audioCapture?: AudioCaptureOptions;
  /// Video capture options for the camera track.
  videoCapture?: VideoCaptureOptions;
  /// Screen-share capture options.
  screenCapture?: ScreenShareCaptureOptions;
  /// Publish options for the mic track (codec, bitrate). Defaults to Opus.
  audioPublish?: TrackPublishOptions;
  /// Publish options for the camera track.
  videoPublish?: TrackPublishOptions;
  /// Extra `RoomConnectOptions` (ICE servers, adaptive streaming, etc.).
  connectOpts?: RoomConnectOptions;
}

/// The LiveKit room handle. Only one room is connected at a time; the
/// VoiceStore owns a single instance.
export class LiveKitRoom {
  private room: Room;
  private listeners = new Set<VoiceRoomListener>();
  private voiceActivityEnabled = false;
  /// Cached display names keyed by participant identity. The store populates
  /// these from the Fluxer user lookup so the participant list shows real
  /// names instead of LiveKit identities.
  private names = new Map<string, string>();
  /// Cached per-remote-participant volume (0..1). Applied when a track is
  /// subscribed (the audio element is created then).
  private volumes = new Map<string, number>();

  constructor() {
    this.room = new Room({
      // Adaptive stream + dynacast for video only (saves bandwidth when no one
      // is watching a camera). Audio is configured for MAX FIDELITY below.
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        // Pure audio: no client-side DSP (see PURE_AUDIO_CAPTURE). High-quality
        // 128 kbps Opus, DTX OFF (continuous stream, no silence gating), RED ON
        // (forward error correction — without it audio drops out on real
        // networks). Mono so the track always routes (forcing stereo broke
        // publishing on mono mics / WebView2).
        audioPreset: { maxBitrate: 128_000 },
        dtx: false,
        red: true,
      },
    });
    this.wireRoomEvents();
  }

  // Pure-audio capture constraints: every browser DSP stage disabled so the
  // microphone signal is passed through untouched. Merged with the caller's
  // device-id selection in `connect`.
  static readonly PURE_AUDIO_CAPTURE: AudioCaptureOptions = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    // Browser-specific extensions (Chromium) that further disable processing.
    // Cast to any since they're not in the standard MediaTrackConstraints type.
    ...({
      voiceIsolation: false,
      googEchoCancellation: false,
      googAutoGainControl: false,
      googNoiseSuppression: false,
      googHighpassFilter: false,
      googTypingNoiseDetection: false,
    } as Record<string, unknown>),
  };

  /// Subscribe to room events. Returns an unsubscribe function.
  on(listener: VoiceRoomListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /// Join a LiveKit room. `endpoint` is the `wss://` URL from
  /// `VOICE_SERVER_UPDATE.endpoint`; `token` is the server-issued JWT.
  /// Resolves once the room is connected and the mic (if requested) is
  /// published. Rejects on any connection failure.
  async connect(endpoint: string, token: string, opts: ConnectOptions = {}): Promise<void> {
    this.voiceActivityEnabled = opts.voiceActivity ?? false;
    // LiveKit expects the `wss://` scheme; the gateway may hand us a bare host
    // or an `https://` URL. Normalize.
    const url = normalizeWsUrl(endpoint);
    this.emit({ kind: "state", state: "connecting" });
    try {
      await this.room.connect(url, token, opts.connectOpts);
    } catch (e) {
      this.emit({ kind: "error", message: `connect failed: ${String(e)}` });
      this.emit({ kind: "state", state: "disconnected" });
      throw e;
    }
    this.emit({ kind: "state", state: this.room.state as VoiceConnectionState });

    // Publish tracks as requested. Mic is on by default so the user is audible
    // immediately; camera and screen share are opt-in.
    const lp = this.room.localParticipant;
    if (opts.publishMic !== false) {
      try {
        // Take the caller's device-id selection but force the pure-audio
        // (no-DSP) constraints so processing stays disabled regardless of what
        // the caller passed.
        const audioCapture: AudioCaptureOptions = {
          ...opts.audioCapture,
          ...LiveKitRoom.PURE_AUDIO_CAPTURE,
        };
        await lp.setMicrophoneEnabled(true, audioCapture, opts.audioPublish);
        // Hint the encoder that this is full-band music-grade audio (not speech)
        // so Opus doesn't apply speech-optimized band-limiting. Mirrors the
        // reference's studio-mode contentHint='music'.
        try {
          const micPub = lp.getTrackPublication(Track.Source.Microphone);
          const mt = micPub?.track?.mediaStreamTrack;
          if (mt) (mt as MediaStreamTrack & { contentHint: string }).contentHint = "music";
        } catch {
          // contentHint is best-effort; ignore if unsupported.
        }
      } catch (e) {
        // Mic permission denial or device error shouldn't kill the call —
        // the user can still hear others and toggle the mic on later.
        this.emit({ kind: "error", message: `mic publish failed: ${String(e)}` });
      }
    }
    if (opts.publishCamera) {
      try {
        await lp.setCameraEnabled(true, opts.videoCapture, opts.videoPublish);
      } catch (e) {
        this.emit({ kind: "error", message: `camera publish failed: ${String(e)}` });
      }
    }
    if (opts.publishScreen) {
      try {
        await lp.setScreenShareEnabled(true, opts.screenCapture, opts.videoPublish);
      } catch (e) {
        this.emit({ kind: "error", message: `screen share publish failed: ${String(e)}` });
      }
    }

    this.emitParticipants();
  }

  /// Leave the room and stop all local tracks. Safe to call when already
  /// disconnected.
  async disconnect(): Promise<void> {
    try {
      await this.room.disconnect();
    } finally {
      this.emit({ kind: "state", state: "disconnected" });
      this.emit({ kind: "participants", participants: [] });
    }
  }

  /// Toggle the mic on/off. Used by the UserArea mic button, the in-call
  /// controls, and PTT (hotkey down = on, hotkey up = off when PTT is active).
  /// When re-enabling, pass the pure-audio capture constraints so a re-acquired
  /// track keeps zero DSP (LiveKit may stop+recreate the track).
  async setMicEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      await this.room.localParticipant.setMicrophoneEnabled(true, LiveKitRoom.PURE_AUDIO_CAPTURE);
      // Re-assert the music content hint on the (possibly new) track.
      try {
        const micPub = this.room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const mt = micPub?.track?.mediaStreamTrack;
        if (mt) (mt as MediaStreamTrack & { contentHint: string }).contentHint = "music";
      } catch {
        // best-effort
      }
    } else {
      await this.room.localParticipant.setMicrophoneEnabled(false);
    }
    this.emitParticipants();
  }

  /// Toggle the camera on/off.
  async setCameraEnabled(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setCameraEnabled(enabled);
    this.emitParticipants();
  }

  /// Toggle screen share on/off.
  ///
  /// When enabling, pass explicit capture options so the track is usable in
  /// WebView2:
  ///   - `audio: true` captures SYSTEM/desktop audio alongside the video (2ch
  ///     48 kHz, no DSP) so viewers hear what's shared.
  ///   - `contentHint: 'detail'` tells the encoder to preserve text/UI sharpness
  ///     (vs 'motion' which trades detail for framerate). LiveKit sets this on
  ///     the track.
  ///   - `selfBrowserSurface: 'exclude'` / `systemAudio: 'include'` are the
  ///     standard getDisplayMedia hints; harmless where unsupported.
  /// Errors (user cancels the picker, capture fails) are re-thrown so the caller
  /// can surface them instead of silently no-op'ing.
  async setScreenShareEnabled(
    enabled: boolean,
    opts?: ScreenShareCaptureOptions,
  ): Promise<void> {
    if (enabled) {
      const capture: ScreenShareCaptureOptions = {
        // System/desktop audio (best-effort). getDisplayMedia system audio is
        // surface-dependent: Chromium on Windows can offer it for whole-screen /
        // window captures via the picker's "share audio" toggle, but it may be
        // absent (tab captures, macOS). When absent, the stream simply has no
        // audio track and none is published — video still works.
        audio: true,
        // Preserve detail (text/UI) over motion smoothness by default.
        contentHint: "detail",
        // Prefer sharing a whole surface, not this app's own tab.
        selfBrowserSurface: "exclude",
        systemAudio: "include",
        ...opts,
      };
      await this.room.localParticipant.setScreenShareEnabled(true, capture);
    } else {
      await this.room.localParticipant.setScreenShareEnabled(false);
    }
    this.emitParticipants();
  }

  /// Set the local user's mute state. LiveKit doesn't have a separate
  /// "muted but track published" flag for the local user beyond
  /// `setMicrophoneEnabled`, so we just toggle the track. Used when the server
  /// tells us we've been server-muted via VOICE_STATE_UPDATE.
  async setServerMuted(muted: boolean): Promise<void> {
    await this.setMicEnabled(!muted);
  }

  /// Set per-participant volume by FLUXER USER ID (0..3, 1 = unchanged). The
  /// LiveKit participant identity is `user_{userId}_{connectionId}`, so we parse
  /// each remote participant's identity and match by the embedded user id — a
  /// bare-userId comparison never matches the real identity. Applies via the
  /// RemoteAudioTrack's setVolume (which supports >1 amplification) and caches
  /// the value keyed by the real identity for tracks that subscribe later.
  setRemoteVolumeForUser(userId: string, volume: number): void {
    const clamped = Math.max(0, Math.min(3, volume));
    for (const [, rp] of this.room.remoteParticipants) {
      if (extractUserIdFromVoiceIdentity(rp.identity) !== userId) continue;
      this.volumes.set(rp.identity, clamped);
      for (const [, pub] of rp.audioTrackPublications) {
        applyVolumeToPub(pub as RemoteTrackPublication, clamped);
      }
    }
  }

  /// Select the audio output (speaker) device for all remote audio elements.
  /// Uses `setSinkId` on each attached <audio>; cached so tracks that attach
  /// later also route to the chosen device (see TrackSubscribed handler).
  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId;
    const apply = async () => {
      for (const p of this.room.remoteParticipants.values()) {
        for (const pub of p.audioTrackPublications.values()) {
          if (pub.track) {
            const el = pub.track.attach() as HTMLAudioElement | undefined;
            if (el && typeof (el as any).setSinkId === "function") {
              try { await (el as any).setSinkId(deviceId); } catch { /* ignore */ }
            }
          }
        }
      }
    };
    await apply();
  }
  /// The currently-selected output device id (read in TrackSubscribed so new
  /// tracks route to the right speaker).
  outputDeviceId: string = "";

  /// Set a display name for a participant identity (so the participant list
  /// shows real names). The store calls this after resolving Fluxer users.
  setDisplayName(identity: string, name: string): void {
    this.names.set(identity, name);
    this.emitParticipants();
  }

  /// Enable / disable voice-activity detection. Informational flag the store
  /// reads to decide whether a PTT hotkey should override VAD; LiveKit's
  /// active-speaker tracking handles the actual silence gating server-side.
  setVoiceActivity(enabled: boolean): void {
    this.voiceActivityEnabled = enabled;
  }

  /// Whether voice-activity detection is enabled.
  get voiceActivity(): boolean {
    return this.voiceActivityEnabled;
  }

  /// The current connection state.
  get state(): VoiceConnectionState {
    return this.room.state as VoiceConnectionState;
  }

  /// The local participant's LiveKit identity (Fluxer user id).
  get localIdentity(): string {
    return this.room.localParticipant.identity ?? "";
  }

  /// Whether the local participant is currently publishing a mic track.
  get micEnabled(): boolean {
    return this.room.localParticipant.isMicrophoneEnabled;
  }

  /// Whether the local participant is currently publishing a camera track.
  get cameraEnabled(): boolean {
    return this.room.localParticipant.isCameraEnabled;
  }

  /// Whether the local participant is currently screen-sharing.
  get screenShareEnabled(): boolean {
    return this.room.localParticipant.isScreenShareEnabled;
  }

  /// The underlying `Room` (advanced use — e.g. attaching video tracks to
  /// custom elements). The store should prefer the typed helpers above.
  get raw(): Room {
    return this.room;
  }

  /// Attach a participant's video track (camera or screen share) to a <video>
  /// element. Returns a detach cleanup, or null when the track isn't available
  /// yet (not published / not subscribed). Callers should re-invoke when the
  /// participant's cameraEnabled/screenShareEnabled flips (a fresh mount).
  attachVideo(
    identity: string,
    source: "camera" | "screen",
    el: HTMLVideoElement,
  ): (() => void) | null {
    const src = source === "screen" ? Track.Source.ScreenShare : Track.Source.Camera;
    const lp = this.room.localParticipant;
    let participant: Participant | undefined =
      lp.identity === identity ? lp : undefined;
    if (!participant) {
      for (const rp of this.room.remoteParticipants.values()) {
        if (rp.identity === identity) {
          participant = rp;
          break;
        }
      }
    }
    const track = participant?.getTrackPublication(src)?.track;
    if (!track) return null;
    track.attach(el);
    return () => {
      try {
        track.detach(el);
      } catch {
        /* element already gone */
      }
    };
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private wireRoomEvents(): void {
    const r = this.room;
    r.on(RoomEvent.ConnectionStateChanged, () => {
      this.emit({ kind: "state", state: r.state as VoiceConnectionState });
    });
    r.on(RoomEvent.ParticipantConnected, () => this.emitParticipants());
    r.on(RoomEvent.ParticipantDisconnected, () => this.emitParticipants());
    r.on(RoomEvent.TrackPublished, () => this.emitParticipants());
    r.on(RoomEvent.TrackUnpublished, () => this.emitParticipants());
    r.on(
      RoomEvent.TrackSubscribed,
      (_track: unknown, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        const trackKind = trackKindOf(pub);
        if (trackKind) {
          this.emit({
            kind: "trackSubscribed",
            identity: participant.identity ?? "",
            trackKind,
          });
        }
        // Apply any cached volume to the newly subscribed audio track (keyed by
        // the real `user_{id}_{conn}` identity).
        if (pub.kind === Track.Kind.Audio && participant.identity) {
          const vol = this.volumes.get(participant.identity);
          if (vol !== undefined) {
            applyVolumeToPub(pub, vol);
          }
          // Route the new audio element to the selected output device.
          if (this.outputDeviceId && pub.track) {
            const el = pub.track.attach() as HTMLAudioElement | undefined;
            if (el && typeof (el as any).setSinkId === "function") {
              (el as any).setSinkId(this.outputDeviceId).catch(() => {});
            }
          }
        }
        this.emitParticipants();
      },
    );
    r.on(RoomEvent.TrackUnsubscribed, () => this.emitParticipants());
    r.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const top = speakers[0];
      this.emit({ kind: "activeSpeaker", identity: top?.identity ?? null });
      this.emitParticipants();
    });
    r.on(RoomEvent.ConnectionQualityChanged, () => this.emitParticipants());
  }

  private emitParticipants(): void {
    const out: VoiceParticipant[] = [];
    // Local participant first so the UI can render it at the top of the list.
    out.push(participantFromLocal(this.room.localParticipant, this.names, this.localDeafened));
    for (const [, rp] of this.room.remoteParticipants) {
      out.push(participantFromRemote(rp, this.volumes, this.names));
    }
    this.emit({ kind: "participants", participants: out });
  }

  /// Whether the local user is deafened (set by the store when the deafen
  /// control is toggled or a server-deafen arrives). Surfaced on the local
  /// participant so the UI shows the indicator.
  localDeafened = false;

  private emit(e: VoiceRoomEvent): void {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {
        // A listener throwing must not break the others.
      }
    }
  }
}

// --- helpers ---------------------------------------------------------------

/// Parse the Fluxer user id out of a LiveKit participant identity of the form
/// `user_{userId}_{connectionId}` (the connection suffix is optional). Returns
/// null if the identity doesn't match.
export function extractUserIdFromVoiceIdentity(identity: string | undefined): string | null {
  if (!identity) return null;
  const m = /^user_(\d+)(?:_(.+))?$/.exec(identity);
  return m ? m[1] : null;
}

/// Apply a 0..3 volume to a remote audio publication. Prefers the
/// RemoteAudioTrack.setVolume API (supports >1 amplification); falls back to the
/// HTMLAudioElement volume (capped at 1) if unavailable.
function applyVolumeToPub(pub: RemoteTrackPublication, volume: number): void {
  const track = pub.track as unknown as { setVolume?: (v: number) => void } | undefined;
  if (track && typeof track.setVolume === "function") {
    track.setVolume(volume);
    return;
  }
  if (pub.track) {
    const el = pub.track.attach() as HTMLAudioElement | undefined;
    if (el) el.volume = Math.min(1, volume);
  }
}

/// Normalize an endpoint to the `wss://` scheme LiveKit expects. Accepts
/// `wss://`, `ws://`, `https://`, `http://`, or a bare host (assumed wss).
function normalizeWsUrl(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (trimmed.startsWith("wss://") || trimmed.startsWith("ws://")) return trimmed;
  if (trimmed.startsWith("https://")) return "wss://" + trimmed.slice("https://".length);
  if (trimmed.startsWith("http://")) return "ws://" + trimmed.slice("http://".length);
  // Bare host — assume wss. If a path is needed, the caller should include it.
  return `wss://${trimmed}`;
}

function trackKindOf(
  pub: RemoteTrackPublication | LocalTrackPublication,
): SubscribedTrackKind | null {
  if (pub.kind === Track.Kind.Audio) return "audio";
  if (pub.kind === Track.Kind.Video) {
    if (pub.source === Track.Source.ScreenShare) return "screen";
    return "video";
  }
  return null;
}

function participantFromLocal(
  lp: LocalParticipant,
  names: Map<string, string>,
  deafened: boolean,
): VoiceParticipant {
  const identity = lp.identity ?? "";
  const userId = extractUserIdFromVoiceIdentity(identity) ?? identity;
  return {
    identity,
    userId,
    name: names.get(userId) ?? lp.name ?? userId,
    isLocal: true,
    micEnabled: lp.isMicrophoneEnabled,
    cameraEnabled: lp.isCameraEnabled,
    screenShareEnabled: lp.isScreenShareEnabled,
    speaking: lp.isSpeaking,
    deafened,
    volume: 1,
    connectionQuality: normalizeQuality(lp.connectionQuality),
  };
}

function participantFromRemote(
  rp: RemoteParticipant,
  volumes: Map<string, number>,
  names: Map<string, string>,
): VoiceParticipant {
  const identity = rp.identity ?? "";
  const userId = extractUserIdFromVoiceIdentity(identity) ?? identity;
  return {
    identity,
    userId,
    name: names.get(userId) ?? rp.name ?? userId,
    isLocal: false,
    micEnabled: rp.isMicrophoneEnabled,
    cameraEnabled: rp.isCameraEnabled,
    screenShareEnabled: rp.isScreenShareEnabled,
    speaking: rp.isSpeaking,
    // LiveKit doesn't expose a remote deafen flag; derived from the echoed
    // voice state in the store (overwritten there for known users).
    deafened: false,
    volume: volumes.get(identity) ?? 1,
    connectionQuality: normalizeQuality(rp.connectionQuality),
  };
}

/// Coerce LiveKit's ConnectionQuality enum into our string union (its members
/// are already the lowercase strings; this narrows the type + guards unknowns).
function normalizeQuality(q: unknown): VoiceParticipant["connectionQuality"] {
  switch (q) {
    case "excellent":
    case "good":
    case "poor":
    case "lost":
      return q;
    default:
      return "unknown";
  }
}

// Re-export a few types the store/UI uses so they don't need to import
// livekit-client directly.
export { Room, RoomEvent, Track };
export type {
  AudioCaptureOptions,
  VideoCaptureOptions,
  ScreenShareCaptureOptions,
  TrackPublishOptions,
};