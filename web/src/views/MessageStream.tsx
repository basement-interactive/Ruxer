// MessageStream: the scrollable message history. Groups consecutive messages
// by the same author within a short time window (Discord cozy layout): only
// the first row shows avatar/name/time; later rows indent under the text.
// Scrolling to the top loads older messages (infinite scroll).

import { observer } from "mobx-react-lite";
import React, { useEffect, useRef, useState } from "react";
import { messages } from "../stores";
import type { Message, Snowflake } from "../types";
import { MessageRow } from "../components/MessageRow";
import "./MessageStream.css";

export const MessageStream = observer(function MessageStream({
  channelId,
}: {
  channelId: Snowflake;
}) {
  const msgs = messages.getMessages(channelId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasNearBottom = useRef(true);
  const loadingMore = useRef(false);
  const [showTopLoader, setShowTopLoader] = useState(false);
  // Reactive "not at bottom" state so the jump-to-bottom button can show/hide.
  const [atBottom, setAtBottom] = useState(true);

  // Auto-scroll to bottom when new messages arrive (only if already near the
  // bottom, so we don't yank the view while reading history).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (wasNearBottom.current) {
      el.scrollTop = el.scrollHeight;
      setAtBottom(true);
    }
  }, [msgs.length, channelId]);

  // Reset the at-bottom state when switching channels.
  useEffect(() => {
    setAtBottom(true);
    wasNearBottom.current = true;
  }, [channelId]);

  // Preserve scroll position when older messages are prepended.
  const prevScrollHeight = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || prevScrollHeight.current === 0) return;
    // Restore the scroll position so the user doesn't jump.
    const newHeight = el.scrollHeight;
    el.scrollTop = newHeight - prevScrollHeight.current;
    prevScrollHeight.current = 0;
  }, [msgs.length]);

  const onScroll = async () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    wasNearBottom.current = nearBottom;
    setAtBottom(nearBottom);

    // Load more when scrolled near the top.
    if (el.scrollTop < 200 && !loadingMore.current) {
      loadingMore.current = true;
      setShowTopLoader(true);
      const oldHeight = el.scrollHeight;
      const count = await messages.loadMore(channelId, 50);
      if (count > 0) {
        // Schedule scroll restoration for after the new messages render.
        prevScrollHeight.current = oldHeight;
      }
      loadingMore.current = false;
      setShowTopLoader(false);
    }
  };

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    wasNearBottom.current = true;
    setAtBottom(true);
  };

  return (
    <div className="message-stream" ref={scrollRef} onScroll={onScroll}>
      <div className="message-stream-inner">
        {showTopLoader && (
          <div className="message-stream-loading-top">Loading older messages…</div>
        )}
        {msgs.length === 0 && (
          <div className="message-stream-empty">
            {messages.loaded.has(channelId)
              ? "No messages yet. Say hello!"
              : "Loading messages…"}
          </div>
        )}
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const groupable =
            !!prev &&
            prev.author.id === m.author.id &&
            sameDay(prev.timestamp, m.timestamp) &&
            prev.pinned === m.pinned &&
            !isSystem(prev) &&
            !isSystem(m);
          // Day divider: insert a divider when the date changes between messages.
          const showDivider = !prev || !sameDay(prev.timestamp, m.timestamp);
          return (
            <React.Fragment key={m.id}>
              {showDivider && <DayDivider timestamp={m.timestamp} />}
              <MessageRow message={m} groupable={groupable} />
            </React.Fragment>
          );
        })}
      </div>
      {!atBottom && (
        <button className="jump-to-bottom" onClick={jumpToBottom} title="Jump to bottom">
          <JumpToBottomIcon />
        </button>
      )}
    </div>
  );
});

function JumpToBottomIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 16l-6-6h12z" transform="rotate(180 12 12)" />
      <path d="M11 4h2v8h-2zM7 16l5 5 5-5z" />
    </svg>
  );
}

/// Day divider: a centered date label with a line on each side, shown when
/// the date changes between consecutive messages. Matches the real client's
/// day-divider anatomy.
function DayDivider({ timestamp }: { timestamp: string }) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  let label: string;
  if (sameDay(timestamp, today.toISOString())) {
    label = "Today";
  } else if (sameDay(timestamp, yesterday.toISOString())) {
    label = "Yesterday";
  } else {
    label = date.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    });
  }
  return (
    <div className="day-divider">
      <span className="day-divider-line" />
      <span className="day-divider-label">{label}</span>
      <span className="day-divider-line" />
    </div>
  );
}

function isSystem(m: Message): boolean {
  return [1, 2, 3, 4, 5, 6, 7].includes(m.type);
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}