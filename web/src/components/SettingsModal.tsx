// SettingsModal: a centered modal overlay for user settings. The left nav
// lists the full pane set (Account/Profile/Privacy/Sessions/Appearance/
// Notifications/Voice & video/Keybinds/Language); the right pane renders the
// selected one. Functional panes:
//   - Account: shows email/verification/MFA flags + log out.
//   - Profile: presence status + custom status (broadcast via the gateway).
//   - Appearance: theme (dark/light) + message density + spoiler reveal.
//   - Voice & video: mic/camera device pickers feeding the LiveKitRoom capture
//     options + voice-activity toggle.
// Panes that require REST endpoints we don't yet have (Privacy/Sessions/
// Notifications/Keybinds/Language) link out to fluxer.app for now.

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { session, settings, ui, voice } from "../stores";
import type { PresenceStatus } from "../types";
import { LOCALES } from "../i18n";
import { Avatar } from "./Avatar";
import "./SettingsModal.css";

type Pane =
  | "account"
  | "profile"
  | "privacy"
  | "sessions"
  | "appearance"
  | "notifications"
  | "voice"
  | "keybinds"
  | "language"
  | "advanced"
  | "devices"
  | "premium"
  | "accessibility"
  | "chat";

const NAV: { id: Pane; label: string; group: string }[] = [
  { id: "account", label: "Account", group: "User Settings" },
  { id: "profile", label: "Profile", group: "User Settings" },
  { id: "privacy", label: "Privacy", group: "User Settings" },
  { id: "sessions", label: "Sessions", group: "User Settings" },
  { id: "devices", label: "Devices", group: "User Settings" },
  { id: "premium", label: "Plutonium", group: "User Settings" },
  { id: "appearance", label: "Appearance", group: "App Settings" },
  { id: "accessibility", label: "Accessibility", group: "App Settings" },
  { id: "chat", label: "Chat", group: "App Settings" },
  { id: "notifications", label: "Notifications", group: "App Settings" },
  { id: "voice", label: "Voice & Video", group: "App Settings" },
  { id: "keybinds", label: "Keybinds", group: "App Settings" },
  { id: "language", label: "Language", group: "App Settings" },
  { id: "advanced", label: "Advanced", group: "App Settings" },
];

const STATUSES: { value: PresenceStatus; label: string }[] = [
  { value: "online", label: "Online" },
  { value: "idle", label: "Idle" },
  { value: "dnd", label: "Do Not Disturb" },
  { value: "invisible", label: "Invisible" },
  { value: "offline", label: "Offline" },
];

export const SettingsModal = observer(function SettingsModal() {
  const open = ui.settingsOpen;
  const me = session.me;
  const [pane, setPane] = useState<Pane>("account");

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ui.closeSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !me) return null;

  return (
    <div className="settings-overlay" onClick={() => ui.closeSettings()}>
      <div className="settings-modal settings-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-nav">
          <div className="settings-nav-header">
            <Avatar user={me} size={32} />
            <span className="settings-nav-name nowrap">
              {me.global_name ?? me.username}
            </span>
          </div>
          <div className="settings-nav-scroll">
            {NAV.map((n, i) => (
              <button
                key={n.id}
                className={`settings-nav-item ${pane === n.id ? "selected" : ""}`}
                onClick={() => setPane(n.id)}
              >
                {n.label}
                {i === 0 && <span className="settings-nav-group muted small">{n.group}</span>}
              </button>
            ))}
          </div>
          <button className="settings-nav-logout" onClick={() => session.logout()}>
            Log Out
          </button>
        </div>
        <div className="settings-modal-content">
          <button className="settings-close" title="Close" onClick={() => ui.closeSettings()}>
            ✕
          </button>
          <div className="settings-pane">
            {pane === "account" && <AccountPane />}
            {pane === "profile" && <ProfilePane />}
            {pane === "privacy" && <PrivacyPane />}
            {pane === "sessions" && <SessionsPane />}
            {pane === "devices" && <DevicesPane />}
            {pane === "premium" && <PremiumPane />}
            {pane === "accessibility" && <AccessibilityPane />}
            {pane === "appearance" && <AppearancePane />}
            {pane === "chat" && <ChatPane />}
            {pane === "notifications" && <NotificationsPane />}
            {pane === "voice" && <VoicePane />}
            {pane === "keybinds" && <KeybindsPane />}
            {pane === "language" && <LanguagePane />}
            {pane === "advanced" && <AdvancedPane />}
          </div>
        </div>
      </div>
    </div>
  );
});

// --- Account ---------------------------------------------------------------

const AccountPane = observer(function AccountPane() {
  const me = session.me!;
  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Account</h2>
      <div className="settings-account-card">
        <Avatar user={me} size={80} />
        <div className="settings-account-info">
          <div className="settings-account-name">{me.global_name ?? me.username}</div>
          <div className="settings-account-tag muted">{me.username}#{me.discriminator}</div>
        </div>
      </div>
      <Field label="Email" value={me.email ?? "—"} sensitive />
      <Field label="Verified" value={me.verified ? "Yes" : "No"} />
      <Field label="Two-Factor Auth" value={me.mfa_enabled ? "Enabled" : "Disabled"} />
      <p className="settings-pane-help muted small">
        Account changes (username, email, password) are managed on fluxer.app.
      </p>
    </section>
  );
});

function Field({ label, value, sensitive }: { label: string; value: string; sensitive?: boolean }) {
  return (
    <div className="settings-field">
      <span className="settings-field-label muted small">{label}</span>
      <span className={`settings-field-value ${sensitive ? "sensitive" : ""}`}>{value}</span>
    </div>
  );
}

// --- Profile ---------------------------------------------------------------

const ProfilePane = observer(function ProfilePane() {
  const me = session.me!;
  const [customText, setCustomText] = useState("");
  const [customEmoji, setCustomEmoji] = useState("");
  const [status, setStatus] = useState<PresenceStatus>(settings.settings.status ?? "online");
  const [bio, setBio] = useState(me.bio ?? "");

  useEffect(() => {
    setCustomText(settings.settings.custom_status?.text ?? "");
    setCustomEmoji(settings.settings.custom_status?.emoji_name ?? "");
    setStatus(settings.settings.status ?? "online");
    setBio(me.bio ?? "");
  }, [me]);

  const applyStatus = async (next: PresenceStatus) => {
    setStatus(next);
    settings.applyUpdate({ status: next });
    try {
      await import("../api").then(({ api }) =>
        api.updatePresence(next, [], false, undefined),
      );
    } catch (e) {
      import("../stores").then(({ toasts }) => toasts.error("Failed to update presence", String(e)));
    }
  };

  const saveCustomStatus = () => {
    const text = customText.trim();
    const emoji = customEmoji.trim();
    settings.applyUpdate({
      custom_status: text || emoji ? { text, emoji_name: emoji || null } : null,
    });
  };

  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Profile</h2>
      <div className="settings-subtitle">Presence Status</div>
      <div className="settings-status-grid">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            className={`settings-status-row ${status === s.value ? "selected" : ""}`}
            onClick={() => applyStatus(s.value)}
          >
            <span className={`settings-status-dot status-${s.value}`} />
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      <div className="settings-subtitle">Custom Status</div>
      <div className="settings-custom-status">
        <input
          className="settings-emoji-input"
          value={customEmoji}
          onChange={(e) => setCustomEmoji(e.target.value)}
          placeholder="😀"
          maxLength={8}
          title="Status emoji"
        />
        <input
          className="settings-input"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder="What's happening?"
          maxLength={128}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              saveCustomStatus();
            }
          }}
        />
        <button className="settings-save" onClick={saveCustomStatus}>
          Save
        </button>
      </div>

      <div className="settings-subtitle">About Me</div>
      <textarea
        className="settings-textarea"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Tell people about yourself"
        maxLength={190}
        rows={4}
      />
      <p className="settings-pane-help muted small">
        Bio + pronouns sync coming soon; for now edit them on fluxer.app.
      </p>
    </section>
  );
});

// --- Appearance ------------------------------------------------------------

// --- Accessibility ---------------------------------------------------------

const AccessibilityPane = observer(function AccessibilityPane() {
  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Accessibility</h2>

      <div className="settings-subtitle">Reduced Motion</div>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={ui.reducedMotion}
          onChange={(e) => ui.setReducedMotion(e.target.checked)}
        />
        <span>Disable animations and transitions across the app</span>
      </label>

      <div className="settings-subtitle" style={{ marginTop: "1rem" }}>Color Saturation</div>
      <p className="settings-pane-help muted small">
        Lower the saturation of the entire interface ({Math.round(ui.saturation * 100)}%).
      </p>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={ui.saturation}
        onChange={(e) => ui.setSaturation(parseFloat(e.target.value))}
      />

      <div className="settings-subtitle" style={{ marginTop: "1rem" }}>Font Scale</div>
      <p className="settings-pane-help muted small">
        Scale the interface text size ({Math.round(ui.fontScale * 100)}%).
      </p>
      <input
        type="range"
        min={0.85}
        max={1.3}
        step={0.05}
        value={ui.fontScale}
        onChange={(e) => ui.setFontScale(parseFloat(e.target.value))}
      />
    </section>
  );
});

const AppearancePane = observer(function AppearancePane() {
  const theme = settings.settings.theme ?? "dark";
  const compact = settings.settings.message_display_compact ?? false;
  const spoilers = settings.settings.render_spoilers ?? "on_click";

  const setTheme = (t: "dark" | "light") => {
    settings.applyUpdate({ theme: t });
    document.documentElement.setAttribute("data-theme", t);
  };

  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Appearance</h2>
      <div className="settings-subtitle">Theme</div>
      <div className="settings-theme-grid">
        <button
          className={`settings-theme-card ${theme === "dark" ? "selected" : ""}`}
          onClick={() => setTheme("dark")}
        >
          <div className="settings-theme-swatch swatch-dark" />
          <span>Dark</span>
        </button>
        <button
          className={`settings-theme-card ${theme === "light" ? "selected" : ""}`}
          onClick={() => setTheme("light")}
        >
          <div className="settings-theme-swatch swatch-light" />
          <span>Light</span>
        </button>
      </div>
      <button
        className="settings-save"
        style={{ alignSelf: "flex-start", marginTop: "var(--sp-2)" }}
        onClick={() => {
          ui.closeSettings();
          ui.openThemeStudio();
        }}
      >
        Open Theme Studio
      </button>

      <div className="settings-subtitle">Message Display</div>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={compact}
          onChange={(e) => settings.applyUpdate({ message_display_compact: e.target.checked })}
        />
        <span>Compact mode (less spacing between messages)</span>
      </label>

      <div className="settings-subtitle">Spoiler Reveals</div>
      <label className="settings-toggle">
        <input
          type="radio"
          name="spoilers"
          checked={spoilers === "on_click"}
          onChange={() => settings.applyUpdate({ render_spoilers: "on_click" })}
        />
        <span>Reveal on click</span>
      </label>
      <label className="settings-toggle">
        <input
          type="radio"
          name="spoilers"
          checked={spoilers === "always"}
          onChange={() => settings.applyUpdate({ render_spoilers: "always" })}
        />
        <span>Always show</span>
      </label>
    </section>
  );
});

// --- Voice & Video ---------------------------------------------------------

const VoicePane = observer(function VoicePane() {
  // Local mirror of the persisted device selections in VoiceStore. Kept in
  // local state so the <select> is responsive; pushed to the store on change.
  const [micId, setMicId] = useState<string>(voice.micId);
  const [camId, setCamId] = useState<string>(voice.camId);
  const [outputId, setOutputId] = useState<string>(voice.outputId);
  const [vad, setVad] = useState<boolean>(true);

  // Enumerate media devices. WebView2 returns device *labels* only after a
  // getUserMedia grant, so warm up the audio permission once on mount (the
  // Tauri backend auto-grants mic/camera, so no popup appears) then refresh.
  const devices = useMediaDevices();
  const mics = devices.filter((d) => d.kind === "audioinput");
  const cams = devices.filter((d) => d.kind === "videoinput");
  const outputs = devices.filter((d) => d.kind === "audiooutput");

  const applyVad = (next: boolean) => {
    setVad(next);
    if (voice.room) voice.room.setVoiceActivity(next);
  };

  const onMic = (id: string) => { setMicId(id); voice.setMic(id); };
  const onCam = (id: string) => { setCamId(id); voice.setCam(id); };
  const onOutput = (id: string) => { setOutputId(id); voice.setOutput(id); };

  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Voice & Video</h2>
      <div className="settings-subtitle">Input Device (Microphone)</div>
      <select className="settings-select" value={micId} onChange={(e) => onMic(e.target.value)}>
        <option value="">Default</option>
        {mics.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Microphone ${d.deviceId.slice(0, 4)}`}
          </option>
        ))}
      </select>

      <div className="settings-subtitle">Output Device (Speaker)</div>
      <select className="settings-select" value={outputId} onChange={(e) => onOutput(e.target.value)}>
        <option value="">Default</option>
        {outputs.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Speaker ${d.deviceId.slice(0, 4)}`}
          </option>
        ))}
      </select>

      <div className="settings-subtitle">Input Mode</div>
      <label className="settings-toggle">
        <input
          type="radio"
          name="inputmode"
          checked={vad}
          onChange={() => applyVad(true)}
        />
        <span>Voice Activity</span>
      </label>
      <label className="settings-toggle">
        <input type="radio" name="inputmode" checked={!vad} onChange={() => applyVad(false)} />
        <span>Push to Talk (configure hotkey in Keybinds)</span>
      </label>

      <div className="settings-subtitle">Camera</div>
      <select className="settings-select" value={camId} onChange={(e) => onCam(e.target.value)}>
        <option value="">Default</option>
        {cams.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Camera ${d.deviceId.slice(0, 4)}`}
          </option>
        ))}
      </select>

      <div className="settings-subtitle">Sound Effects</div>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={voice.soundsEnabled}
          onChange={(e) => voice.setSoundsEnabled(e.target.checked)}
        />
        <span>Play UI sounds (mute, deafen, join/leave, messages)</span>
      </label>
      <div className="settings-row">
        <span className="muted small">Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={voice.soundVolume}
          disabled={!voice.soundsEnabled}
          onChange={(e) => voice.setSoundVolume(parseFloat(e.target.value))}
        />
        <span className="muted small">{Math.round(voice.soundVolume * 100)}%</span>
      </div>

      <p className="settings-pane-help muted small">
        Device choices apply the next time you join a voice channel.
      </p>
    </section>
  );
});

/// Tracks whether we've already warmed up the media permission this session, so
/// we don't re-open the microphone every time the Voice settings pane mounts
/// (each acquisition briefly flips the Windows mic-in-use indicator). Once the
/// permission is granted, device labels persist for the session.
let mediaPermissionWarmed = false;

/// Enumerate available media devices, re-querying when devicechange fires.
/// Device *labels* are exposed only after a getUserMedia grant, so if the first
/// enumeration comes back with empty labels we warm up the audio permission
/// ONCE (a no-op getUserMedia whose track is stopped immediately) and
/// re-enumerate. The Tauri backend auto-grants mic/camera, so no popup appears.
function useMediaDevices(): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    let cancelled = false;
    const enumerate = () =>
      navigator.mediaDevices?.enumerateDevices?.().catch(() => [] as MediaDeviceInfo[]);

    const refresh = async () => {
      let list = (await enumerate()) ?? [];
      // Labels are empty until a getUserMedia grant exists. Warm up ONCE per
      // session if we still have no labels, then re-enumerate.
      const hasLabels = list.some((d) => d.label);
      if (!hasLabels && !mediaPermissionWarmed) {
        mediaPermissionWarmed = true;
        try {
          const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
          stream?.getTracks().forEach((t) => t.stop());
        } catch {
          // Grant failed (e.g. no mic); enumeration still returns device ids
          // with fallback labels.
        }
        list = (await enumerate()) ?? [];
      }
      if (!cancelled) setDevices(list);
    };

    refresh();
    // devicechange fires on navigator.mediaDevices (NOT window — it does not
    // bubble), so listen there or hot-plugged devices never refresh the list.
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, []);
  return devices;
}

// --- Keybinds --------------------------------------------------------------

const KEYBINDS: { action: string; keys: string }[] = [
  { action: "Quick Switcher", keys: "Ctrl+K / Cmd+K" },
  { action: "Send Message", keys: "Enter" },
  { action: "Newline in Message", keys: "Shift+Enter" },
  { action: "Cancel Reply / Edit", keys: "Escape" },
  { action: "Emoji Autocomplete", keys: "Tab" },
];

const KeybindsPane = observer(function KeybindsPane() {
  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Keybinds</h2>
      <div className="settings-keybinds">
        {KEYBINDS.map((k) => (
          <div key={k.action} className="settings-keybind-row">
            <span className="settings-keybind-action">{k.action}</span>
            <kbd className="settings-keybind-keys">{k.keys}</kbd>
          </div>
        ))}
      </div>
      <p className="settings-pane-help muted small">
        Push-to-talk + custom keybinds land with the global shortcut plugin.
      </p>
    </section>
  );
});

// --- Privacy ---------------------------------------------------------------

// --- Plutonium (premium) ---------------------------------------------------

const PREMIUM_TIER_NAMES: Record<number, string> = {
  0: "None",
  1: "Plutonium Basic",
  2: "Plutonium",
  3: "Plutonium Visionary",
};

const PremiumPane = observer(function PremiumPane() {
  const [state, setState] = useState<import("../types").PremiumState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    import("../api")
      .then(({ api }) => api.premiumState())
      .then((s) => alive && setState(s))
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const eff = state?.effective;
  const tier = eff?.premium_type ?? 0;
  const isPremium = !!eff?.is_premium;
  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—";

  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Plutonium</h2>
      {err && <p className="settings-pane-help muted small">Failed to load subscription: {err}</p>}
      {!state && !err && <div className="muted small">Loading…</div>}
      {state && (
        <div className="settings-premium-card">
          <div className="settings-premium-tier">
            {isPremium ? PREMIUM_TIER_NAMES[tier] ?? "Plutonium" : "Free"}
            {eff?.self_hosted && <span className="muted small"> · self-hosted</span>}
          </div>
          {isPremium ? (
            <div className="settings-field-grid">
              <Field label="Since" value={fmtDate(eff?.premium_since)} />
              <Field label="Renews / Expires" value={fmtDate(eff?.premium_until)} />
              <Field
                label="Billing"
                value={eff?.premium_billing_cycle ?? "—"}
              />
              <Field
                label="Status"
                value={eff?.premium_will_cancel ? "Cancels at period end" : "Active"}
              />
            </div>
          ) : (
            <p className="settings-pane-help muted small">
              You don't have an active Plutonium subscription.
            </p>
          )}
        </div>
      )}
      <p className="settings-pane-help muted small">
        Subscriptions are billed through Stripe. Upgrade, change, or cancel your
        plan on{" "}
        <a href="https://fluxer.app/settings/premium" target="_blank" rel="noreferrer" className="settings-link">
          fluxer.app
        </a>
        .
      </p>
    </section>
  );
});

const PrivacyPane = observer(function PrivacyPane() {
  const [allowDms, setAllowDms] = useState("everyone");
  const [friendRequests, setFriendRequests] = useState("everyone");
  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Privacy & Safety</h2>
      <div className="settings-subtitle">Direct Messages</div>
      <p className="settings-pane-help muted small">Allow messages from</p>
      <select className="settings-select" value={allowDms} onChange={(e) => setAllowDms(e.target.value)}>
        <option value="everyone">Everyone</option>
        <option value="friends">Friends</option>
        <option value="none">Nobody</option>
      </select>
      <div className="settings-subtitle" style={{ marginTop: "1rem" }}>Friend Requests</div>
      <p className="settings-pane-help muted small">Who can send you a friend request</p>
      <select className="settings-select" value={friendRequests} onChange={(e) => setFriendRequests(e.target.value)}>
        <option value="everyone">Everyone</option>
        <option value="mutual">Mutual Friends</option>
        <option value="none">Nobody</option>
      </select>

      <div className="settings-subtitle" style={{ marginTop: "1rem" }}>Streamer Mode</div>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={ui.streamerMode}
          onChange={(e) => ui.setStreamerMode(e.target.checked)}
        />
        <span>Hide sensitive info (email, invite codes, MFA secrets) while streaming</span>
      </label>
    </section>
  );
});

// --- Sessions ---------------------------------------------------------------

const SessionsPane = observer(function SessionsPane() {
  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Sessions</h2>
      <p className="settings-pane-help muted small">
        Active sessions on your account. Manage and revoke sessions on{" "}
        <a href="https://fluxer.app/settings/sessions" target="_blank" rel="noreferrer" className="settings-link">fluxer.app</a>.
      </p>
      <div className="settings-session-card">
        <div className="settings-session-info">
          <span className="settings-session-name">This Device</span>
          <span className="settings-session-meta muted small">Fluxer Desktop · Current session</span>
        </div>
        <span className="settings-session-badge">Active</span>
      </div>
    </section>
  );
});

// --- Devices ---------------------------------------------------------------

const DevicesPane = observer(function DevicesPane() {
  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Devices</h2>
      <p className="settings-pane-help muted small">
        Manage devices connected to your account. View and remove devices on{" "}
        <a href="https://fluxer.app/settings/devices" target="_blank" rel="noreferrer" className="settings-link">fluxer.app</a>.
      </p>
    </section>
  );
});

// --- Chat -------------------------------------------------------------------

const ChatPane = observer(function ChatPane() {
  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Chat</h2>
      <div className="settings-subtitle">Message Display</div>
      <ToggleRow label="Compact mode" description="Reduces spacing between messages" />
      <ToggleRow label="Show timestamps" description="Show timestamps on every message" defaultOn />
      <ToggleRow label="Inline attachment media" description="Display images/videos inline when uploaded" defaultOn />
      <div className="settings-subtitle" style={{ marginTop: "1rem" }}>Spoilers</div>
      <p className="settings-pane-help muted small">How spoilers are displayed</p>
      <select className="settings-select" defaultValue="on_click">
        <option value="always">Always reveal</option>
        <option value="on_click">On click</option>
      </select>
    </section>
  );
});

// --- Notifications ----------------------------------------------------------

const NotificationsPane = observer(function NotificationsPane() {
  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Notifications</h2>
      <ToggleRow
        label="Enable Desktop Notifications"
        description="Show desktop notifications for mentions and DMs"
        defaultOn
      />
      <ToggleRow
        label="Notification Sound"
        description="Play a sound when you receive a notification"
        defaultOn
      />
      <div className="settings-subtitle" style={{ marginTop: "1rem" }}>Notification Focus</div>
      <p className="settings-pane-help muted small">When you're focused on Fluxer, deliver notifications for</p>
      <select className="settings-select" defaultValue="mentions">
        <option value="all">All messages</option>
        <option value="mentions">Mentions only</option>
        <option value="none">Nothing</option>
      </select>
    </section>
  );
});

// --- Language ---------------------------------------------------------------

const LanguagePane = observer(function LanguagePane() {
  const lang = settings.settings.locale ?? "en";
  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Language</h2>
      <p className="settings-pane-help muted small">Select your preferred language</p>
      <select
        className="settings-select"
        value={lang}
        onChange={(e) => settings.applyUpdate({ locale: e.target.value })}
      >
        {LOCALES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <p className="settings-pane-help muted small">
        Translations are applied across supported UI surfaces. Untranslated
        strings fall back to English.
      </p>
    </section>
  );
});

// --- Advanced ---------------------------------------------------------------

const AdvancedPane = observer(function AdvancedPane() {
  return (
    <section className="settings-pane-section">
      <h2 className="settings-pane-title">Advanced</h2>
      <div className="settings-subtitle">Developer</div>
      <ToggleRow label="Developer Mode" description="Shows context menu developer tools" />
      <ToggleRow label="Debug Information" description="Show internal debug info in the UI" />
      <div className="settings-subtitle" style={{ marginTop: "1rem" }}>Experimental</div>
      <ToggleRow label="Reduced Motion" description="Minimize animations and transitions" />
      <ToggleRow label="Hardware Acceleration" description="Use GPU rendering" defaultOn />
    </section>
  );
});

// --- Toggle row helper ------------------------------------------------------

function ToggleRow({
  label,
  description,
  defaultOn = false,
  onChange,
}: {
  label: string;
  description?: string;
  defaultOn?: boolean;
  onChange?: (value: boolean) => void;
}) {
  const [on, setOn] = useState(defaultOn);
  const toggle = () => {
    const next = !on;
    setOn(next);
    onChange?.(next);
  };
  return (
    <div className="settings-toggle-row" onClick={toggle} role="button" tabIndex={0}>
      <div className="settings-toggle-text">
        <div className="settings-toggle-label">{label}</div>
        {description && <div className="settings-toggle-desc muted small">{description}</div>}
      </div>
      <span className={`settings-switch ${on ? "on" : ""}`}>
        <span className="settings-switch-thumb" />
      </span>
    </div>
  );
}