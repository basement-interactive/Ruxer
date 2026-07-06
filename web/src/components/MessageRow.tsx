// MessageRow: renders a single message. Grouped rows skip the avatar/header
// and indent. Hovering shows a toolbar with quick reactions, reply, edit, delete,
// pin, copy. System messages render as a muted line.

import { observer } from "mobx-react-lite";
import { useState, useEffect } from "react";
import { messages, session, ui, relationships, guilds, dms, dmLabel } from "../stores";
import type { ContextMenuItem } from "../stores";
import type { Message, MessageSnapshot } from "../types";
import { Avatar } from "./Avatar";
import { ContentRenderer } from "./ContentRenderer";
import { EditingMessageInput } from "./EditingMessageInput";
import { EmbedList } from "./EmbedList";
import { AudioPlayer } from "./AudioPlayer";
import { formatTimestamp } from "../utils";
import { useAssetUrl } from "../utils/mediaCache";
import { api } from "../api";
import "./MessageRow.css";

export const MessageRow = observer(function MessageRow({
  message,
  groupable,
}: {
  message: Message;
  groupable: boolean;
}) {
  if (isSystemMessage(message.type)) {
    return <SystemMessageRow message={message} />;
  }

  const isMe = session.meId === message.author.id;
  const authorName = message.author.global_name ?? message.author.username;
  const time = formatTimestamp(message.timestamp);
  const [hover, setHover] = useState(false);

  // Optimistic-send state: dim while sending, show a retry footer on failure.
  const sending = message._state === "sending";
  const failed = message._state === "failed";
  // Inline edit: when this message is being edited, its body is replaced by an
  // in-place textarea (reference-parity — not the bottom composer).
  const editing = ui.editingMessageId === message.id;

  return (
    <div
      className={
        "message-row" + (sending ? " message-sending" : "") + (failed ? " message-failed" : "")
      }
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        // No context menu on unsent (pending/failed) messages.
        if (sending || failed) return;
        openContextMenu(message, e.clientX, e.clientY);
      }}
    >
      {/* Hover toolbar — hidden on unsent (pending/failed) messages. */}
      {hover && !sending && !failed && (
        <div className="message-toolbar">
          <ToolbarBtn title="Add Reaction" onClick={() => ui.openReactionPicker(message.channel_id, message.id)}>
            <EmojiIcon />
          </ToolbarBtn>
          <ToolbarBtn title="Reply" onClick={() => setReplyTarget(message)}>
            <ReplyIcon />
          </ToolbarBtn>
          <ToolbarBtn title="Forward" onClick={() => ui.openForward(message)}>
            <ForwardIcon size={20} />
          </ToolbarBtn>
          {isMe && isEditable(message) && (
            <ToolbarBtn title="Edit" onClick={() => startEdit(message)}>
              <EditIcon />
            </ToolbarBtn>
          )}
          <ToolbarBtn title="More" onClick={(e) => openContextMenu(message, e.clientX, e.clientY)}>
            <MoreIcon />
          </ToolbarBtn>
        </div>
      )}

      <div className="message-row-content">
        {groupable ? (
          <div className="message-grouped">
            <span className="message-hover-time">{time}</span>
            <div className="message-body">
              {editing ? (
                <EditingMessageInput message={message} />
              ) : (
                <ContentRenderer content={message.content} messageId={message.id} />
              )}
            </div>
          </div>
        ) : (
          <div className="message-first">
            <button
              className="message-avatar"
              onClick={(e) => ui.openProfile(message.author.id, { x: e.clientX, y: e.clientY }, ui.currentGuild?.id)}
            >
              <Avatar user={message.author} size={40} />
            </button>
            <div className="message-body-wrap">
              <div className="message-header">
                <button
                  className="message-author"
                  style={{ color: authorColor(message.author) }}
                  onClick={(e) => ui.openProfile(message.author.id, { x: e.clientX, y: e.clientY }, ui.currentGuild?.id)}
                >
                  {authorName}
                </button>
                {message.author.bot && <span className="bot-badge">BOT</span>}
                <span className="message-time">{time}</span>
                {message.edited_timestamp && (
                  <span className="message-edited muted small">(edited)</span>
                )}
              </div>
              <div className="message-body">
                {editing ? (
                  <EditingMessageInput message={message} />
                ) : (
                  <ContentRenderer content={message.content} messageId={message.id} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Attachments */}
      {message.attachments.length > 0 && (
        <AttachmentList attachments={message.attachments} />
      )}

      {/* Embeds (link previews / rich embeds / video) */}
      {message.embeds && message.embeds.length > 0 && (
        <EmbedList embeds={message.embeds} />
      )}

      {/* Forwarded message snapshots */}
      {message.message_snapshots && message.message_snapshots.length > 0 && (
        <ForwardedList message={message} snapshots={message.message_snapshots} />
      )}

      {/* Reply reference indicator */}
      {message.message_reference && !groupable && (
        <ReplyRef messageId={message.message_reference.message_id} channelId={message.channel_id} />
      )}

      {/* Reactions */}
      {message.reactions.length > 0 && (
        <div className="message-reactions">
          {message.reactions.map((r) => (
            <ReactionChip
              key={(r.emoji.id ?? "") + r.emoji.name}
              message={message}
              emoji={r.emoji.name}
              customEmojiId={r.emoji.id ?? undefined}
              count={r.count}
              mine={r.me ?? false}
            />
          ))}
          <button
            className="reaction-add"
            onClick={() => ui.openReactionPicker(message.channel_id, message.id)}
            title="Add Reaction"
          >
            <EmojiIcon />
          </button>
        </div>
      )}

      {/* Failed-send footer: retry or delete the unsent message. */}
      {failed && (
        <div className="message-failed-footer">
          <span>Failed to send message.</span>
          <button
            className="message-failed-retry"
            onClick={() => message.nonce && messages.retry(message.channel_id, message.nonce)}
          >
            Retry
          </button>
          <button
            className="message-failed-delete"
            onClick={() =>
              message.nonce && messages.dropPending(message.channel_id, message.nonce)
            }
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
});

const ReactionChip = observer(function ReactionChip({
  message,
  emoji,
  customEmojiId,
  count,
  mine,
}: {
  message: Message;
  emoji: string;
  customEmojiId?: Snowflake;
  count: number;
  mine: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [users, setUsers] = useState<string[] | null>(null);

  // Lazily fetch the reactors the first time the chip is hovered.
  useEffect(() => {
    if (!hover || users !== null) return;
    let cancelled = false;
    api
      .reactionUsers(message.channel_id, message.id, emoji, customEmojiId, 8)
      .then((list) => {
        if (!cancelled) setUsers(list.map((u) => u.global_name ?? u.username));
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [hover, users, message.channel_id, message.id, emoji, customEmojiId]);

  return (
    <button
      className={`reaction-chip ${mine ? "mine" : ""}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() =>
        messages.toggleReaction(message.channel_id, message.id, emoji, customEmojiId, mine)
      }
    >
      <EmojiDisplay emoji={emoji} customId={customEmojiId} animated={false} size={16} />
      <span>{count}</span>
      {hover && (
        <span className="reaction-tooltip">
          {users === null
            ? "…"
            : users.length === 0
              ? "No one yet"
              : reactorSummary(users, count)}
        </span>
      )}
    </button>
  );
});

/// Human-readable "A, B and 3 others reacted" summary for the tooltip.
function reactorSummary(names: string[], total: number): string {
  const shown = names.slice(0, 3);
  const remaining = total - shown.length;
  let who: string;
  if (shown.length === 1) who = shown[0];
  else if (remaining <= 0 && shown.length === 2) who = `${shown[0]} and ${shown[1]}`;
  else who = shown.join(", ");
  if (remaining > 0) who += ` and ${remaining} other${remaining === 1 ? "" : "s"}`;
  return `${who} reacted`;
}

// A small inline emoji display (unicode char or custom emoji image).
function EmojiDisplay({
  emoji,
  customId,
  animated,
  size,
}: {
  emoji: string;
  customId?: Snowflake;
  animated?: boolean;
  size: number;
}) {
  const url = customId ? emojiUrl(customId, !!animated) : null;
  const src = useAssetUrl(url);
  if (customId && src) {
    return <img src={src} width={size} height={size} alt={emoji} draggable={false} />;
  }
  return <span style={{ fontSize: size }}>{emoji}</span>;
}

// System message: a compact muted line.
export const SystemMessageRow = observer(function SystemMessageRow({
  message,
}: {
  message: Message;
}) {
  const text = systemText(message);
  if (!text) return null;
  return (
    <div className="system-message-row">
      <SystemIcon type={message.type} />
      <span>{text}</span>
    </div>
  );
});

function systemText(m: Message): string | null {
  const author = m.author.global_name ?? m.author.username;
  const target = m.mentions[0];
  const targetName = target ? target.global_name ?? target.username : null;
  switch (m.type) {
    case 1: return targetName ? `${author} added ${targetName} to the group.` : `${author} added someone.`;
    case 2: return targetName ? `${author} removed ${targetName} from the group.` : `${author} removed someone.`;
    case 3: return `${author} started a call.`;
    case 4: return m.content ? `${author} changed the channel name to ${m.content}.` : `${author} changed the channel name.`;
    case 5: return `${author} changed the channel icon.`;
    case 6: return `${author} pinned a message to this channel. See all pinned messages.`;
    case 7: return `Welcome, ${author}!`;
    default: return null;
  }
}

function SystemIcon(_: { type: number }) {
  // A small icon depending on the system message type.
  return <span className="system-icon">•</span>;
}

function isSystemMessage(type: number): boolean {
  return [1, 2, 3, 4, 5, 6, 7].includes(type);
}

function authorColor(user: User): string {
  // Deterministic color from user id; could use avatar_color if present.
  const colors = [
    "#e78284", "#ef9f76", "#e5c890", "#a6d189", "#85c1dc",
    "#ca9ee6", "#f4b8e4", "#81c8be",
  ];
  let hash = 0;
  for (const ch of user.id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function ToolbarBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button className="toolbar-btn" title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function startEdit(message: Message) {
  // Trigger the composer edit mode via a UI store flag.
  ui.editingMessageId = message.id;
}

/// Forwarded messages (carrying snapshots) have no content of their own and
/// cannot be edited — matching the reference client, which gates every edit
/// entry point on the absence of message_snapshots.
function isEditable(message: Message): boolean {
  return !(message.message_snapshots && message.message_snapshots.length > 0);
}

// Set the reply target on the composer. The composer renders a preview and
// sends with message_reference on the next send. Truncates the preview content
// to a single line so the bar stays compact.
function setReplyTarget(message: Message) {
  // Don't allow replying to system messages.
  if (isSystemMessage(message.type)) return;
  // Only set the reply target when replying in the active channel — the
  // composer lives on the currently-open channel.
  if (ui.selectedChannelId !== message.channel_id) return;
  const name = message.author.global_name ?? message.author.username;
  const content = message.content.replace(/\s+/g, " ").trim();
  ui.setReplyTarget({
    channelId: message.channel_id,
    messageId: message.id,
    authorName: name,
    content,
  });
}

function openContextMenu(message: Message, x: number, y: number) {
  const isMe = session.meId === message.author.id;
  const items: ContextMenuItem[] = [
    { kind: "action", label: "Add Reaction", onClick: () => ui.openReactionPicker(message.channel_id, message.id) },
    { kind: "action", label: "Reply", onClick: () => setReplyTarget(message) },
    { kind: "action", label: "Forward", onClick: () => ui.openForward(message) },
    { kind: "action", label: "Copy Text", onClick: () => navigator.clipboard?.writeText(message.content).catch(() => {}) },
    { kind: "action", label: "Copy Message Link", onClick: () => navigator.clipboard?.writeText(`${message.channel_id}/${message.id}`).catch(() => {}) },
    { kind: "separator" },
    { kind: "action", label: "Pin Message", onClick: () => messages.pin(message.channel_id, message.id, !message.pinned).catch(() => {}) },
    {
      kind: "action",
      label: "Create Thread",
      onClick: async () => {
        const name = window.prompt("Thread name", "New Thread");
        if (!name) return;
        const t = await guilds.startThread(message.channel_id, name, message.id);
        if (t) ui.openChannel(t.id);
      },
    },
  ];
  if (isMe) {
    // Forwarded messages carry no editable content (parity: edit is hidden).
    if (isEditable(message)) {
      items.push({ kind: "action", label: "Edit Message", onClick: () => startEdit(message) });
    }
    items.push({ kind: "action", label: "Delete Message", danger: true, onClick: () => messages.delete(message.channel_id, message.id) });
  }
  // User actions for the message author.
  if (!isMe) {
    items.push({ kind: "separator" });
    items.push({ kind: "action", label: "Profile", onClick: () => ui.openProfile(message.author.id, { x, y }, ui.currentGuild?.id) });
    items.push({ kind: "action", label: "Message", onClick: () => import("../stores").then(({ openDmWithUser }) => openDmWithUser(message.author.id).then((ch) => ui.openChannel(ch.id))) });
    const rel = relationships.getRelationship(message.author.id);
    if (!message.author.bot) {
      if (!rel) {
        items.push({ kind: "action", label: "Add Friend", onClick: () => relationships.sendFriendRequest(message.author.id).catch(() => {}) });
      } else if (rel.type === 1) {
        items.push({ kind: "action", label: "Remove Friend", danger: true, onClick: () => relationships.remove(message.author.id).catch(() => {}) });
      } else if (rel.type === 2) {
        items.push({ kind: "action", label: "Unblock User", onClick: () => relationships.remove(message.author.id).catch(() => {}) });
      } else {
        items.push({ kind: "action", label: "Block User", danger: true, onClick: () => relationships.remove(message.author.id).catch(() => {}) });
      }
    }
    if (!message.author.bot) {
      items.push({
        kind: "action",
        label: "Report Message",
        danger: true,
        onClick: () => ui.openReport({ kind: "message", channelId: message.channel_id, messageId: message.id }),
      });
    }
    items.push({ kind: "separator" });
    items.push({ kind: "action", label: "Copy User ID", onClick: () => navigator.clipboard?.writeText(message.author.id).catch(() => {}) });
  }
  ui.openContextMenu(items, { x, y });
}

// Reply reference preview
function ReplyRef({ messageId, channelId }: { messageId: Snowflake; channelId: Snowflake }) {
  // Fetch the referenced message lazily; for now show a placeholder.
  const [ref, setRef] = useState<Message | null>(null);
  useEffect(() => {
    api.listMessages(channelId, 50).then((msgs) => {
      const m = msgs.find((x) => x.id === messageId);
      if (m) setRef(m);
    }).catch(() => {});
  }, [messageId, channelId]);
  if (!ref) return null;
  const name = ref.author.global_name ?? ref.author.username;
  return (
    <div className="reply-ref">
      <span className="reply-ref-line" />
      <Avatar user={ref.author} size={16} />
      <span className="reply-ref-name" style={{ color: authorColor(ref.author) }}>
        {name}
      </span>
      <span className="reply-ref-content nowrap">{ref.content}</span>
    </div>
  );
}

// Icons
function EmojiIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8.5 11a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-7.5 3.5c.83 1.2 2.23 2 4 2s3.17-.8 4-2c.28-.4.04-.93-.42-1.05A8.5 8.5 0 0 0 12 15a8.5 8.5 0 0 0-3.58-.55c-.46.12-.7.65-.42 1.05z" />
    </svg>
  );
}
function ReplyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.42l-2.33-2.33a1 1 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

// Imports used by helpers above.
import type { Snowflake, User, Attachment } from "../types";
import { emojiUrl } from "../utils";

/// Render forwarded-message snapshots (reference anatomy: left vertical bar,
/// italic "Forwarded" header, snapshot content/attachments/embeds, then a
/// "Forwarded from" source pill when the source channel is locally known).
/// Snapshots carry no author — the carrier message's author is the forwarder.
/// Only snapshots[0] is rendered, matching the reference.
const ForwardedList = observer(function ForwardedList({
  message,
  snapshots,
}: {
  message: Message;
  snapshots: MessageSnapshot[];
}) {
  const s = snapshots[0];
  if (!s) return null;
  return (
    <div className="message-forwarded">
      <span className="message-forwarded-bar" />
      <div className="message-forwarded-content">
        <div className="message-forwarded-header">
          <ForwardIcon size={12} />
          <span className="message-forwarded-label">Forwarded</span>
        </div>
        {s.content && (
          <div className="message-forwarded-body">
            <ContentRenderer content={s.content} messageId={`fwd-${message.id}`} />
            {s.edited_timestamp && <span className="message-edited muted small"> (edited)</span>}
          </div>
        )}
        {s.attachments && s.attachments.length > 0 && (
          <AttachmentList attachments={s.attachments} />
        )}
        {s.embeds && s.embeds.length > 0 && <EmbedList embeds={s.embeds} />}
        <ForwardedSource message={message} />
      </div>
    </div>
  );
});

/// "Forwarded from" pill linking back to the source channel. Renders nothing
/// when the source channel isn't locally known (lost access / unknown guild) —
/// matching the reference's hasAccessToSource behavior.
const ForwardedSource = observer(function ForwardedSource({ message }: { message: Message }) {
  const srcChannelId = message.message_reference?.channel_id;
  if (!srcChannelId) return null;

  const dm = dms.getDm(srcChannelId);
  const inGuild = !dm ? guilds.findChannel(srcChannelId) : undefined;
  if (!dm && !inGuild) return null;

  const jump = () => {
    if (inGuild) {
      const gi = guilds.guilds.findIndex((g) => g.id === inGuild.guildId);
      if (gi >= 0) ui.selectGuild(gi);
    }
    ui.openChannel(srcChannelId);
  };

  const guild = inGuild ? guilds.getGuild(inGuild.guildId) : undefined;
  return (
    <button className="message-forwarded-source" onClick={jump}>
      <span className="message-forwarded-source-label">Forwarded from</span>
      {guild ? (
        <span className="message-forwarded-source-info nowrap">
          <span className="message-forwarded-source-name">{guild.name}</span>
          <ChevronRightIcon />
          <span className="message-forwarded-source-name">#{inGuild!.channel.name}</span>
        </span>
      ) : (
        <span className="message-forwarded-source-info nowrap">
          <span className="message-forwarded-source-name">{dmLabel(dm!)}</span>
        </span>
      )}
    </button>
  );
});

function ForwardIcon({ size = 14 }: { size?: number }) {
  // Arrow-bend-up-right (matches the reference's forward glyph).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="14 4 20 9.5 14 15" />
      <path d="M4 20c0-6 3.5-10.5 16-10.5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 5 16 12 9 19" />
    </svg>
  );
}

/// Render a message's file attachments. Images and videos render inline (via
/// the image proxy to avoid CORS); everything else renders as a download chip.
function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="message-attachments">
      {attachments.map((a) => (
        <AttachmentItem key={a.id} attachment={a} />
      ))}
    </div>
  );
}

function AttachmentItem({ attachment }: { attachment: Attachment }) {
  const ct = attachment.content_type ?? "";
  const lower = attachment.filename.toLowerCase();
  // Images: open the in-app image viewer on click (not the external URL).
  if (ct.startsWith("image/") && !attachment.spoiler) {
    return (
      <button
        className="attachment-image"
        title={attachment.filename}
        onClick={(e) => { e.preventDefault(); ui.openImageViewer(attachment.url); }}
      >
        <CachedAssetImage url={attachment.url} alt={attachment.description ?? attachment.filename} />
      </button>
    );
  }
  // Audio: custom player. Includes audio-only WebM/OGG (which carry a
  // `video/*` content type because of the container, but have no video track —
  // detected via a missing `width`). Also falls back to the filename extension
  // when the content type is absent.
  const isAudio =
    ct.startsWith("audio/") ||
    (ct === "audio/webm") ||
    (ct === "video/webm" && !attachment.width) ||
    (ct === "video/ogg" && !attachment.width) ||
    (ct === "video/opus" && !attachment.width) ||
    (!ct && /\.(webm|opus|ogg|mp3|wav|m4a|flac|aac)$/i.test(lower));
  if (isAudio) {
    return <CachedAssetAudio url={attachment.url} />;
  }
  // Videos: native <video> element, sourced from the cached asset URL.
  if (ct.startsWith("video/")) {
    return <CachedAssetVideo url={attachment.url} poster={undefined} />;
  }
  // Everything else: a download chip pointing at the cached asset URL.
  return <CachedAssetFile attachment={attachment} />;
}

/// Image rendered through the on-disk media cache (avoids CORS + caches bytes
/// across renders/navigations).
function CachedAssetImage({ url, alt }: { url: string; alt: string }) {
  const src = useAssetUrl(url);
  if (!src) return <div className="attachment-image-placeholder" aria-label={alt} />;
  return <img src={src} alt={alt} draggable={false} />;
}

/// Video sourced from the cached asset URL so the bytes are downloaded once.
function CachedAssetVideo({ url, poster }: { url: string; poster?: string }) {
  const src = useAssetUrl(url);
  if (!src) return <div className="attachment-image-placeholder" aria-label="video" />;
  return <video className="attachment-video" controls src={src} poster={poster} />;
}

/// Audio rendered via the custom AudioPlayer (routed through the media cache).
function CachedAssetAudio({ url }: { url: string }) {
  return <AudioPlayer url={url} />;
}

/// Generic file download chip pointing at the cached asset URL (so repeated
/// downloads reuse the cached bytes).
function CachedAssetFile({ attachment }: { attachment: Attachment }) {
  const src = useAssetUrl(attachment.url);
  const href = src ?? attachment.url;
  return (
    <a
      className={`attachment-file ${attachment.spoiler ? "spoiler" : ""}`}
      href={href}
      target="_blank"
      rel="noreferrer"
      download={attachment.filename}
    >
      <span className="attachment-file-name">{attachment.filename}</span>
      <span className="attachment-file-size muted small">{formatSize(attachment.size)}</span>
    </a>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}