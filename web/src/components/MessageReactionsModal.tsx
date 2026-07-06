// MessageReactionsModal: per-emoji filter tabs (left sidebar) + a paginated
// "who reacted" list. Opened from the reaction-chip tooltip and the message
// context menu ("View Reactions"). Tabs and counts derive live from the
// message's observable reactions; the selected emoji's user list lives on
// ui.reactionsModal. Reference parity: MessageReactionsModal +
// MessageReactionsContent in the official client.

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { ui, messages, guilds, session, toasts } from "../stores";
import type { ContextMenuItem } from "../stores";
import type { Reaction, Snowflake, User } from "../types";
import { api } from "../api";
import { emojiUrl } from "../utils";
import { useAssetUrl } from "../utils/mediaCache";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import "./MessageReactionsModal.css";

const MANAGE_MESSAGES = 1n << 13n;

export const MessageReactionsModal = observer(function MessageReactionsModal() {
  const rm = ui.reactionsModal;

  // Live message + reactions (tabs/counts follow gateway updates).
  const message = rm
    ? messages.getMessages(rm.channelId).find((m) => m.id === rm.messageId)
    : undefined;
  const reactions = message?.reactions ?? [];

  // Selection upkeep: close when the message/reactions vanish; fall back to
  // the first reaction when the selected emoji is removed.
  const selectedGone =
    !!rm &&
    reactions.length > 0 &&
    !reactions.some((r) =>
      rm.selected.id ? r.emoji.id === rm.selected.id : r.emoji.id == null && r.emoji.name === rm.selected.name,
    );
  useEffect(() => {
    if (!rm) return;
    if (!message || reactions.length === 0) {
      ui.closeReactionsModal();
      return;
    }
    if (selectedGone) {
      const first = reactions[0];
      ui.selectReactionTab({ name: first.emoji.name, id: first.emoji.id ?? null });
    }
  }, [rm, message, reactions.length, selectedGone]);

  if (!rm || !message || reactions.length === 0) return null;

  // Guild context (for MANAGE_MESSAGES + nicknames); undefined in DMs.
  const guildId = guilds.findChannel(rm.channelId)?.guildId;
  const canManage = !!guildId && guilds.canModerateGuild(guildId, MANAGE_MESSAGES);

  return (
    <Modal
      open
      onClose={() => ui.closeReactionsModal()}
      title="Reactions"
      size="medium"
      className="reactions-modal"
    >
      <div className="reactions-modal-layout">
        <div className="reactions-modal-sidebar">
          {reactions.map((r) => (
            <ReactionTab
              key={(r.emoji.id ?? "") + r.emoji.name}
              reaction={r}
              selected={
                rm.selected.id
                  ? r.emoji.id === rm.selected.id
                  : r.emoji.id == null && r.emoji.name === rm.selected.name
              }
              canManage={canManage}
              channelId={rm.channelId}
              messageId={rm.messageId}
            />
          ))}
        </div>
        <div className="reactions-modal-list-container">
          <div
            className="reactions-modal-list"
            onScroll={(e) => {
              const el = e.currentTarget;
              if ((el.scrollTop + el.offsetHeight) / el.scrollHeight > 0.8) {
                void ui.loadMoreReactionUsers();
              }
            }}
          >
            {rm.users.length === 0 && rm.loading && (
              <div className="reactions-modal-loading">Loading reactions…</div>
            )}
            {rm.users.map((u) => (
              <ReactorRow
                key={u.id}
                user={u}
                guildId={guildId}
                canManage={canManage}
                channelId={rm.channelId}
                messageId={rm.messageId}
                emoji={rm.selected}
              />
            ))}
            {rm.users.length > 0 && rm.loading && (
              <div className="reactions-modal-loading small">Loading…</div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
});

const ReactionTab = observer(function ReactionTab({
  reaction,
  selected,
  canManage,
  channelId,
  messageId,
}: {
  reaction: Reaction;
  selected: boolean;
  canManage: boolean;
  channelId: Snowflake;
  messageId: Snowflake;
}) {
  const emoji = { name: reaction.emoji.name, id: reaction.emoji.id ?? null };

  const onContextMenu = (e: React.MouseEvent) => {
    const items: ContextMenuItem[] = [];
    if (emoji.id) {
      items.push({
        kind: "action",
        label: "Copy Emoji ID",
        onClick: () => navigator.clipboard?.writeText(emoji.id!).catch(() => {}),
      });
      items.push({
        kind: "action",
        label: "Copy Emoji URL",
        onClick: () => navigator.clipboard?.writeText(emojiUrl(emoji.id!, false)).catch(() => {}),
      });
    }
    if (canManage) {
      if (items.length > 0) items.push({ kind: "separator" });
      items.push({
        kind: "action",
        label: "Remove Reaction",
        danger: true,
        onClick: async () => {
          // Optimistic: clear the emoji locally; the gateway echo confirms.
          messages.applyReactionEmojiRemoved(channelId, messageId, emoji);
          try {
            await api.removeReactionEmoji(channelId, messageId, emoji.name, emoji.id ?? undefined);
          } catch (err) {
            toasts.error("Failed to remove reaction", String(err));
          }
        },
      });
    }
    if (items.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    ui.openContextMenu(items, { x: e.clientX, y: e.clientY });
  };

  return (
    <button
      className={"reactions-modal-tab" + (selected ? " selected" : "")}
      aria-pressed={selected}
      aria-label={`${reaction.emoji.name}, ${reaction.count} reactions`}
      title={`:${reaction.emoji.name}:`}
      onClick={() => ui.selectReactionTab(emoji)}
      onContextMenu={onContextMenu}
    >
      <TabEmoji name={reaction.emoji.name} id={reaction.emoji.id ?? null} />
      <span className="reactions-modal-tab-count">{reaction.count}</span>
    </button>
  );
});

function TabEmoji({ name, id }: { name: string; id: Snowflake | null }) {
  const src = useAssetUrl(id ? emojiUrl(id, false) : null);
  if (id && src) {
    return <img className="reactions-modal-tab-emoji" src={src} alt={name} draggable={false} />;
  }
  if (id) return <span className="reactions-modal-tab-emoji muted">:{name}:</span>;
  return <span className="reactions-modal-tab-emoji">{name}</span>;
}

const ReactorRow = observer(function ReactorRow({
  user,
  guildId,
  canManage,
  channelId,
  messageId,
  emoji,
}: {
  user: User;
  guildId?: Snowflake;
  canManage: boolean;
  channelId: Snowflake;
  messageId: Snowflake;
  emoji: { name: string; id: Snowflake | null };
}) {
  const isSelf = user.id === session.meId;
  const nick = guildId ? guilds.getMember(guildId, user.id)?.nick : undefined;
  const displayName = nick ?? user.global_name ?? user.username;
  const showTag = user.discriminator && user.discriminator !== "0";

  const remove = async () => {
    // Optimistic: drop the row + decrement the chip; the gateway echo confirms.
    ui.reactionsModalApplyRemove(channelId, messageId, emoji, user.id);
    messages.applyReactionRemove(channelId, messageId, emoji, user.id);
    try {
      if (isSelf) {
        await api.removeOwnReaction(channelId, messageId, emoji.name, emoji.id ?? undefined);
      } else {
        await api.removeReactionFor(channelId, messageId, emoji.name, emoji.id ?? undefined, user.id);
      }
    } catch (err) {
      toasts.error("Failed to remove reaction", String(err));
    }
  };

  return (
    <div className="reactions-modal-row" data-user-id={user.id}>
      <Avatar user={user} size={24} />
      <div className="reactions-modal-row-info">
        <span className="reactions-modal-row-name nowrap">{displayName}</span>
        {showTag && (
          <span className="reactions-modal-row-tag nowrap">
            {user.username}#{user.discriminator}
          </span>
        )}
      </div>
      {(canManage || isSelf) && (
        <button
          className="reactions-modal-row-remove"
          aria-label={`Remove reaction from ${displayName}`}
          title="Remove reaction"
          onClick={remove}
        >
          <XIcon />
        </button>
      )}
    </div>
  );
});

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}
