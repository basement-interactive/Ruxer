// UserArea: the bottom self-card showing the current user's avatar, name, and
// tag. Discord-style. Clicking opens your own profile. The mic + deafen
// buttons toggle voice state (Slice C); they're disabled when not in a voice
// channel.

import { observer } from "mobx-react-lite";
import { session, settings, ui, voice, guilds } from "../stores";
import { Avatar } from "../components/Avatar";
import "./UserArea.css";

// Resolve a voice channel's display name from any guild's channel list.
function resolveVoiceChannelName(channelId: string): string {
  for (const chs of guilds.channelsByGuild.values()) {
    const c = chs.find((x) => x.id === channelId);
    if (c) return c.name ?? "Voice";
  }
  return "Voice";
}

export const UserArea = observer(function UserArea() {
  const me = session.me!;
  const name = me.global_name ?? me.username;
  const customStatus = settings.settings.custom_status;
  // Show the custom status (emoji + text) on the second line when set,
  // otherwise fall back to the username#discriminator tag.
  const customLabel = customStatus
    ? `${customStatus.emoji_name ?? ""} ${customStatus.text ?? ""}`.trim()
    : "";
  // Show voice controls only when THIS client has a live/connecting room.
  // `pendingChannelId` is set in joinChannel + cleared on leave, so it's the
  // local-intent signal. We deliberately do NOT use voice.inVoice — that
  // reflects the account's server-side voice state (possibly from another
  // device, or seeded stale at READY), which falsely showed the strip at rest.
  const inVoice =
    voice.pendingChannelId != null || voice.connectionState === "connected";
  const micOn = inVoice && voice.localParticipant?.micEnabled !== false;
  return (
    <div className="user-area" data-flx="app.user-area">
      {inVoice && <VoiceConnectionStrip />}
      <div className="user-area-row">
      <button
        className="user-area-main"
        onClick={(e) => ui.openProfile(me.id, { x: e.clientX, y: e.clientY })}
        title={`${name}#${me.discriminator}`}
      >
        <div className="user-area-avatar">
          <Avatar user={me} size={32} />
          <span className="user-area-status" />
        </div>
        <div className="user-area-text">
          <div className="user-area-name nowrap">{name}</div>
          <div className="user-area-tag muted small nowrap" title={customLabel || undefined}>
            {customLabel || `${me.username}#${me.discriminator}`}
          </div>
        </div>
      </button>
      <div className="user-area-actions">
        <button
          className="user-area-btn"
          title={inVoice ? (micOn ? "Mute" : "Unmute") : "Join a voice channel to use your mic"}
          disabled={!inVoice}
          onClick={() => voice.toggleMic().catch(() => {})}
        >
          <MicIcon muted={inVoice && !micOn} />
        </button>
        <button
          className={`user-area-btn ${inVoice && voice.serverDeafened ? "active" : ""}`}
          title={inVoice ? (voice.serverDeafened ? "Undeafen" : "Deafen") : "Join a voice channel to deafen"}
          disabled={!inVoice}
          onClick={() => voice.toggleDeafen().catch(() => {})}
        >
          <HeadphonesIcon deafened={inVoice && voice.serverDeafened} />
        </button>
        <button
          className="user-area-btn"
          title="Settings"
          onClick={() => ui.openSettings()}
        >
          <GearIcon />
        </button>
      </div>
      </div>
    </div>
  );
});

// The connected-voice strip shown above the self-card while in a voice
// channel: connection status + disconnect, plus camera / screen-share toggles.
// Replaces the old floating bottom-right panel.
const VoiceConnectionStrip = observer(function VoiceConnectionStrip() {
  const state = voice.connectionState;
  const connected = state === "connected";
  const channelName = voice.pendingChannelId
    ? resolveVoiceChannelName(voice.pendingChannelId)
    : "";
  const cameraOn = voice.localParticipant?.cameraEnabled ?? false;
  const screenOn = voice.localParticipant?.screenShareEnabled ?? false;

  return (
    <div className="voice-connection-strip">
      <div className="voice-connection-status-row">
        <span className={`voice-connection-dot ${connected ? "connected" : "connecting"}`} />
        <div className="voice-connection-text">
          <span className={`voice-connection-state ${connected ? "connected" : ""}`}>
            {connected ? "Voice Connected" : state === "reconnecting" ? "Reconnecting…" : "Connecting…"}
          </span>
          {channelName && <span className="voice-connection-channel nowrap">{channelName}</span>}
        </div>
        <button
          className="voice-connection-disconnect"
          title="Disconnect"
          onClick={() => voice.leaveChannel().catch(() => {})}
        >
          <PhoneXIcon />
        </button>
      </div>
      <div className="voice-connection-media">
        <button
          className={`voice-connection-media-btn ${cameraOn ? "active" : ""}`}
          title={cameraOn ? "Turn off camera" : "Turn on camera"}
          onClick={() => voice.toggleCamera().catch(() => {})}
        >
          <CameraIcon off={!cameraOn} />
          <span>Camera</span>
        </button>
        <button
          className={`voice-connection-media-btn ${screenOn ? "active" : ""}`}
          title={screenOn ? "Stop sharing" : "Share screen"}
          // Toggling on opens WebView2's native source picker (screens +
          // windows) via getDisplayMedia — the only way to target an arbitrary
          // source in WebView2. Toggling off stops immediately.
          onClick={() => voice.toggleScreenShare().catch(() => {})}
        >
          <ScreenIcon />
          <span>Screen</span>
        </button>
      </div>
    </div>
  );
});

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 11a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V23h2v-3.06A9 9 0 0 0 21 11h-2z" />
      {muted && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
function HeadphonesIcon({ deafened }: { deafened: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h1v-8H4v-1a8 8 0 0 1 16 0v1h-3v8h1a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9z" />
      {deafened && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
function PhoneXIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.62 10.79a15.5 15.5 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24 11.4 11.4 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z" />
      <path d="M16 5l5 5M21 5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
function CameraIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
      {off && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
function ScreenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h7v2H7v2h10v-2h-3v-2h7a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H3zm1 2h16v9H4V6z" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94a7.5 7.5 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.12.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.12-.56 1.62-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
    </svg>
  );
}