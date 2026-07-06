// AppLayout: the top-level 3-column Discord/Fluxer layout.
//   [guild rail | channel sidebar | main content (+ optional member list)]
// The composer sits at the bottom of the main content. A self-card (UserArea)
// is pinned to the bottom of the channel sidebar.

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { GuildsRail } from "./GuildsRail";
import { ChannelSidebar } from "./ChannelSidebar";
import { MainContent } from "./MainContent";
import { MemberList } from "./MemberList";
import { PinsPane } from "./PinsPane";
import { ContextMenu } from "../components/ContextMenu";
import { EmojiPicker } from "../components/EmojiPicker";
import { SettingsModal } from "../components/SettingsModal";
import { ToastContainer } from "../components/ToastContainer";
import { QuickSwitcher } from "../components/QuickSwitcher";
import { CreateJoinGuildModal } from "../components/CreateJoinGuildModal";
import { SearchView } from "../components/SearchView";
import { GuildSettingsModal } from "../components/GuildSettingsModal";
import { ImageViewer } from "../components/ImageViewer";
import { ReportModal } from "../components/ReportModal";
import { ForwardModal } from "../components/ForwardModal";
import { MessageReactionsModal } from "../components/MessageReactionsModal";
import { ThemeStudio, initCustomTheme } from "../components/ThemeStudio";
import { UserProfileModal } from "../components/UserProfileModal";
import { ui, messages, guilds, settings, voice, toasts } from "../stores";
import "./AppLayout.css";

export const AppLayout = observer(function AppLayout() {
  // D.15: global Cmd-K / Ctrl-K to open the quick switcher; Ctrl+Shift+F for
  // search (D.16).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ui.toggleQuickSwitcher();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        ui.openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // D.14: apply the saved theme on mount so the Appearance pane's choice
  // persists across app restarts.
  useEffect(() => {
    const theme = settings.settings.theme;
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    // Re-apply persisted streamer mode on mount.
    if (ui.streamerMode) document.documentElement.setAttribute("data-streamer", "");
    // Re-apply the saved custom theme (Theme Studio).
    initCustomTheme();
  }, []);

  // D.22: listen for global-shortcut events (PTT / mute / deafen) and react
  // in the voice store.
  useEffect(() => {
    const unlisten = listen<{ name: string; state: string }>("global-shortcut", (e) => {
      const { name, state } = e.payload;
      if (name === "ptt") {
        // PTT: pressed = mic on, released = mic off (only when in voice).
        if (voice.inVoice) voice.setMicEnabled(state === "pressed").catch(() => {});
      } else if (name === "mute" && state === "pressed") {
        voice.toggleMic().catch(() => {});
      } else if (name === "deafen" && state === "pressed") {
        voice.toggleMic().catch(() => {});
      }
    });
    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  // D.22: listen for deep-link events (`fluxer://invite/<code>`) and open the
  // join modal with the code pre-filled.
  useEffect(() => {
    const unlisten = listen<{ url: string }>("deep-link", (e) => {
      const url = e.payload.url;
      const m = url.match(/invite\/([A-Za-z0-9]+)/);
      if (m) {
        ui.openCreateGuild();
        // The CreateJoinGuildModal opens on the "create" tab; we don't yet
        // pre-fill the join tab, but opening the modal lets the user paste the
        // code. A future enhancement passes the code through.
        toasts.info(`Invite link received: ${m[1]}`);
      }
    });
    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  return (
    <div
      className="app-layout"
      onContextMenu={(e) => {
        // Suppress the native browser context menu app-wide except in text
        // fields where right-click paste/cut/copy is useful. Elements that want
        // a custom menu call e.preventDefault() + openContextMenu themselves.
        const t = e.target as HTMLElement;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
          return;
        }
        e.preventDefault();
      }}
    >
      {(ui.gatewayStatus === "reconnecting" || ui.gatewayStatus === "connecting") && (
        <div className="gateway-banner">
          {ui.gatewayStatus === "reconnecting"
            ? "Connection lost — reconnecting…"
            : "Connecting…"}
        </div>
      )}
      {/* data-flx anchors: stable breadcrumb ids the in-app UI editor targets
          to reorder / resize / hide / recolor layout regions without touching
          component source. Keep these paths stable — saved user layouts key on
          them. */}
      <div className="app-layout-row" data-flx="app.layout-row">
        <GuildsRail />
        <ChannelSidebar />
        <div className="app-main" data-flx="app.main-content">
          <MainContent />
        </div>
        {ui.rightPane === "members" && ui.currentGuild && <MemberList />}
        {ui.rightPane === "pins" && <PinsPane />}
      </div>
      {/* Single profile surface — the full card. (ProfilePopup previously
          double-mounted and overlapped this; keep only the modal.) */}
      <UserProfileModal />
      <ContextMenu />
      <SettingsModal />
      <ToastContainer />
      <QuickSwitcher />
      <CreateJoinGuildModal />
      <SearchView />
      <GuildSettingsModal />
      <ImageViewer />
      <ReportModal />
      <ForwardModal />
      <MessageReactionsModal />
      <ThemeStudio />
      {ui.emojiPickerOpen && ui.reactionTarget && (
        <ReactionEmojiPicker
          channelId={ui.reactionTarget.channelId}
          messageId={ui.reactionTarget.messageId}
        />
      )}
    </div>
  );
});

const ReactionEmojiPicker = observer(function ReactionEmojiPicker({
  channelId,
  messageId,
}: {
  channelId: string;
  messageId: string;
}) {
  return (
    <div className="reaction-picker-overlay" onClick={() => ui.toggleEmojiPicker(false)}>
      <div onClick={(e) => e.stopPropagation()}>
        <EmojiPicker
          onPick={(char) => {
            // Unicode emoji: add reaction directly.
            // Custom emoji: the pick gives `:name:` — we need to find the emoji id.
            if (char.startsWith(":") && char.endsWith(":")) {
              const name = char.slice(1, -1);
              const custom = guilds.allCustomEmoji.find((e) => e.name === name);
              if (custom) {
                messages.toggleReaction(channelId, messageId, char, custom.id, false);
              }
            } else {
              messages.toggleReaction(channelId, messageId, char, undefined, false);
            }
            ui.toggleEmojiPicker(false);
          }}
        />
      </div>
    </div>
  );
});