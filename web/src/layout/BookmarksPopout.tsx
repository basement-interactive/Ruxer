// BookmarksPopout: the saved-messages (bookmarks) list, anchored under the
// channel-header bookmark button. Fetches lazily on first open; entries the
// user lost access to render as removable "missing" cards; each saved card
// jumps to the original message on click.

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { saved, messages, ui, guilds, dms, dmLabel, resolveChannelName } from "../stores";
import type { Message, Snowflake } from "../types";
import { Avatar } from "../components/Avatar";
import { ContentRenderer } from "../components/ContentRenderer";
import { formatTimestamp } from "../utils";
import "./BookmarksPopout.css";

export const BookmarksPopout = observer(function BookmarksPopout() {
  // Lazy fetch on first open per session / per reconnect.
  useEffect(() => {
    if (!saved.fetched) void saved.fetch();
  }, []);

  const empty = saved.fetched && saved.savedMessages.length === 0 && saved.missing.length === 0;

  return (
    <div className="bookmarks-popout">
      <div className="bookmarks-popout-header">Bookmarks</div>
      {!saved.fetched && <div className="bookmarks-loading muted">Loading bookmarks…</div>}
      {empty && (
        <div className="bookmarks-empty">
          <div className="bookmarks-empty-title">No bookmarks</div>
          <div className="bookmarks-empty-desc">Bookmark messages to save them for later.</div>
        </div>
      )}
      {saved.fetched && !empty && (
        <div className="bookmarks-scroller">
          {saved.missing.map((e) => (
            <div key={e.id} className="bookmark-missing-card">
              <span>You lost access to this saved message. Remove?</span>
              <button className="bookmark-missing-remove" onClick={() => saved.unsave(e.messageId)}>
                Remove
              </button>
            </div>
          ))}
          {saved.savedMessages.map((m) => (
            <BookmarkCard key={m.id} message={m} />
          ))}
          <div className="bookmarks-end">
            <div className="bookmarks-end-title">You've reached the end</div>
            <div className="bookmarks-end-desc">That's all of them.</div>
          </div>
        </div>
      )}
    </div>
  );
});

const BookmarkCard = observer(function BookmarkCard({ message }: { message: Message }) {
  const channelName = resolveChannelName(message.channel_id) ?? "unknown-channel";
  const breadcrumb = channelBreadcrumb(message.channel_id);
  const authorName = message.author.global_name ?? message.author.username;

  const jump = () => {
    ui.toggleBookmarks(false);
    void messages.jumpTo(message.channel_id, message.id);
  };

  return (
    <div className="bookmark-card">
      <div className="bookmark-card-header">
        <div className="bookmark-card-channel">
          <button className="bookmark-card-channel-name nowrap" onClick={jump}>
            {channelName}
          </button>
          {breadcrumb && <span className="bookmark-card-breadcrumb nowrap">{breadcrumb}</span>}
        </div>
        <button
          className="bookmark-card-remove"
          title="Remove bookmark"
          onClick={() => saved.unsave(message.id)}
        >
          <XIcon />
        </button>
      </div>
      <div className="bookmark-card-preview">
        <div className="bookmark-card-author">
          <Avatar user={message.author} size={20} />
          <span className="bookmark-card-author-name">{authorName}</span>
          <span className="bookmark-card-time muted small">{formatTimestamp(message.timestamp)}</span>
        </div>
        {message.content && (
          <div className="bookmark-card-content">
            <ContentRenderer content={message.content} messageId={message.id} />
          </div>
        )}
        {!message.content && message.attachments.length > 0 && (
          <div className="bookmark-card-content muted small">({message.attachments.length} attachment{message.attachments.length === 1 ? "" : "s"})</div>
        )}
        <button className="bookmark-card-jump" onClick={jump}>
          Jump
        </button>
      </div>
    </div>
  );
});

/// "GuildName" for guild channels, "Direct Messages" for DMs.
function channelBreadcrumb(channelId: Snowflake): string | null {
  const inGuild = guilds.findChannel(channelId);
  if (inGuild) return guilds.getGuild(inGuild.guildId)?.name ?? null;
  const dm = dms.getDm(channelId);
  if (dm) return dm.recipients.length > 1 ? dmLabel(dm) : "Direct Messages";
  return null;
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}
