// DmList: the sidebar content for the DM/Friends home view. Matches Fluxer's
// layout:
//   - "Friends" row (like a special channel, opens the Friends view)
//   - "Personal Notes" row (self-DM)
//   - "Direct Messages" section header with a + create-DM button
//   - scrollable list of DM channels sorted by recency

import { observer } from "mobx-react-lite";
import { ui, dms, messages, session, voice, guilds, buildUserContextMenu } from "../stores";
import type { ContextMenuItem } from "../stores";
import type { Channel, Snowflake } from "../types";
import { Avatar } from "../components/Avatar";
import { dmLabel } from "../stores";
import { t } from "../i18n";
import "./DmList.css";

export const DmList = observer(function DmList() {
  return (
    <div className="dm-list">
      <div className="dm-list-scroll">
        {/* Friends row — opens the Friends view in the main content */}
        <div
          className={`dm-friend-row ${ui.side === "friends" ? "selected" : ""}`}
          onClick={() => ui.selectFriends()}
        >
          <div className="dm-friend-row-icon">
            <FriendsIcon />
          </div>
          <span className="dm-friend-row-name">{t("app.friends")}</span>
        </div>

        {/* Personal Notes — the user's self-DM (synced to Fluxer). */}
        {(() => {
          const notes = dms.notesChannel;
          if (!notes) return null;
          const selected = ui.selectedChannelId === notes.id;
          return (
            <div
              className={`dm-row ${selected ? "selected" : ""}`}
              onClick={() => ui.openChannel(notes.id)}
            >
              <div className="dm-row-notes-icon">
                <NotesIcon />
              </div>
              <div className="dm-row-text">
                <div className="dm-row-name nowrap">Personal Notes</div>
              </div>
            </div>
          );
        })()}

        {/* Voice activity feed — who's connected to voice across all guilds. */}
        <VoiceActivityFeed />

        {/* Direct Messages section header */}
        <div className="dm-section-header">
          <span>{t("app.directMessages")}</span>
          <button
            className="dm-create-btn"
            title="Create DM"
            onClick={() => {/* Opens a picker; for now, a no-op placeholder */}}
          >
            <PlusIcon />
          </button>
        </div>

        {/* DM channel list */}
        {dms.channels.length === 0 && (
          <div className="dm-empty muted">No direct messages yet.</div>
        )}
        {dms.channels.map((c) => (
          <DmRow key={c.id} channel={c} />
        ))}
      </div>
    </div>
  );
});

const DmRow = observer(function DmRow({ channel }: { channel: Channel }) {
  const selected = ui.selectedChannelId === channel.id;
  const isUnread = messages.unread.has(channel.id);
  const recipient = channel.recipients[0];
  const label = dmLabel(channel);

  return (
    <div
      className={`dm-row ${selected ? "selected" : ""} ${isUnread ? "unread" : ""}`}
      onClick={() => ui.openChannel(channel.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        // Channel-level actions first, then the full user-action set when this
        // is a single-recipient DM (matches the official client's DM menu).
        const items: ContextMenuItem[] = [
          { kind: "action", label: "Mark as Read", onClick: () => messages.markRead(channel.id) },
          { kind: "separator" },
        ];
        if (recipient && recipient.id !== session.meId) {
          items.push(...buildUserContextMenu(recipient, e.clientX, e.clientY));
          items.push({ kind: "separator" });
        }
        items.push({ kind: "action", label: "Close DM", danger: true, onClick: () => dms.remove(channel.id) });
        ui.openContextMenu(items, { x: e.clientX, y: e.clientY });
      }}
    >
      {recipient ? (
        <Avatar user={recipient} size={32} showStatus />
      ) : (
        <div className="dm-row-group-icon">
          {channel.recipients.length}+
        </div>
      )}
      <div className="dm-row-text">
        <div className="dm-row-name nowrap">{label}</div>
        {channel.recipients.length > 1 && (
          <div className="dm-row-sub muted small nowrap">
            {channel.recipients.length} members
          </div>
        )}
      </div>
      {isUnread && <span className="dm-row-unread" />}
    </div>
  );
});

function FriendsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 5a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-5l-4 4-4-4H3a3 3 0 0 1-3-3V5zm12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
    </svg>
  );
}
function NotesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
// VoiceActivityFeed: a compact cross-guild list of voice channels with at least
// one connected member. Clicking a channel selects its guild + channel. Derived
// entirely from VoiceStore.activityFeed (gateway voice-state events).
const VoiceActivityFeed = observer(function VoiceActivityFeed() {
  const feed = voice.activityFeed;
  if (feed.length === 0) return null;

  // Resolve a channel's display name from the guild's channel list.
  const channelName = (guildId: Snowflake, channelId: Snowflake): string => {
    const ch = guilds.channelsByGuild.get(guildId)?.find((c) => c.id === channelId);
    return ch?.name ?? "voice";
  };
  // Resolve a member's user from the guild member list, falling back to the
  // global known-users cache.
  const resolveUser = (guildId: Snowflake, userId: Snowflake) => {
    const m = guilds.membersByGuild.get(guildId)?.find((x) => x.user.id === userId);
    return m?.user ?? ui.knownUsers.get(userId) ?? null;
  };

  return (
    <div className="dm-voice-activity">
      <div className="dm-section-header">
        <span>{t("app.voiceActivity")}</span>
      </div>
      {feed.map((entry) => {
        const guild = guilds.guilds.find((g) => g.id === entry.guildId);
        return (
          <div
            key={`${entry.guildId}-${entry.channelId}`}
            className="dm-voice-channel"
            onClick={() => {
              const idx = guilds.guilds.findIndex((g) => g.id === entry.guildId);
              if (idx >= 0) {
                ui.selectGuild(idx);
                ui.openChannel(entry.channelId);
              }
            }}
          >
            <div className="dm-voice-channel-head">
              <SpeakerIcon />
              <span className="dm-voice-channel-name nowrap">
                {channelName(entry.guildId, entry.channelId)}
              </span>
              <span className="dm-voice-guild nowrap muted small">{guild?.name ?? ""}</span>
            </div>
            <div className="dm-voice-members">
              {entry.userIds.map((uid) => {
                const u = resolveUser(entry.guildId, uid);
                if (!u) return null;
                return <Avatar key={uid} user={u} size={20} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
});

function SpeakerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />
    </svg>
  );
}
