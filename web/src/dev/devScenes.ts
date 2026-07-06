// DEV-ONLY scene seeder for screenshot verification.
//
// Some UI can't be reached from a solo mock session — most notably the in-call
// voice surface, which needs a connected room with participants. This module
// reads `?devscene=<name>` and drives the MobX stores into that state so the UI
// can be screenshotted headless. It only touches store state that real events
// would set anyway; it never fakes network. Stripped from production builds via
// `import.meta.env.DEV` (dead-code eliminated by Vite) and it also refuses to
// run when a real Tauri backend is present.

import { runInAction } from "mobx";
import { ui, voice, guilds } from "../stores";
import type { VoiceParticipant } from "../voice/LiveKitRoom";

const MOCK_GUILD = "100";
const MOCK_VOICE_CHANNEL = "211"; // "General Voice" in mockTauri

function inRealTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window &&
    !(window as unknown as { __MOCK_TAURI__?: boolean }).__MOCK_TAURI__;
}

export function applyDevScene(): void {
  if (!import.meta.env.DEV || inRealTauri()) return;
  const scene = new URLSearchParams(location.search).get("devscene");
  // Suppress the first-launch onboarding overlay so it doesn't cover other
  // scenes (the onboarding scene forces it explicitly).
  if (scene && scene !== "onboarding") {
    try {
      localStorage.setItem("ui.onboarded", "1");
    } catch {
      /* ignore */
    }
  }
  if (scene === "voice") seedVoiceCall(false);
  else if (scene === "voice-stats") {
    seedVoiceCall(false);
    // Poll-click the stats toggle until the panel is actually open (headless
    // timing is flaky, so retry until `.voice-stats` renders).
    let tries = 0;
    const openStats = () => {
      if (document.querySelector(".voice-stats")) return;
      document.querySelector<HTMLElement>('[title="Stats for nerds"]')?.click();
      if (tries++ < 30) setTimeout(openStats, 200);
    };
    setTimeout(openStats, 900);
  }
  else if (scene === "voice-screen") seedVoiceCall(true);
  else if (scene === "voice-focus") {
    seedVoiceCall(false);
    setTimeout(() => runInAction(() => ui.toggleCallExpanded(true)), 1200);
  }
  else if (scene === "settings") setTimeout(() => runInAction(() => ui.openSettings()), 700);
  else if (scene === "settings-account") { setTimeout(() => runInAction(() => ui.openSettings("account")), 700); setTimeout(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent==="Edit"); b && b.click(); }, 1300); }
  else if (scene === "settings-profile") setTimeout(() => runInAction(() => ui.openSettings("profile")), 700);
  else if (scene === "settings-chat") setTimeout(() => runInAction(() => ui.openSettings("chat")), 700);
  else if (scene === "settings-privacy") setTimeout(() => runInAction(() => ui.openSettings("privacy")), 700);
  else if (scene === "settings-notifications") setTimeout(() => runInAction(() => ui.openSettings("notifications")), 700);
  else if (scene === "settings-devices") setTimeout(() => runInAction(() => ui.openSettings("devices")), 700);
  else if (scene === "settings-sessions") setTimeout(() => runInAction(() => ui.openSettings("sessions")), 700);
  else if (scene === "settings-advanced") setTimeout(() => runInAction(() => ui.openSettings("advanced")), 700);
  else if (scene === "guild-transfer") { seedTextChannel(); setTimeout(() => runInAction(() => ui.openGuildSettings("100", "overview")), 1400); setTimeout(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent==="Transfer Ownership"); b && b.click(); }, 2200); }
  else if (scene === "guild-overview") { seedTextChannel(); setTimeout(() => runInAction(() => ui.openGuildSettings("100", "overview")), 1400); }
  else if (scene === "guild-invites") { seedTextChannel(); setTimeout(() => runInAction(() => ui.openGuildSettings("100", "invites")), 1400); }
  else if (scene === "guild-roles") { seedTextChannel(); setTimeout(() => runInAction(() => ui.openGuildSettings("100", "roles")), 1400); }
  else if (scene === "guild-members") {
    seedTextChannel();
    setTimeout(() => runInAction(() => ui.openGuildSettings("100", "members")), 1400);
    // Type a query into the member search to exercise server-side search
    // (surfaces "moderator"/"modbot" which are NOT in the local member list).
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(".gs-input");
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "mod");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, 2200);
  }
  else if (scene === "guild-audit") { seedTextChannel(); setTimeout(() => runInAction(() => ui.openGuildSettings("100", "audit")), 1400); }
  else if (scene === "guild-webhooks") { seedTextChannel(); setTimeout(() => runInAction(() => ui.openGuildSettings("100", "webhooks")), 1400); }
  else if (scene === "ban") { seedTextChannel(); setTimeout(() => runInAction(() => ui.openBanModal("100", "2")), 1400); }
  else if (scene === "incoming-call") setTimeout(() => runInAction(() => voice.applyVoiceStateUpdate({ user_id: "2", channel_id: "300", session_id: "call1" })), 900);
  else if (scene === "onboarding") setTimeout(() => runInAction(() => ui.openOnboarding(true)), 700);
  else if (scene === "profile") { seedTextChannel(); setTimeout(() => runInAction(() => ui.openProfile("2", { x: 400, y: 200 })), 900); }
  else if (scene === "channel-settings") { seedTextChannel(); setTimeout(() => runInAction(() => ui.openChannelSettings("201")), 900); }
  else if (scene === "channel") seedTextChannel();
}

// Open the mock guild's #general text channel so the message stream renders.
function seedTextChannel(): void {
  let tries = 0;
  const tick = () => {
    tries++;
    const gi = guilds.guilds.findIndex((g) => g.id === MOCK_GUILD);
    if (gi >= 0) ui.selectGuild(gi);
    const chans = guilds.channelsByGuild.get(MOCK_GUILD);
    if (gi >= 0 && chans && chans.length > 0) {
      runInAction(() => ui.openChannel("201")); // #general (mock has messages)
      return;
    }
    if (tries < 50) setTimeout(tick, 150);
  };
  setTimeout(tick, 300);
}

function participant(
  userId: string,
  name: string,
  opts: Partial<VoiceParticipant> = {},
): VoiceParticipant {
  return {
    identity: `user_${userId}_dev`,
    userId,
    name,
    isLocal: false,
    micEnabled: true,
    cameraEnabled: false,
    screenShareEnabled: false,
    speaking: false,
    deafened: false,
    volume: 1,
    connectionQuality: "excellent",
    ...opts,
  };
}

function seedVoiceCall(withScreenShare: boolean): void {
  let tries = 0;
  const finalize = () => {
    runInAction(() => {
      const gi = guilds.guilds.findIndex((g) => g.id === MOCK_GUILD);
      if (gi >= 0) ui.selectGuild(gi);
      ui.openChannel(MOCK_VOICE_CHANNEL);
      voice.pendingGuildId = MOCK_GUILD;
      voice.pendingChannelId = MOCK_VOICE_CHANNEL;
      voice.connectionState = "connected";
      voice.participants = [
        participant("1", "You (dev)", { isLocal: true, speaking: true }),
        participant("2", "Ada", {
          micEnabled: false,
          connectionQuality: "good",
          screenShareEnabled: withScreenShare,
        }),
        participant("3", "Linus", { deafened: true, connectionQuality: "poor" }),
      ];
    });
  };

  // Poll until the mock login has populated guilds + channels, then drive in.
  const tick = () => {
    tries++;
    const gi = guilds.guilds.findIndex((g) => g.id === MOCK_GUILD);
    if (gi >= 0) ui.selectGuild(gi); // triggers channel load (mock returns them)
    const chans = guilds.channelsByGuild.get(MOCK_GUILD);
    if (gi >= 0 && chans && chans.length > 0) {
      finalize();
      return;
    }
    if (tries < 50) setTimeout(tick, 150);
  };
  setTimeout(tick, 300);
}
