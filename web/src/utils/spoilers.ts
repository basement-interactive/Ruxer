// Spoiler reveal-state model. Reveal is per mounted component (scrolling a
// message away and back re-hides — matching the reference). A per-message
// sync context lets a revealed ||spoilered url|| also reveal the embed that
// url generated (and vice versa) via canonicalized URL keys.

import { createContext, createElement, useContext, useState } from "react";
import type { Attachment } from "../types";
import { settings } from "../stores";

/// MessageAttachmentFlags.IS_SPOILER.
export const ATTACHMENT_FLAG_IS_SPOILER = 8;

export function isSpoilerAttachment(a: Attachment): boolean {
  return ((a.flags ?? 0) & ATTACHMENT_FLAG_IS_SPOILER) !== 0 || a.spoiler === true;
}

/// RenderSpoilers user setting values.
export const RENDER_SPOILERS = { ALWAYS: 0, ON_CLICK: 1, IF_MODERATOR: 2 } as const;

const SPOILER_SPAN_REGEX = /\|\|([\s\S]*?)\|\|/g;
const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

/// Canonicalize a media URL for spoiler sync: YouTube URLs collapse to
/// "youtube:<videoId>" (watch / shorts / /v/ / /embed/ / youtu.be); everything
/// else is URL.href with a trailing "/" stripped.
export function canonicalizeMediaUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) return `youtube:${id}`;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        if (id) return `youtube:${id}`;
      }
      const m = u.pathname.match(/^\/(?:shorts|v|embed)\/([^/]+)/);
      if (m) return `youtube:${m[1]}`;
    }
    return u.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/// Every canonicalized URL found inside any ||…|| span of `content`.
export function extractSpoileredUrls(content: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!content || !content.includes("||")) return out;
  for (const span of content.matchAll(SPOILER_SPAN_REGEX)) {
    for (const url of span[1].matchAll(URL_REGEX)) {
      const key = canonicalizeMediaUrl(url[0]);
      if (key) out.add(key);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-message sync context
// ---------------------------------------------------------------------------

export interface SpoilerSync {
  /// True when ANY of the keys has been revealed.
  isRevealed(keys: string[]): boolean;
  reveal(keys: string[]): void;
}

const noopSync: SpoilerSync = { isRevealed: () => false, reveal: () => {} };

export const SpoilerSyncContext = createContext<SpoilerSync>(noopSync);

/// Mount once per message, wrapping body + attachments + embeds.
export function SpoilerSyncProvider({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const value: SpoilerSync = {
    isRevealed: (keys) => keys.some((k) => revealed.has(k)),
    reveal: (keys) => {
      if (keys.length === 0) return;
      setRevealed((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.add(k);
        return next;
      });
    },
  };
  return createElement(SpoilerSyncContext.Provider, { value }, children);
}

// ---------------------------------------------------------------------------
// Reveal-state hook
// ---------------------------------------------------------------------------

/// Component-local spoiler state. `hidden` is false when the RenderSpoilers
/// setting auto-reveals, when this instance was clicked, or when a synced key
/// was revealed elsewhere in the message. NOTE: IF_MODERATOR currently
/// behaves like ON_CLICK — the custom UI has no per-channel permission
/// resolver yet (documented deviation).
export function useSpoilerState(
  isSpoiler: boolean,
  syncKeys: string[] = [],
): { hidden: boolean; reveal: () => void } {
  const [revealed, setRevealed] = useState(false);
  const sync = useContext(SpoilerSyncContext);
  const setting = settings.settings.render_spoilers ?? RENDER_SPOILERS.ON_CLICK;
  const autoReveal = setting === RENDER_SPOILERS.ALWAYS;
  const hidden =
    isSpoiler && !autoReveal && !revealed && !(syncKeys.length > 0 && sync.isRevealed(syncKeys));
  return {
    hidden,
    reveal: () => {
      setRevealed(true);
      sync.reveal(syncKeys);
    },
  };
}
