// FriendsView: the full friends page shown in the main content when side ===
// "friends". Header with Online/All/Pending/Add Friend tabs, a search box,
// the friend list, and the Active Now sidebar on the right.

import { observer } from "mobx-react-lite";
import { useState } from "react";
import { relationships, ui, presence, openDmWithUser, session } from "../stores";
import type { ContextMenuItem } from "../stores";
import type { Relationship } from "../types";
import { Avatar } from "../components/Avatar";
import "./FriendsView.css";

type Tab = "online" | "all" | "pending" | "add";

export const FriendsView = observer(function FriendsView() {
  const [tab, setTab] = useState<Tab>("online");
  const [query, setQuery] = useState("");

  return (
    <div className="friends-view">
      <div className="friends-main">
        <header className="friends-header">
          <div className="friends-header-title">
            <FriendsIcon />
            <span>Friends</span>
          </div>
          <div className="friends-divider" />
          <nav className="friends-tabs">
            <TabBtn active={tab === "online"} onClick={() => setTab("online")}>
              Online
            </TabBtn>
            <TabBtn active={tab === "all"} onClick={() => setTab("all")}>
              All
            </TabBtn>
            <TabBtn
              active={tab === "pending"}
              onClick={() => setTab("pending")}
              badge={relationships.pending.length || undefined}
            >
              Pending
            </TabBtn>
            <TabBtn active={tab === "add"} onClick={() => setTab("add")} primary>
              Add Friend
            </TabBtn>
          </nav>
        </header>

        {tab !== "add" && (
          <div className="friends-search">
            <SearchIcon />
            <input
              placeholder={
                tab === "online"
                  ? "Search online friends"
                  : tab === "pending"
                  ? "Search pending requests"
                  : "Search friends"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}

        <div className="friends-list-scroll">
          {tab === "add" ? (
            <AddFriendForm />
          ) : tab === "pending" ? (
            <PendingList query={query} />
          ) : (
            <FriendsList tab={tab} query={query} />
          )}
        </div>
      </div>

      <aside className="friends-active-now">
        <ActiveNowSidebar />
      </aside>
    </div>
  );
});

const TabBtn = observer(function TabBtn({
  active,
  onClick,
  children,
  badge,
  primary,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
  primary?: boolean;
}) {
  return (
    <button
      className={`friends-tab ${active ? "active" : ""} ${primary ? "primary" : ""}`}
      onClick={onClick}
    >
      {children}
      {badge != null && badge > 0 && <span className="badge">{badge}</span>}
    </button>
  );
});

const FriendsList = observer(function FriendsList({
  tab,
  query,
}: {
  tab: "online" | "all";
  query: string;
}) {
  let list = relationships.friends;
  if (tab === "online") {
    list = list.filter((r) => presence.isOnline(r.user.id));
  }
  if (query.trim()) {
    const q = query.toLowerCase();
    list = list.filter((r) =>
      (r.user.global_name ?? r.user.username).toLowerCase().includes(q)
    );
  }
  return (
    <div className="friends-list">
      <div className="friends-list-header">
        {tab === "online" ? "ONLINE" : "ALL FRIENDS"} — {list.length}
      </div>
      {list.length === 0 && (
        <div className="friends-empty muted">
          {tab === "online"
            ? "No friends are online."
            : "You don't have any friends yet."}
        </div>
      )}
      {list.map((r) => (
        <FriendRow key={r.user.id} rel={r} />
      ))}
    </div>
  );
});

const PendingList = observer(function PendingList({ query }: { query: string }) {
  let list = relationships.pending;
  if (query.trim()) {
    const q = query.toLowerCase();
    list = list.filter((r) =>
      (r.user.global_name ?? r.user.username).toLowerCase().includes(q)
    );
  }
  return (
    <div className="friends-list">
      <div className="friends-list-header">PENDING — {list.length}</div>
      {list.length === 0 && (
        <div className="friends-empty muted">No pending requests.</div>
      )}
      {list.map((r) => (
        <PendingRow key={r.user.id} rel={r} />
      ))}
    </div>
  );
});

const FriendRow = observer(function FriendRow({ rel }: { rel: Relationship }) {
  const name = rel.user.global_name ?? rel.user.username;
  const status = presence.getStatus(rel.user.id);
  const statusText = status === "offline" ? "" : status === "dnd" ? "Do Not Disturb" : status === "idle" ? "Idle" : "Online";
  return (
    <div
      className="friend-row"
      onContextMenu={(e) => {
        e.preventDefault();
        const items: ContextMenuItem[] = buildUserContextMenu(rel.user.id, e.clientX, e.clientY, rel);
        ui.openContextMenu(items, { x: e.clientX, y: e.clientY });
      }}
    >
      <button
        className="friend-row-main"
        onClick={(e) => ui.openProfile(rel.user.id, { x: e.clientX, y: e.clientY })}
      >
        <Avatar user={rel.user} size={32} showStatus />
        <div className="friend-row-text">
          <div className="friend-row-name nowrap">{name}</div>
          <div className="friend-row-status muted small nowrap">
            {statusText || `@${rel.user.username}`}
          </div>
        </div>
      </button>
      <div className="friend-row-actions">
        <ActionButton
          title="Message"
          onClick={() => openDmWithUser(rel.user.id).then((ch) => {
            ui.openChannel(ch.id);
          })}
        >
          <MessageIcon />
        </ActionButton>
        <ActionButton
          title="Remove Friend"
          onClick={() => relationships.remove(rel.user.id)}
        >
          <RemoveIcon />
        </ActionButton>
      </div>
    </div>
  );
});

function buildUserContextMenu(
  userId: string,
  x: number,
  y: number,
  rel?: Relationship,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    { kind: "action", label: "Profile", onClick: () => ui.openProfile(userId, { x, y }) },
  ];
  if (userId !== session.meId) {
    items.push({ kind: "action", label: "Message", onClick: () => openDmWithUser(userId).then((ch) => ui.openChannel(ch.id)) });
  }
  if (userId !== session.meId) {
    items.push({ kind: "separator" });
    if (!rel) {
      items.push({ kind: "action", label: "Add Friend", onClick: () => relationships.sendFriendRequest(userId).catch(() => {}) });
    } else if (rel.type === 1) {
      items.push({ kind: "action", label: "Remove Friend", danger: true, onClick: () => relationships.remove(userId).catch(() => {}) });
    } else if (rel.type === 3) {
      items.push({ kind: "action", label: "Accept Friend Request", onClick: () => relationships.sendFriendRequest(userId).catch(() => {}) });
      items.push({ kind: "action", label: "Ignore Friend Request", danger: true, onClick: () => relationships.remove(userId).catch(() => {}) });
    } else if (rel.type === 4) {
      items.push({ kind: "action", label: "Cancel Friend Request", danger: true, onClick: () => relationships.remove(userId).catch(() => {}) });
    } else if (rel.type === 2) {
      items.push({ kind: "action", label: "Unblock User", onClick: () => relationships.remove(userId).catch(() => {}) });
    } else {
      items.push({ kind: "action", label: "Block User", danger: true, onClick: () => relationships.block(userId).catch(() => {}) });
    }
  }
  items.push({ kind: "separator" });
  items.push({ kind: "action", label: "Copy User ID", onClick: () => navigator.clipboard?.writeText(userId).catch(() => {}) });
  return items;
}

const PendingRow = observer(function PendingRow({ rel }: { rel: Relationship }) {
  const name = rel.user.global_name ?? rel.user.username;
  const isIncoming = rel.type === 3;
  return (
    <div
      className="friend-row"
      onContextMenu={(e) => {
        e.preventDefault();
        const items: ContextMenuItem[] = buildUserContextMenu(rel.user.id, e.clientX, e.clientY, rel);
        ui.openContextMenu(items, { x: e.clientX, y: e.clientY });
      }}
    >
      <button
        className="friend-row-main"
        onClick={(e) => ui.openProfile(rel.user.id, { x: e.clientX, y: e.clientY })}
      >
        <Avatar user={rel.user} size={32} showStatus />
        <div className="friend-row-text">
          <div className="friend-row-name nowrap">{name}</div>
          <div className="friend-row-status muted small nowrap">
            {isIncoming ? "Incoming Request" : "Outgoing Request"} — @{rel.user.username}
          </div>
        </div>
      </button>
      <div className="friend-row-actions">
        {isIncoming ? (
          <ActionButton
            title="Accept"
            onClick={() => {
              relationships.sendFriendRequest(rel.user.id).catch(() => {});
            }}
          >
            <CheckIcon />
          </ActionButton>
        ) : (
          <ActionButton
            title="Cancel"
            onClick={() => relationships.remove(rel.user.id).catch(() => {})}
          >
            <XIcon />
          </ActionButton>
        )}
        <ActionButton
          title={isIncoming ? "Ignore" : "Cancel"}
          onClick={() => relationships.remove(rel.user.id).catch(() => {})}
        >
          <XIcon />
        </ActionButton>
      </div>
    </div>
  );
});

const AddFriendForm = observer(function AddFriendForm() {
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = input.trim();
    if (!target) return;
    try {
      // A bare snowflake is a user ID; anything else is treated as a username
      // (optionally `name#0000`) via the by-username endpoint.
      if (/^\d{15,}$/.test(target)) {
        await relationships.sendFriendRequest(target);
      } else {
        await relationships.addByUsername(target);
      }
      setMsg({ ok: true, text: "Friend request sent!" });
      setInput("");
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? "Failed to send friend request." });
    }
  };

  return (
    <div className="add-friend">
      <h2>Add a Friend</h2>
      <p className="muted">
        You can add friends with their username or user ID.
      </p>
      <form className="add-friend-form" onSubmit={submit}>
        <input
          placeholder="Username#0000 or user ID"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={!input.trim()}>
          Send Friend Request
        </button>
      </form>
      {msg && (
        <div className={`add-friend-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>
      )}
    </div>
  );
});

const ActiveNowSidebar = observer(function ActiveNowSidebar() {
  const active = relationships.friends.filter((r) => presence.isOnline(r.user.id)).slice(0, 12);
  return (
    <div className="active-now">
      <div className="active-now-title">Active Now</div>
      {active.length === 0 && (
        <div className="active-now-empty muted small">
          No one is active right now.
        </div>
      )}
      {active.map((r) => (
        <button
          key={r.user.id}
          className="active-now-row"
          onClick={() => openDmWithUser(r.user.id).then((ch) => {
            ui.openChannel(ch.id);
          })}
        >
          <Avatar user={r.user} size={32} showStatus />
          <div className="active-now-text">
            <div className="nowrap">{r.user.global_name ?? r.user.username}</div>
            <div className="muted small nowrap">@{r.user.username}</div>
          </div>
        </button>
      ))}
    </div>
  );
});

function ActionButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button className="friend-action-btn" title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function FriendsIcon() {
  return (
    <svg width="28" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 5a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-5l-4 4-4-4H3a3 3 0 0 1-3-3V5z" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function MessageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7l-5 4V4z" />
    </svg>
  );
}
function RemoveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}