// Composer: the message input at the bottom. Features:
//   - + button that opens a native file dialog (attachments)
//   - emoji picker button that opens the emoji picker panel
//   - typing indicator above the input
//   - send on Enter, edit mode support, Cancel button when editing
//   - `:shortcode:` autocomplete popup while typing

import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { messages, ui, guilds, dms, relationships, session, resolveUserName, drafts } from "../stores";
import type { Emoji, Snowflake, User } from "../types";
import { EmojiPicker } from "./EmojiPicker";
import { GifPicker } from "./GifPicker";
import { Avatar } from "./Avatar";
import { searchShortcodes } from "../emoji-data";
import { resolveShortcodesInText } from "../utils/emojiResolve";
import { emojiUrl } from "../utils";
import { useAssetUrl } from "../utils/mediaCache";
import "./Composer.css";

export const Composer = observer(function Composer({
  channelId,
}: {
  channelId: Snowflake;
}) {
  const [text, setText] = useState(() => drafts.get(channelId));
  const [attachments, setAttachments] = useState<{ path: string; spoiler: boolean }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);

  // Per-channel drafts: restore the saved draft when the channel changes, and
  // persist the current text as we type so switching channels never loses it.
  useEffect(() => {
    setText(drafts.get(channelId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);
  useEffect(() => {
    // Don't persist while editing an existing message (that text isn't a draft).
    if (!ui.editingMessageId) drafts.set(channelId, text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, channelId]);

  // Slowmode countdown: tracks the remaining seconds before the user can send.
  const channel = ui.currentChannel;
  const slowmode = channel?.rate_limit_per_user ?? 0;
  const [slowmodeRemaining, setSlowmodeRemaining] = useState(0);
  useEffect(() => {
    if (slowmodeRemaining <= 0) return;
    const timer = setTimeout(() => setSlowmodeRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [slowmodeRemaining]);

  // Editing is now handled INLINE in the message row (EditingMessageInput),
  // not by hijacking this composer — reference-parity. The composer stays a
  // pure new-message input.

  // Reply target: when set, the composer shows a preview above the input and
  // sends with message_reference. Cleared on send or Escape.
  const replyTarget = ui.replyTarget;
  useEffect(() => {
    if (replyTarget) inputRef.current?.focus();
  }, [replyTarget]);

  // Typing indicator.
  const typingUsers = messages.typingUsers(channelId, resolveUserName);
  const typingLabel =
    typingUsers.length === 1
      ? `${typingUsers[0]} is typing…`
      : typingUsers.length === 2
      ? `${typingUsers[0]} and ${typingUsers[1]} are typing…`
      : typingUsers.length >= 3
      ? "Several people are typing…"
      : "";

  // `:shortcode` autocomplete. Merge unicode shortcodes with custom guild
  // emoji so both show up while typing.
  const emojiQuery = detectEmojiQuery(text);
  const emojiMatches: EmojiCandidate[] = emojiQuery ? buildEmojiCandidates(emojiQuery, 8) : [];
  const [emojiSel, setEmojiSel] = useState(0);
  useEffect(() => setEmojiSel(0), [emojiQuery]);

  // @mention autocomplete — detect `@query` at the end of the text.
  const mentionQuery = detectMentionQuery(text);
  const mentionMatches: MentionCandidate[] = mentionQuery !== null ? buildMentionCandidates(mentionQuery, 8) : [];
  const [mentionSel, setMentionSel] = useState(0);
  useEffect(() => setMentionSel(0), [mentionQuery]);

  // #channel autocomplete — detect `#query` at the end of the text.
  const channelQuery = detectChannelQuery(text);
  const channelMatches: ChannelCandidate[] = channelQuery !== null ? buildChannelCandidates(channelQuery, 8) : [];
  const [channelSel, setChannelSel] = useState(0);
  useEffect(() => setChannelSel(0), [channelQuery]);

  // Combined autocomplete state — only one popup shows at a time.
  const acType: "emoji" | "mention" | "channel" | null = emojiMatches.length > 0
    ? "emoji"
    : mentionMatches.length > 0
    ? "mention"
    : channelMatches.length > 0
    ? "channel"
    : null;
  const acCount = acType === "emoji" ? emojiMatches.length : acType === "mention" ? mentionMatches.length : acType === "channel" ? channelMatches.length : 0;

  const send = async () => {
    // Resolve `:name:` tokens before sending so messages are stored in a form
    // every client can render (`<:name:id>` for custom, the unicode char for
    // known shortcodes). Unknown tokens are left intact.
    const resolved = resolveShortcodesInText(text.trim(), guilds.allCustomEmoji);
    const content = resolved;
    if (!content && attachments.length === 0) return;
    const replyTo = ui.replyTarget?.messageId;
    // B.6: send text + attachments in one multipart request. The Tauri backend
    // reads each file's bytes and builds the multipart body; we just pass the
    // paths plus the per-file spoiler mark (sent as attachment flags bit 8).
    const inputs = attachments.map((a) => ({ path: a.path, spoiler: a.spoiler }));
    await messages.send(channelId, content, replyTo, inputs);
    ui.clearReplyTarget();
    setAttachments([]);
    setText("");
    // Start the slowmode countdown if the channel has a rate limit.
    if (slowmode > 0) setSlowmodeRemaining(slowmode);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (acCount > 0) {
      const sel = acType === "emoji" ? emojiSel : acType === "mention" ? mentionSel : channelSel;
      const setSel = acType === "emoji" ? setEmojiSel : acType === "mention" ? setMentionSel : setChannelSel;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(acCount - 1, s + 1));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && sel < acCount)) {
        e.preventDefault();
        if (acType === "emoji") insertCandidate(emojiMatches[emojiSel]);
        else if (acType === "mention") insertMention(mentionMatches[mentionSel]);
        else if (acType === "channel") insertChannelRef(channelMatches[channelSel]);
        return;
      }
      if (e.key === "Escape") {
        if (acType === "emoji") setText((t) => t.replace(/:[\w-]*$/, ""));
        else if (acType === "mention") setText((t) => t.replace(/@[\w-]*$/, ""));
        else if (acType === "channel") setText((t) => t.replace(/#[\w-]*$/, ""));
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if (e.key === "Escape" && ui.replyTarget) {
      ui.clearReplyTarget();
      return;
    }
    if (e.key === "Escape" && ui.replyTarget) {
      ui.clearReplyTarget();
      return;
    }
  };

  /// Insert a picked autocomplete candidate, replacing the trailing `:query`.
  /// Unicode candidates insert the literal char; custom candidates insert
  /// `<:name:id>` so the message renders on every client.
  const insertCandidate = (c: EmojiCandidate) => {
    const insertion =
      c.kind === "unicode" ? c.char : c.animated
        ? `<a:${c.name}:${c.id}>`
        : `<:${c.name}:${c.id}>`;
    setText((t) => t.replace(/:[\w-]*$/, insertion));
  };

  /// Insert a mention, replacing the trailing `@query`.
  const insertMention = (m: MentionCandidate) => {
    const insertion = `<@${m.id}>`;
    setText((t) => t.replace(/@[\w-]*$/, insertion));
  };

  /// Insert a channel reference, replacing the trailing `#query`.
  const insertChannelRef = (c: ChannelCandidate) => {
    const insertion = `<#${c.id}>`;
    setText((t) => t.replace(/#[\w-]*$/, insertion));
  };

  // Throttled typing broadcast.
  const lastTyping = useRef(0);
  const onInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const now = Date.now();
    if (e.target.value.trim() && now - lastTyping.current > 4000) {
      lastTyping.current = now;
      api.triggerTyping(channelId).catch(() => {});
    }
  };

  // The + attachment button: opens a native file dialog (Tauri plugin).
  const pickAttachment = async () => {
    try {
      const selected = await open({
        multiple: true,
        title: "Upload files",
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        // Files named SPOILER_* arrive pre-marked (parity with the official
        // client's upload path).
        setAttachments((a) => [
          ...a,
          ...paths.map((path) => ({
            path,
            spoiler: (path.split(/[\\/]/).pop() ?? "").startsWith("SPOILER_"),
          })),
        ]);
      }
    } catch (e) {
      console.error("file dialog failed", e);
    }
  };

  return (
    <div className="composer">
      {typingLabel && <div className="composer-typing muted small">{typingLabel}</div>}
      {slowmodeRemaining > 0 && (
        <div className="composer-slowmode muted small">
          <SlowmodeIcon /> {slowmodeRemaining}s slowmode
        </div>
      )}

      {/* Emoji autocomplete popup */}
      {emojiMatches.length > 0 && (
        <div className="emoji-autocomplete">
          {emojiMatches.map((c, i) => (
            <button
              key={c.key}
              className={`emoji-ac-row ${i === emojiSel ? "selected" : ""}`}
              onClick={() => insertCandidate(c)}
              onMouseEnter={() => setEmojiSel(i)}
            >
              {c.kind === "unicode" ? (
                <span className="emoji-ac-char">{c.char}</span>
              ) : (
                <CustomEmojiThumb emoji={c.emoji} />
              )}
              <span className="emoji-ac-code">:{c.name}:</span>
              {c.kind === "custom" && c.guildName && (
                <span className="emoji-ac-guild muted small">{c.guildName}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* @mention autocomplete popup */}
      {mentionMatches.length > 0 && (
        <div className="emoji-autocomplete">
          {mentionMatches.map((m, i) => (
            <button
              key={m.id}
              className={`emoji-ac-row ${i === mentionSel ? "selected" : ""}`}
              onClick={() => insertMention(m)}
              onMouseEnter={() => setMentionSel(i)}
            >
              <Avatar user={m.user} size={20} showStatus={false} />
              <span className="emoji-ac-code">{m.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* #channel autocomplete popup */}
      {channelMatches.length > 0 && (
        <div className="emoji-autocomplete">
          {channelMatches.map((c, i) => (
            <button
              key={c.id}
              className={`emoji-ac-row ${i === channelSel ? "selected" : ""}`}
              onClick={() => insertChannelRef(c)}
              onMouseEnter={() => setChannelSel(i)}
            >
              <span className="emoji-ac-char">#</span>
              <span className="emoji-ac-code">{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div className="composer-attachments">
          {attachments.map((a, i) => (
            <div key={i} className={"attachment-chip" + (a.spoiler ? " spoiler" : "")}>
              {a.spoiler && <span className="attachment-spoiler-tag">SPOILER</span>}
              <span className="nowrap">{a.path.split(/[\\/]/).pop()}</span>
              <button
                className="attachment-spoiler-toggle"
                title={a.spoiler ? "Remove spoiler" : "Spoiler attachment"}
                onClick={() =>
                  setAttachments((list) =>
                    list.map((x, j) => (j === i ? { ...x, spoiler: !x.spoiler } : x)),
                  )
                }
              >
                {a.spoiler ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
              <button
                className="attachment-remove"
                onClick={() => setAttachments((list) => list.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Reply preview */}
      {replyTarget && (
        <div className="composer-reply">
          <span className="composer-reply-label">
            Replying to <span className="composer-reply-name">{replyTarget.authorName}</span>
          </span>
          <button className="composer-reply-cancel" title="Cancel reply" onClick={() => ui.clearReplyTarget()}>
            ✕
          </button>
        </div>
      )}

      <div className="composer-bar">
        <button
          className="composer-attach"
          onClick={pickAttachment}
          title="Upload a file"
        >
          <PlusIcon />
        </button>
        <div className="composer-input-wrap">
          <textarea
            ref={inputRef}
            className="composer-input"
            rows={1}
            value={text}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder={`Message ${channelLabel()}`}
          />
        </div>
        <div className="composer-actions">
          <button
            className="composer-emoji-btn"
            onClick={() => { setGifPickerOpen((v) => !v); ui.toggleEmojiPicker(false); }}
            title="GIF picker"
          >
            <GifIcon />
          </button>
          <button
            className="composer-emoji-btn"
            onClick={() => { ui.toggleEmojiPicker(); setGifPickerOpen(false); }}
            title="Emoji picker"
          >
            <EmojiIcon />
          </button>
        </div>
      </div>

      {ui.emojiPickerOpen && !ui.reactionTarget && <EmojiPicker onPick={(picked) => {
        // `picked` is either a unicode char (from the unicode section) or a
        // `:name:` shortcode string (from the custom section). Resolve custom
        // shortcodes to `<:name:id>` so they render on every client; unicode
        // is inserted as the literal char.
        const custom = guilds.allCustomEmoji;
        const resolved = resolveShortcodesInText(picked, custom);
        setText((t) => t + resolved);
        inputRef.current?.focus();
      }} />}

      {/* GIF picker panel */}
      {gifPickerOpen && (
        <GifPicker onPick={(gif) => {
          // Send the GIF as a message with the GIF URL as content.
          // The real client sends the GIF URL which the server embeds.
          messages.send(channelId, gif.url, undefined, []).catch(() => {});
          setGifPickerOpen(false);
          inputRef.current?.focus();
        }} />
      )}
    </div>
  );

  function channelLabel(): string {
    const ch = ui.currentChannel;
    if (!ch) return "";
    if (ch.name) return `#${ch.name}`;
    return (ch.recipients[0]?.global_name ?? ch.recipients[0]?.username) ?? "channel";
  }
});

function detectEmojiQuery(text: string): string | null {
  const colon = text.lastIndexOf(":");
  if (colon < 0) return null;
  const after = text.slice(colon + 1);
  const atStart = colon === 0;
  const precededBySpace = colon > 0 && /\s/.test(text[colon - 1]);
  if (!atStart && !precededBySpace) return null;
  if (after === "") return "";
  if (/^[\w-]+$/.test(after)) return after;
  return null;
}

/// A single autocomplete candidate. `unicode` candidates carry the literal
/// glyph to insert; `custom` candidates carry the emoji id so we can build
/// `<:name:id>` on insert + render a thumbnail in the popup.
type EmojiCandidate =
  | { key: string; kind: "unicode"; name: string; char: string }
  | { kind: "custom"; name: string; id: Snowflake; animated: boolean; emoji: Emoji; guildName?: string; key: string };

/// Build a merged autocomplete list (unicode + custom guild emoji) filtered by
/// the current query, capped at `limit`. Custom emoji that collide with a
/// unicode shortcode are deduped by name (custom wins, matching Discord).
function buildEmojiCandidates(query: string, limit: number): EmojiCandidate[] {
  const out: EmojiCandidate[] = [];
  const seen = new Set<string>();
  // Custom guild emoji first (custom wins on name collisions).
  const custom = guilds.allCustomEmoji;
  const lower = query.toLowerCase();
  for (const e of custom) {
    if (out.length >= limit) break;
    if (!e.name.toLowerCase().startsWith(lower)) continue;
    out.push({
      kind: "custom",
      name: e.name,
      id: e.id,
      animated: !!e.animated,
      emoji: e,
      guildName: e.guildName,
      key: `c:${e.id}`,
    });
    seen.add(e.name.toLowerCase());
  }
  // Then unicode shortcodes, skipping any name already covered by a custom one.
  for (const [code, char] of searchShortcodes(query, limit)) {
    if (out.length >= limit) break;
    if (seen.has(code.toLowerCase())) continue;
    out.push({ key: `u:${code}`, kind: "unicode", name: code, char });
    seen.add(code.toLowerCase());
  }
  return out;
}

/// Small thumbnail for a custom emoji in the autocomplete popup.
function CustomEmojiThumb({ emoji }: { emoji: Emoji }) {
  const url = emojiUrl(emoji.id, !!emoji.animated);
  const src = useAssetUrl(url);
  if (!src) return <span className="emoji-ac-char">:{emoji.name}:</span>;
  return <img className="emoji-ac-char" src={src} width={20} height={20} alt={emoji.name} draggable={false} />;
}

// ---------------------------------------------------------------------------
// @mention autocomplete
// ---------------------------------------------------------------------------

/// Detect a `@query` at the end of the text. Returns the query string (without
/// the `@`), or `null` when not typing a mention. Mirrors the real client's
/// detection: `@` must be at pos 0 or preceded by whitespace.
function detectMentionQuery(text: string): string | null {
  const at = text.lastIndexOf("@");
  if (at < 0) return null;
  const after = text.slice(at + 1);
  const atStart = at === 0;
  const precededBySpace = at > 0 && /\s/.test(text[at - 1]);
  if (!atStart && !precededBySpace) return null;
  if (after === "") return "";
  if (/^[\w-]+$/.test(after)) return after;
  return null;
}

type MentionCandidate = { id: Snowflake; name: string; user: User };

/// Build a list of mention candidates (guild members, DM recipients,
/// relationships) filtered by name, capped at `limit`.
function buildMentionCandidates(query: string, limit: number): MentionCandidate[] {
  const out: MentionCandidate[] = [];
  const seen = new Set<string>();
  const lower = query.toLowerCase();
  const add = (u: User) => {
    if (out.length >= limit) return;
    if (seen.has(u.id)) return;
    const name = (u.global_name ?? u.username ?? "").toLowerCase();
    if (query && !name.startsWith(lower)) return;
    seen.add(u.id);
    out.push({ id: u.id, name: u.global_name ?? u.username ?? u.id, user: u });
  };
  // Guild members of the current guild.
  if (ui.currentGuild) {
    const members = guilds.membersByGuild.get(ui.currentGuild.id) ?? [];
    for (const m of members) add(m.user);
  }
  // DM recipients.
  for (const c of dms.channels) {
    for (const u of c.recipients) add(u);
  }
  // Relationships (friends).
  for (const r of relationships.relationships) add(r.user);
  // Current user.
  if (session.me) add(session.me);
  // @everyone / @here special mentions.
  if (!query || "everyone".startsWith(lower)) {
    out.push({ id: "everyone", name: "@everyone", user: { id: "everyone", username: "", discriminator: "0" } });
  }
  if (!query || "here".startsWith(lower)) {
    out.push({ id: "here", name: "@here", user: { id: "here", username: "", discriminator: "0" } });
  }
  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// #channel autocomplete
// ---------------------------------------------------------------------------

/// Detect a `#query` at the end of the text. Returns the query string (without
/// the `#`), or `null` when not typing a channel reference.
function detectChannelQuery(text: string): string | null {
  const hash = text.lastIndexOf("#");
  if (hash < 0) return null;
  const after = text.slice(hash + 1);
  const atStart = hash === 0;
  const precededBySpace = hash > 0 && /\s/.test(text[hash - 1]);
  if (!atStart && !precededBySpace) return null;
  if (after === "") return "";
  if (/^[\w-]+$/.test(after)) return after;
  return null;
}

type ChannelCandidate = { id: Snowflake; name: string };

/// Build a list of channel candidates (channels in the current guild) filtered
/// by name, capped at `limit`.
function buildChannelCandidates(query: string, limit: number): ChannelCandidate[] {
  const out: ChannelCandidate[] = [];
  const lower = query.toLowerCase();
  // Guild channels.
  if (ui.currentGuild) {
    const channels = guilds.channelsByGuild.get(ui.currentGuild.id) ?? [];
    for (const c of channels) {
      if (out.length >= limit) break;
      if (!c.name) continue;
      if (query && !c.name.toLowerCase().startsWith(lower)) continue;
      out.push({ id: c.id, name: c.name });
    }
  }
  // DM channels.
  for (const c of dms.channels) {
    if (out.length >= limit) break;
    const name = c.name ?? c.recipients[0]?.global_name ?? c.recipients[0]?.username;
    if (!name) continue;
    if (query && !name.toLowerCase().startsWith(lower)) continue;
    out.push({ id: c.id, name });
  }
  return out;
}

function EmojiIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8.5 11a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-7.5 3.5c.83 1.2 2.23 2 4 2s3.17-.8 4-2c.28-.4.04-.93-.42-1.05A8.5 8.5 0 0 0 12 15a8.5 8.5 0 0 0-3.58-.55c-.46.12-.7.65-.42 1.05z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1" />
      <path d="M6.1 6.6A17 17 0 0 0 2 12s3.5 7 10 7c1.5 0 2.9-.35 4.1-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

function SlowmodeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: "0.25rem" }}>
      <circle cx="12" cy="13" r="8" />
      <polyline points="12 9 12 13 15 15" />
      <path d="M5 3 2 6" />
      <path d="m22 6-3-3" />
    </svg>
  );
}

function GifIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <text x="7" y="16" fontSize="8" fill="currentColor" stroke="none" fontFamily="monospace" fontWeight="bold">GIF</text>
    </svg>
  );
}

// We import the API lazily to avoid a circular reference with the stores module.
import { api } from "../api";