// MessageRow: renders a single message. Grouped rows skip the avatar/header
// and indent. Hovering shows a toolbar with quick reactions, reply, edit, delete,
// pin, copy. System messages render as a muted line.

import { observer } from "mobx-react-lite";
import { useState, useEffect } from "react";
import { messages, session, ui, relationships, guilds } from "../stores";
import type { ContextMenuItem } from "../stores";
import type { Message, MessageSnapshot } from "../types";
import { Avatar } from "./Avatar";
import { ContentRenderer } from "./ContentRenderer";
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

  return (
    <div
      className="message-row"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu(message, e.clientX, e.clientY);
      }}
    >
      {/* Hover toolbar */}
      {hover && (
        <div className="message-toolbar">
          <ToolbarBtn title="Add Reaction" onClick={() => ui.openReactionPicker(message.channel_id, message.id)}>
            <EmojiIcon />
          </ToolbarBtn>
          <ToolbarBtn title="Reply" onClick={() => setReplyTarget(message)}>
            <ReplyIcon />
          </ToolbarBtn>
          {isMe && (
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
              <ContentRenderer content={message.content} messageId={message.id} />
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
                <ContentRenderer content={message.content} messageId={message.id} />
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
        <ForwardedList snapshots={message.message_snapshots} />
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
  return (
    <button
      className={`reaction-chip ${mine ? "mine" : ""}`}
      onClick={() =>
        messages.toggleReaction(message.channel_id, message.id, emoji, customEmojiId, mine)
      }
    >
      <EmojiDisplay emoji={emoji} customId={customEmojiId} animated={false} size={16} />
      <span>{count}</span>
    </button>
  );
});

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
    items.push({ kind: "action", label: "Edit Message", onClick: () => startEdit(message) });
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

/// Render forwarded-message snapshots. Each snapshot's content/embeds/
/// attachments render through the same renderers as a normal message, wrapped
/// in a "Forwarded" card. Snapshots carry no author (the carrier message's
/// author is the forwarder).
function ForwardedList({ snapshots }: { snapshots: MessageSnapshot[] }) {
  return (
    <div className="message-forwarded-list">
      {snapshots.map((s, i) => (
        <div key={i} className="message-forwarded">
          <div className="message-forwarded-badge muted small">
            <ForwardIcon /> Forwarded
          </div>
          {s.content && (
            <div className="message-forwarded-body">
              <ContentRenderer content={s.content} messageId={`fwd-${i}`} />
            </div>
          )}
          {s.attachments && s.attachments.length > 0 && (
            <AttachmentList attachments={s.attachments} />
          )}
          {s.embeds && s.embeds.length > 0 && <EmbedList embeds={s.embeds} />}
        </div>
      ))}
    </div>
  );
}

function ForwardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 17 20 12 15 7" />
      <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
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