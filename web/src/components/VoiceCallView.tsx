// VoiceCallView: the in-call surface — a grid of participant tiles plus a
// screen-share stage. Renders LiveKit VIDEO tracks (camera + screen share),
// which previously published but were never displayed anywhere in the app
// (every track was attached as audio-only). Voice/video parity gap #1.
//
// Shown by MainContent when the current channel is the voice channel the local
// user is connected to. Tiles show live camera video when a participant's
// camera is on, otherwise their avatar; the active speaker gets a ring, and
// muted/deafened state is badged.

import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { voice, resolveUser, ui } from "../stores";
import type { VoiceParticipant } from "../voice/LiveKitRoom";
import { Avatar } from "./Avatar";
import "./VoiceCallView.css";

// Attaches a participant's video track to a <video> element for its lifetime.
// Keyed by the caller on (identity, source, enabled) so a toggle re-mounts this
// and re-attaches once the track exists.
const ParticipantVideo = observer(function ParticipantVideo({
  identity,
  source,
}: {
  identity: string;
  source: "camera" | "screen";
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const detach = voice.room?.attachVideo(identity, source, el) ?? null;
    return () => detach?.();
  }, [identity, source]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      // Local camera preview is muted to avoid echo; screen share keeps audio.
      muted={source === "camera"}
      className={`voice-tile-video ${source === "camera" ? "mirror" : ""}`}
    />
  );
});

function MicOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.3 2 2 3.3l6 6V11a4 4 0 0 0 6 3.4l1.5 1.5A6 6 0 0 1 6 11H4a8 8 0 0 0 3 6.2V21h2v-3.8l.3-.1L20.7 22 22 20.7 3.3 2zM16 11h-1.6L16 12.6V11zm-4-9a4 4 0 0 1 4 4v3.2l-8-8A4 4 0 0 1 12 2z" />
    </svg>
  );
}

function DeafIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3a9 9 0 0 0-9 9v5a3 3 0 0 0 3 3h1v-8H5v-0a7 7 0 0 1 14 0H15v8h1a3 3 0 0 0 3-3v-5a9 9 0 0 0-9-9zM2 2 22 22" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// 3-bar signal-strength indicator; lit bars scale with connection quality.
function SignalIcon({
  quality,
}: {
  quality: VoiceParticipant["connectionQuality"];
}) {
  const lit = quality === "excellent" ? 3 : quality === "good" ? 2 : quality === "poor" ? 1 : 0;
  const cls =
    quality === "lost" || quality === "unknown"
      ? "signal-bad"
      : quality === "poor"
        ? "signal-poor"
        : "signal-good";
  return (
    <span className={`voice-signal ${cls}`} title={`Connection: ${quality}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < lit ? "on" : ""} />
      ))}
    </span>
  );
}

// In-call control bar at the bottom of the call view. Mirrors the reference's
// VoiceControlBar; wired to the same VoiceStore actions the UserArea strip uses.
const CallControlBar = observer(function CallControlBar() {
  const micOn = voice.localParticipant?.micEnabled !== false;
  const deafened = voice.serverDeafened;
  const cameraOn = voice.localParticipant?.cameraEnabled ?? false;
  const screenOn = voice.localParticipant?.screenShareEnabled ?? false;

  return (
    <div className="voice-control-bar">
      <button
        type="button"
        className={`vc-btn ${!micOn ? "danger-active" : ""}`}
        title={micOn ? "Mute" : "Unmute"}
        onClick={() => voice.toggleMic().catch(() => {})}
      >
        {micOn ? <MicIcon /> : <MicOffIcon />}
      </button>
      <button
        type="button"
        className={`vc-btn ${deafened ? "danger-active" : ""}`}
        title={deafened ? "Undeafen" : "Deafen"}
        onClick={() => voice.toggleDeafen().catch(() => {})}
      >
        <DeafIcon />
      </button>
      <button
        type="button"
        className={`vc-btn ${cameraOn ? "on" : ""}`}
        title={cameraOn ? "Turn off camera" : "Turn on camera"}
        onClick={() => voice.toggleCamera().catch(() => {})}
      >
        <CameraIcon />
      </button>
      <button
        type="button"
        className={`vc-btn ${screenOn ? "on" : ""}`}
        title={screenOn ? "Stop sharing" : "Share your screen"}
        onClick={() => voice.toggleScreenShare().catch(() => {})}
      >
        <ScreenIcon />
      </button>
      <button
        type="button"
        className={`vc-btn ${ui.callExpanded ? "on" : ""}`}
        title={ui.callExpanded ? "Exit focus" : "Focus call"}
        onClick={() => ui.toggleCallExpanded()}
      >
        <ExpandIcon expanded={ui.callExpanded} />
      </button>
      <button
        type="button"
        className="vc-btn hangup"
        title="Disconnect"
        onClick={() => voice.leaveChannel().catch(() => {})}
      >
        <HangupIcon />
      </button>
    </div>
  );
});

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {expanded ? (
        <path d="M9 9V4H7v3H4v2h5zm6 0h5V7h-3V4h-2v5zM9 15H4v2h3v3h2v-5zm6 0v5h2v-3h3v-2h-5z" />
      ) : (
        <path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM6 14v4h4v2H4v-6h2zm12 0h2v6h-6v-2h4v-4z" />
      )}
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm7 9a7 7 0 0 1-6 6.9V21h-2v-3.1A7 7 0 0 1 5 11h2a5 5 0 0 0 10 0h2z" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
    </svg>
  );
}
function ScreenIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7v2h3v2H7v-2h3v-2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v9h16V6H4z" />
    </svg>
  );
}
function HangupIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.1a.99.99 0 0 1-.29-.71c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.68c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-1.82 1.36a.99.99 0 0 1-1.41-.01 11.6 11.6 0 0 0-2.66-1.85.998.998 0 0 1-.56-.9v-3.1A15.6 15.6 0 0 0 12 9z" />
    </svg>
  );
}

export const VoiceCallView = observer(function VoiceCallView() {
  const parts = voice.participants;
  const screensharer = parts.find((p) => p.screenShareEnabled);

  return (
    <div className="voice-call-view">
      {screensharer && (
        <div className="voice-screen-stage">
          <ParticipantVideo
            key={`screen-${screensharer.identity}`}
            identity={screensharer.identity}
            source="screen"
          />
          <div className="voice-stage-label">{screensharer.name} — screen</div>
        </div>
      )}

      <div className={`voice-tile-grid tiles-${Math.min(parts.length || 1, 9)}`}>
        {parts.length === 0 && (
          <div className="voice-call-empty muted">Connecting to voice…</div>
        )}
        {parts.map((p) => (
          <div
            key={p.identity}
            className={`voice-tile ${p.speaking ? "speaking" : ""}`}
          >
            {p.cameraEnabled ? (
              <ParticipantVideo
                key={`cam-${p.identity}`}
                identity={p.identity}
                source="camera"
              />
            ) : (
              <div className="voice-tile-avatar">
                <Avatar user={resolveUser(p.userId)} size={80} speaking={p.speaking} />
              </div>
            )}
            <div className="voice-tile-footer">
              {!p.micEnabled && (
                <span className="voice-tile-badge" title="Muted">
                  <MicOffIcon />
                </span>
              )}
              {p.deafened && (
                <span className="voice-tile-badge" title="Deafened">
                  <DeafIcon />
                </span>
              )}
              <span className="voice-tile-name">{p.name}</span>
              <SignalIcon quality={p.connectionQuality} />
            </div>
          </div>
        ))}
      </div>

      <CallControlBar />
    </div>
  );
});
