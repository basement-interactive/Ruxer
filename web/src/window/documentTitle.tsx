// Document title + taskbar badge — app-shell parity with the reference client's
// `useFluxerDocumentTitle` + `AppNotificationBadge`.
//
// Renders nothing; it's a store-driven side-effect component mounted once inside
// AppLayout (so it only runs while logged in). It keeps two things in sync with
// live observable state:
//
//   1. document.title — "Fluxer | Guild | Channel", with a "(n) " mention prefix
//      or a "• " unread prefix (matches the reference's applyBadgePrefix).
//   2. Native taskbar/dock badge — via Tauri's Window.setBadgeCount (numeric
//      mention count; cleared when there are no mentions). No-op in the browser
//      dev server (no Tauri runtime).
//
// Reference: reference/fluxer/fluxer_app/src/features/window/hooks/
//   useFluxerDocumentTitle.ts + features/app/components/AppNotificationBadge.ts
//
// Deferred vs reference (tracked, not lost):
//   - Incoming friend-request count folded into the badge total (the reference
//     adds INCOMING_REQUEST relationships to mentions). No count getter exists
//     on RelationshipsStore yet — add when that lands.
//   - Favicon badge (favico.js) — pointless in a desktop webview with no tab.
//   - Flash-frame — belongs with the notification trigger side; deferred.

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ui, readState, messages, dmLabel } from "../stores";

const PRODUCT_NAME = "Fluxer";

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function buildBaseTitle(): string {
  const parts: string[] = [];
  const guildName = ui.currentGuild?.name?.trim();
  if (guildName) parts.push(guildName);

  const channel = ui.currentChannel;
  if (channel) {
    // Guild channels carry a .name; DMs don't → fall back to the DM label.
    const channelName = (channel.name ?? dmLabel(channel))?.trim();
    if (channelName) parts.push(channelName);
  }

  return parts.length ? [PRODUCT_NAME, ...parts].join(" | ") : PRODUCT_NAME;
}

function applyBadgePrefix(
  baseTitle: string,
  mentionCount: number,
  hasUnread: boolean,
): string {
  if (mentionCount > 0) return `(${mentionCount}) ${baseTitle}`;
  if (hasUnread) return `• ${baseTitle}`;
  return baseTitle;
}

// Cleared/set on the OS taskbar or dock icon. undefined removes the badge.
function setNativeBadge(count: number | undefined): void {
  if (!inTauri()) return;
  getCurrentWindow()
    .setBadgeCount(count)
    .catch(() => {
      // Platform may not support badges (e.g. some Linux WMs) — ignore.
    });
}

export const DocumentTitleBadge = observer(function DocumentTitleBadge() {
  const mentionCount = readState.totalMentions;
  // Mentions always surface; the plain-unread "•" dot is opt-out via settings.
  const hasUnread = ui.unreadBadgeEnabled && messages.unread.size > 0;
  const baseTitle = buildBaseTitle();

  useEffect(() => {
    document.title = applyBadgePrefix(baseTitle, mentionCount, hasUnread);
  }, [baseTitle, mentionCount, hasUnread]);

  useEffect(() => {
    setNativeBadge(mentionCount > 0 ? mentionCount : undefined);
  }, [mentionCount]);

  // Reset on unmount (logout) so a stale title/badge doesn't linger.
  useEffect(() => {
    return () => {
      document.title = PRODUCT_NAME;
      setNativeBadge(undefined);
    };
  }, []);

  return null;
});
