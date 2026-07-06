// ChannelList: the guild channel list with categories. Channels are grouped by
// parent_id; orphan channels appear at the top, then each category header with
// its children. Text channels render as #name rows; categories as collapsible
// headers; voice channels render with a speaker icon + connected-member list.

import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";
import { useState } from "react";
import { ui, guilds, messages, voice, session, readState, toasts } from "../stores";
import { resolveUserName, resolveUser, buildVoiceParticipantContextMenu } from "../stores";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import type { ContextMenuItem } from "../stores";
import type { Channel, Guild, Snowflake, ThreadChannel } from "../types";
import { channelType } from "../types";
import "./ChannelList.css";

export const ChannelList = observer(function ChannelList({
  guild,
}: {
  guild: Guild;
}) {
  const channels = guilds.channelsByGuild.get(guild.id) ?? [];
  const orphans = channels.filter(
    (c) => !c.parent_id && c.type !== channelType.GUILD_CATEGORY
  );
  const categories = channels.filter((c) => c.type === channelType.GUILD_CATEGORY);
  const favorites = channels.filter(
    (c) => c.type !== channelType.GUILD_CATEGORY && ui.isFavorite(c.id),
  );
  const byParent = new Map<string, Channel[]>();
  for (const c of channels) {
    if (c.parent_id && c.type !== channelType.GUILD_CATEGORY) {
      const arr = byParent.get(c.parent_id) ?? [];
      arr.push(c);
      byParent.set(c.parent_id, arr);
    }
  }

  return (
    <div className="channel-list">
      <div className="channel-list-header">
        <span className="channel-list-guild-name nowrap">{guild.name}</span>
        <button
          className="channel-list-add"
          title="Create Channel"
          onClick={async () => {
            const name = window.prompt("Text channel name", "new-channel");
            if (!name) return;
            try {
              const ch = await api.createChannel(guild.id, name, channelType.GUILD_TEXT, undefined, undefined);
              const chs = guilds.channelsByGuild.get(guild.id) ?? [];
              if (!chs.some((c) => c.id === ch.id)) {
                runInAction(() => guilds.channelsByGuild.set(guild.id, [...chs, ch]));
              }
            } catch (err) {
              toasts.error("Failed to create channel", String(err));
            }
          }}
        >
          +
        </button>
      </div>
      <div className="channel-list-scroll">
        {favorites.length > 0 && (
          <div className="channel-favorites">
            <div className="category-header category-header-static">
              <span className="category-name nowrap">★ Favorites</span>
            </div>
            {favorites.map((c) => (
              <ChannelRow key={`fav-${c.id}`} channel={c} guildId={guild.id} />
            ))}
          </div>
        )}
        {orphans.map((c) => (
          <ChannelRow key={c.id} channel={c} guildId={guild.id} />
        ))}
        {categories.map((cat) => (
          <CategoryBlock
            key={cat.id}
            category={cat}
            children={byParent.get(cat.id) ?? []}
            guildId={guild.id}
          />
        ))}
        {channels.length === 0 && (
          <div className="channel-list-empty muted">Loading channels…</div>
        )}
      </div>
    </div>
  );
});

const ChannelRow = observer(function ChannelRow({
  channel,
  guildId,
}: {
  channel: Channel;
  guildId: Snowflake;
}) {
  if (channel.type === channelType.GUILD_VOICE) {
    return <VoiceChannelRow channel={channel} guildId={guildId} />;
  }
  if (channel.type !== channelType.GUILD_TEXT) return null;
  const selected = ui.selectedChannelId === channel.id;
  const unread = messages.unread.has(channel.id);
  const mentions = readState.mentionsFor(channel.id);
  // Active threads whose parent is this channel.
  const threads = [...guilds.threadsById.values()].filter(
    (t) => t.parent_id === channel.id,
  );
  return (
    <div className="channel-row-wrap">
      <div
        className={`channel-row ${selected ? "selected" : ""} ${unread ? "unread" : ""}`}
        onClick={() => ui.openChannel(channel.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          // Siblings in the same category, ordered by position — for Move Up/Down.
          const siblings = (guilds.channelsByGuild.get(guildId) ?? [])
            .filter(
              (c) =>
                (c.parent_id ?? null) === (channel.parent_id ?? null) &&
                c.type !== channelType.GUILD_CATEGORY,
            )
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
          const sIdx = siblings.findIndex((c) => c.id === channel.id);
          const moveChannel = async (dir: -1 | 1) => {
            const other = siblings[sIdx + dir];
            if (!other) return;
            const posA = channel.position ?? 0;
            const posB = other.position ?? 0;
            try {
              await api.reorderChannels(guildId, [
                { id: channel.id, position: posB },
                { id: other.id, position: posA },
              ]);
              runInAction(() => {
                const chs = [...(guilds.channelsByGuild.get(guildId) ?? [])];
                const ca = chs.find((c) => c.id === channel.id);
                const cb = chs.find((c) => c.id === other.id);
                if (ca) ca.position = posB;
                if (cb) cb.position = posA;
                guilds.channelsByGuild.set(guildId, chs);
              });
            } catch (err) {
              toasts.error("Failed to reorder channel", String(err));
            }
          };
          const items: ContextMenuItem[] = [
            { kind: "action", label: "Mark as Read", onClick: () => messages.markRead(channel.id) },
            { kind: "action", label: "Move Up", disabled: sIdx <= 0, onClick: () => moveChannel(-1) },
            { kind: "action", label: "Move Down", disabled: sIdx >= siblings.length - 1, onClick: () => moveChannel(1) },
            {
              kind: "action",
              label: ui.isFavorite(channel.id) ? "Remove Favorite" : "Favorite Channel",
              onClick: () => ui.toggleFavorite(channel.id),
            },
            { kind: "action", label: "Copy Channel Name", onClick: () => navigator.clipboard?.writeText(channel.name ?? "").catch(() => {}) },
            { kind: "separator" },
            {
              kind: "action",
              label: "Edit Channel",
              onClick: async () => {
                const name = window.prompt("Channel name", channel.name ?? "");
                if (!name) return;
                try {
                  const updated = await api.editChannel(channel.id, name);
                  runInAction(() => {
                    const chs = guilds.channelsByGuild.get(guildId) ?? [];
                    const idx = chs.findIndex((c) => c.id === channel.id);
                    if (idx >= 0) {
                      const next = [...chs];
                      next[idx] = updated;
                      guilds.channelsByGuild.set(guildId, next);
                    }
                  });
                } catch (err) {
                  toasts.error("Failed to edit channel", String(err));
                }
              },
            },
            {
              kind: "action",
              label: "Delete Channel",
              danger: true,
              onClick: async () => {
                if (!window.confirm(`Delete #${channel.name}?`)) return;
                try {
                  await api.deleteChannel(channel.id);
                  runInAction(() => {
                    const chs = guilds.channelsByGuild.get(guildId) ?? [];
                    guilds.channelsByGuild.set(guildId, chs.filter((c) => c.id !== channel.id));
                    if (ui.selectedChannelId === channel.id) ui.selectedChannelId = null;
                  });
                } catch (err) {
                  toasts.error("Failed to delete channel", String(err));
                }
              },
            },
            { kind: "separator" },
            {
              kind: "action",
              label: "Load Active Threads",
              onClick: () => guilds.loadActiveThreads(channel.id),
            },
          ];
          ui.openContextMenu(items, { x: e.clientX, y: e.clientY });
        }}
      >
        <HashIcon />
        <span className="channel-row-name nowrap">{channel.name ?? "unnamed"}</span>
        {mentions > 0 && <span className="badge channel-badge">{mentions}</span>}
      </div>
      {threads.length > 0 && (
        <div className="thread-list">
          {threads.map((t) => (
            <ThreadRow key={t.id} thread={t} />
          ))}
        </div>
      )}
    </div>
  );
});

/// A thread row rendered under its parent channel. Clicking opens the thread
/// (reusing the message stream since a thread is just a channel).
const ThreadRow = observer(function ThreadRow({ thread }: { thread: ThreadChannel }) {
  const selected = ui.selectedChannelId === thread.id;
  return (
    <button
      className={`thread-row ${selected ? "selected" : ""}`}
      onClick={() => ui.openChannel(thread.id)}
      title={thread.name ?? "Thread"}
    >
      <ThreadIcon />
      <span className="thread-row-name nowrap">{thread.name ?? "Thread"}</span>
      {thread.member_count != null && thread.member_count > 0 && (
        <span className="thread-row-count muted small">{thread.member_count}</span>
      )}
    </button>
  );
});

/// A voice channel row. Renders the speaker icon + channel name, and when
/// anyone is connected, a list of the connected members underneath. Clicking
/// joins the voice channel (op 4); if the user is already in this channel,
/// clicking does nothing (use the in-call controls to leave).
const VoiceChannelRow = observer(function VoiceChannelRow({
  channel,
  guildId,
}: {
  channel: Channel;
  guildId: Snowflake;
}) {
  const states = voice.statesFor(guildId).filter((v) => v.channel_id === channel.id);
  const myState = states.find((v) => v.user_id === session.meId);
  const inThisChannel = !!myState;
  const selected = ui.selectedChannelId === channel.id;

  const onClick = () => {
    if (inThisChannel) return;
    voice.joinChannel(guildId, channel.id).catch((e) =>
      console.error("voice join failed", e),
    );
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const items: ContextMenuItem[] = [
      {
        kind: "action",
        label: inThisChannel ? "Disconnect" : "Join Voice",
        onClick: () =>
          inThisChannel
            ? voice.leaveChannel().catch(() => {})
            : voice.joinChannel(guildId, channel.id).catch(() => {}),
      },
      { kind: "action", label: "Copy Channel Name", onClick: () => navigator.clipboard?.writeText(channel.name ?? "").catch(() => {}) },
    ];
    ui.openContextMenu(items, { x: e.clientX, y: e.clientY });
  };

  // Voice user-count pill (NN/NN) only when the channel has a user limit.
  const limit = (channel as Channel & { user_limit?: number }).user_limit ?? 0;

  return (
    <>
      <div
        className={`channel-row voice-channel-row ${selected ? "selected" : ""} ${inThisChannel ? "in-voice" : ""}`}
        onClick={onClick}
        onContextMenu={onContextMenu}
        title={inThisChannel ? "You are in this voice channel" : "Join voice channel"}
      >
        <SpeakerIcon />
        <span className="channel-row-name nowrap">{channel.name ?? "unnamed"}</span>
        {limit > 0 && (
          <span className="voice-user-count">
            {String(states.length).padStart(2, "0")}/{String(limit).padStart(2, "0")}
          </span>
        )}
      </div>
      {/* Participants render inline under the channel, mirroring the real
          client (no floating panel). The list returns null when empty. */}
      <VoiceParticipantsList guildId={guildId} channelId={channel.id} states={states} />
    </>
  );
});

/// The inline list of connected voice participants, rendered directly under a
/// voice channel row. Each row is a 24px avatar + name + state icons, with a
/// green speaking ring, a right-click context menu, and click-to-open-profile.
const VoiceParticipantsList = observer(function VoiceParticipantsList({
  guildId,
  channelId,
  states,
}: {
  guildId: Snowflake;
  channelId: Snowflake;
  states: ReturnType<typeof voice.statesFor>;
}) {
  if (states.length === 0) return null;
  return (
    <div className="voice-participants">
      {states.map((v) => (
        <VoiceParticipantRow
          key={v.user_id}
          userId={v.user_id}
          guildId={guildId}
          channelId={channelId}
          muted={v.self_mute ?? false}
          deaf={v.self_deaf ?? false}
          video={v.self_video ?? false}
          stream={v.self_stream ?? false}
        />
      ))}
    </div>
  );
});

const VoiceParticipantRow = observer(function VoiceParticipantRow({
  userId,
  guildId,
  channelId,
  muted,
  deaf,
  video,
  stream,
}: {
  userId: Snowflake;
  guildId: Snowflake;
  channelId: Snowflake;
  muted: boolean;
  deaf: boolean;
  video: boolean;
  stream: boolean;
}) {
  const name = resolveUserName(userId) ?? "unknown";
  const user = resolveUser(userId);
  // Per-participant speaking flag from the LiveKit participant list (matched by
  // the parsed Fluxer user id, since identity is `user_{id}_{conn}`).
  const speaking = voice.participants.some((p) => p.userId === userId && p.speaking);
  const hasIcons = muted || deaf || video || stream;

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    ui.openContextMenu(
      buildVoiceParticipantContextMenu(userId, guildId, channelId, e.clientX, e.clientY),
      { x: e.clientX, y: e.clientY },
    );
  };

  return (
    <div
      className={`voice-participant-row ${speaking ? "speaking" : ""}`}
      role="button"
      tabIndex={0}
      onClick={(e) => ui.openProfile(userId, { x: e.clientX, y: e.clientY }, guildId)}
      onContextMenu={openMenu}
    >
      <Avatar user={user} size={24} showStatus={false} speaking={speaking} />
      <span className="voice-participant-row-name nowrap">{name}</span>
      {hasIcons && (
        <span className="voice-participant-row-icons">
          {video && <VideoIcon />}
          {muted && <MutedIcon />}
          {deaf && <DeafenedIcon />}
          {stream && <span className="voice-live-badge">LIVE</span>}
        </span>
      )}
    </div>
  );
});

const CategoryBlock = observer(function CategoryBlock({
  category,
  children,
  guildId,
}: {
  category: Channel;
  children: Channel[];
  guildId: Snowflake;
}) {
  const [open, setOpen] = useState(true);
  const visibleChildren = children.filter(
    (c) => c.type === channelType.GUILD_TEXT || c.type === channelType.GUILD_VOICE,
  );
  if (visibleChildren.length === 0) return null;
  const createChannel = async (kind: number) => {
    const name = window.prompt(kind === channelType.GUILD_VOICE ? "Voice channel name" : "Text channel name", "new-channel");
    if (!name) return;
    try {
      const ch = await api.createChannel(guildId, name, kind, category.id, undefined);
      const chs = guilds.channelsByGuild.get(guildId) ?? [];
      if (!chs.some((c) => c.id === ch.id)) {
        runInAction(() => guilds.channelsByGuild.set(guildId, [...chs, ch]));
      }
    } catch (err) {
      toasts.error("Failed to create channel", String(err));
    }
  };
  return (
    <div className="category-block">
      <button
        className="category-header"
        onClick={() => setOpen((o) => !o)}
        onContextMenu={(e) => {
          e.preventDefault();
          ui.openContextMenu(
            [
              { kind: "action", label: "Create Text Channel", onClick: () => createChannel(channelType.GUILD_TEXT) },
              { kind: "action", label: "Create Voice Channel", onClick: () => createChannel(channelType.GUILD_VOICE) },
            ],
            { x: e.clientX, y: e.clientY },
          );
        }}
      >
        <span className="category-content">
          <span className="category-name nowrap">{category.name ?? "Category"}</span>
        </span>
        <span className="category-actions">
          <CaretDownIcon className={`category-arrow ${open ? "open" : ""}`} />
        </span>
      </button>
      {open && visibleChildren.map((c) => <ChannelRow key={c.id} channel={c} guildId={guildId} />)}
    </div>
  );
});

function HashIcon() {
  return (
    <svg width="20" height="16" viewBox="0 0 28 20" fill="currentColor" className="channel-hash">
      <path d="M5.88 19.2c-.24 0-.4-.08-.48-.24-.1-.16-.12-.36-.06-.6l.96-5.16H2.4c-.3 0-.52-.08-.66-.24-.14-.18-.18-.4-.12-.66l.18-.96c.06-.26.18-.46.36-.6.2-.16.42-.24.66-.24h4.32l1.02-5.4H3.96c-.3 0-.52-.08-.66-.24-.14-.18-.18-.4-.12-.66l.18-.96c.06-.26.18-.46.36-.6.2-.16.42-.24.66-.24h4.32l1.02-5.4c.06-.26.18-.46.36-.6.2-.16.42-.24.66-.24h1.02c.24 0 .4.08.48.24.1.16.12.36.06.6l-.96 5.4h5.04l1.02-5.4c.06-.26.18-.46.36-.6.2-.16.42-.24.66-.24h1.02c.24 0 .4.08.48.24.1.16.12.36.06.6l-.96 5.4h3.96c.3 0 .52.08.66.24.14.18.18.4.12.66l-.18.96c-.06.26-.18.46-.36.6-.2.16-.42.24-.66.24h-4.32l-1.02 5.4h3.96c.3 0 .52.08.66.24.14.18.18.4.12.66l-.18.96c-.06.26-.18.46-.36.6-.2.16-.42.24-.66.24h-4.32l-1.02 5.4c-.06.26-.18.46-.36.6-.2.16-.42.24-.66.24h-1.02z" />
    </svg>
  );
}

// Caret used for the collapsible category header. Sized 12px (0.75rem) so its
// box dimensions are honored (a Unicode glyph ignores them). Rotated via the
// .open / :not(.open) CSS rules.
function CaretDownIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" className={className} aria-hidden>
      <path d="M213.66 101.66l-80 80a8 8 0 0 1-11.32 0l-80-80A8 8 0 0 1 53.66 90.34L128 164.69l74.34-74.35a8 8 0 0 1 11.32 11.32z" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="20" height="16" viewBox="0 0 24 24" fill="currentColor" className="channel-hash">
      <path d="M3 10v4a1 1 0 0 0 1 1h3l3.29 3.29a1 1 0 0 0 1.71-.71V6.41a1 1 0 0 0-1.71-.71L7 9H4a1 1 0 0 0-1 1zm13.5 2a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zm-2.5-6.97v2.06A6.5 6.5 0 0 1 16.5 12c0 2.97-1.99 5.48-4.7 6.27l-.01-.01v2.07A8.5 8.5 0 0 0 16.5 12c0-3.9-2.6-7.2-6.2-8.27l.01-.7z" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="voice-icon-muted">
      <path d="M3 10v4a1 1 0 0 0 1 1h3l3.29 3.29a1 1 0 0 0 1.71-.71V6.41a1 1 0 0 0-1.71-.71L7 9H4a1 1 0 0 0-1 1zm13.5 2a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z" />
      <path d="M19 5l-14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DeafenedIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="voice-icon-deaf">
      <path d="M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h1v-8H4v-1a8 8 0 0 1 16 0v1h-3v8h1a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9z" />
      <path d="M5 5l14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="voice-icon-video">
      <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
    </svg>
  );
}

function ThreadIcon() {
  return (
    <svg width="16" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="thread-icon">
      <path d="M5 4h14v10H7l-4 4V4z" />
    </svg>
  );
}