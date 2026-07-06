// ChannelHeader: the top bar of the message area. Shows the channel name (with
// hash for guild channels or recipient name for DMs), topic, and members/pins
// toggle buttons on the right.

import { observer } from "mobx-react-lite";
import { useState, useEffect, useRef } from "react";
import { ui, voice } from "../stores";
import type { Channel } from "../types";
import { channelType } from "../types";
import { dmLabel } from "../stores";
import { BookmarksPopout } from "../layout/BookmarksPopout";
import "./ChannelHeader.css";

export const ChannelHeader = observer(function ChannelHeader({
  channel,
}: {
  channel: Channel;
}) {
  const isGuildText = channel.type === channelType.GUILD_TEXT;
  const name = isGuildText
    ? channel.name ?? "unnamed"
    : dmLabel(channel);
  const showMembers = ui.currentGuild != null;
  const canCall = !isGuildText;
  const inThisCall = voice.connected && voice.pendingChannelId === channel.id;
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const bookmarksRef = useRef<HTMLDivElement>(null);

  // Close notification dropdown on outside click.
  useEffect(() => {
    if (!notifOpen) return;
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [notifOpen]);

  // Close the bookmarks popout on outside click.
  useEffect(() => {
    if (!ui.bookmarksOpen) return;
    const onClick = (e: MouseEvent) => {
      if (bookmarksRef.current && !bookmarksRef.current.contains(e.target as Node)) {
        ui.toggleBookmarks(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [ui.bookmarksOpen]);

  return (
    <header className="channel-header">
      <div className="channel-header-left">
        {isGuildText ? <HashIcon /> : <DmIcon />}
        <span className="channel-header-name">{name}</span>
        {channel.topic && (
          <>
            <span className="channel-header-divider" />
            <span className="channel-header-topic nowrap">{channel.topic}</span>
          </>
        )}
      </div>
      <div className="channel-header-right">
        {/* Notification settings dropdown (guild text channels only) */}
        {isGuildText && (
          <div className="notif-dropdown-wrapper" ref={notifRef}>
            <button
              className="header-toggle"
              onClick={() => setNotifOpen((v) => !v)}
              title="Notification Settings"
            >
              <BellIcon />
            </button>
            {notifOpen && (
              <div className="notif-dropdown">
                <div className="notif-dropdown-title">Notification Settings</div>
                <button className="notif-dropdown-item">
                  <CheckIcon /> All Messages
                </button>
                <button className="notif-dropdown-item selected">
                  <span /> Mentions Only
                </button>
                <button className="notif-dropdown-item">
                  <span /> Nothing
                </button>
                <div className="notif-dropdown-separator" />
                <button className="notif-dropdown-item danger">
                  <span /> Mute {channel.name}
                </button>
              </div>
            )}
          </div>
        )}
        {canCall && (
          <button
            className={`header-toggle ${inThisCall ? "active" : ""}`}
            onClick={() => {
              if (inThisCall) {
                voice.leaveChannel();
              } else {
                voice.joinChannel(channel.guild_id ?? null, channel.id);
              }
            }}
            title={inThisCall ? "Leave Call" : "Start Call"}
          >
            <PhoneIcon active={inThisCall} />
          </button>
        )}
        <button
          className="header-toggle"
          onClick={() => ui.openSearch()}
          title="Search Messages"
        >
          <SearchIcon />
        </button>
        {showMembers && (
          <button
            className={`header-toggle ${ui.rightPane === "members" ? "active" : ""}`}
            onClick={() => ui.toggleRightPane("members")}
            title="Member List"
          >
            <MembersIcon />
          </button>
        )}
        <button
          className={`header-toggle ${ui.rightPane === "pins" ? "active" : ""}`}
          onClick={() => ui.toggleRightPane("pins")}
          title="Pinned Messages"
        >
          <PinIcon />
        </button>
        <div className="notif-dropdown-wrapper" ref={bookmarksRef}>
          <button
            className={`header-toggle ${ui.bookmarksOpen ? "active" : ""}`}
            onClick={() => ui.toggleBookmarks()}
            title="Bookmarks"
          >
            <BookmarkIcon filled={ui.bookmarksOpen} />
          </button>
          {ui.bookmarksOpen && <BookmarksPopout />}
        </div>
      </div>
    </header>
  );
});

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg width="24" height="20" viewBox="0 0 28 20" fill="currentColor" className="header-hash">
      <path d="M5.88 19.2c-.24 0-.4-.08-.48-.24-.1-.16-.12-.36-.06-.6l.96-5.16H2.4c-.3 0-.52-.08-.66-.24-.14-.18-.18-.4-.12-.66l.18-.96c.06-.26.18-.46.36-.6.2-.16.42-.24.66-.24h4.32l1.02-5.4H3.96c-.3 0-.52-.08-.66-.24-.14-.18-.18-.4-.12-.66l.18-.96c.06-.26.18-.46.36-.6.2-.16.42-.24.66-.24h4.32l1.02-5.4c.06-.26.18-.46.36-.6.2-.16.42-.24.66-.24h1.02c.24 0 .4.08.48.24.1.16.12.36.06.6l-.96 5.4h5.04l1.02-5.4c.06-.26.18-.46.36-.6.2-.16.42-.24.66-.24h1.02c.24 0 .4.08.48.24.1.16.12.36.06.6l-.96 5.4h3.96c.3 0 .52.08.66.24.14.18.18.4.12.66l-.18.96c-.06.26-.18.46-.36.6-.2.16-.42.24-.66.24h-4.32l-1.02 5.4h3.96c.3 0 .52.08.66.24.14.18.18.4.12.66l-.18.96c-.06.26-.18.46-.36.6-.2.16-.42.24-.66.24h-4.32l-1.02 5.4c-.06.26-.18.46-.36.6-.2.16-.42.24-.66.24h-1.02z" />
    </svg>
  );
}
function DmIcon() {
  return (
    <svg width="24" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7l-5 4V4z" />
    </svg>
  );
}
function MembersIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-7 2-7 5v2h14v-2c0-3-3-5-7-5zm9-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-1 0-2 .17-3 .47 1.4.9 2 2.1 2 3.53v2h6v-2c0-2.5-2.5-4-5-4z" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 3l5 5-1.5 1.5L17 7.5V13l-4 4v3l-1 1-3-3-4 4-1.5-1.5L7 16l-3-3 1-1h3l4-4h5.5L15 5.5 16 3z" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function PhoneIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z" />
      {active && <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />}
    </svg>
  );
}
function BellIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}