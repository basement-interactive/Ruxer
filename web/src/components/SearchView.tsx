// SearchView: a message search modal. Opened from the channel header search
// button or Ctrl+Shift+F. Parses `from:/in:/has:` operators out of the query
// string into structured filters, calls `api.searchMessages`, and renders the
// hits as a list grouped by channel. Clicking a hit opens its channel.

import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { ui, toasts, messages, dms, relationships, guilds } from "../stores";
import { api } from "../api";
import type { Message, Snowflake } from "../types";
import { resolveUserName, resolveChannelName } from "../stores";
import { Avatar } from "./Avatar";
import "./SearchView.css";

interface ParsedQuery {
  text: string;
  authorId: Snowflake[];
  channelId: Snowflake[];
  has: string[];
}

export const SearchView = observer(function SearchView() {
  const open = ui.searchOpen;
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Message[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setTotal(null);
      setSearched(false);
      setIndexing(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ui.closeSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Debounced search: fire 300ms after the user stops typing.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      setTotal(null);
      setSearched(false);
      setIndexing(false);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => runSearch(q), 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const runSearch = async (raw: string) => {
    const parsed = parseQuery(raw);
    if (!parsed.text && parsed.authorId.length === 0 && parsed.channelId.length === 0 && parsed.has.length === 0) {
      setHits([]);
      setTotal(null);
      setSearched(false);
      setIndexing(false);
      return;
    }
    setSearching(true);
    try {
      const resp = await api.searchMessages({
        query: parsed.text,
        authorId: parsed.authorId.length ? parsed.authorId : undefined,
        channelId: parsed.channelId.length ? parsed.channelId : undefined,
        has: parsed.has.length ? parsed.has : undefined,
        limit: 25,
      });
      setHits(resp.hits.map((h) => h.message));
      setTotal(resp.total);
      setIndexing(!!resp.indexing);
      setSearched(true);
    } catch (e) {
      toasts.error("Search failed", String(e));
    } finally {
      setSearching(false);
    }
  };

  if (!open) return null;

  return (
    <div className="search-overlay" onClick={() => ui.closeSearch()}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-bar">
          <SearchIcon />
          <input
            ref={inputRef}
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…  from:user  in:#channel  has:attachment"
            autoFocus
            spellCheck={false}
          />
          <button className="search-close" title="Close" onClick={() => ui.closeSearch()}>
            ✕
          </button>
        </div>
        <div className="search-results">
          {searching && <div className="search-empty muted">Searching…</div>}
          {!searching && indexing && (
            <div className="search-empty muted">Messages are still being indexed. Try again shortly.</div>
          )}
          {!searching && !indexing && searched && hits.length === 0 && (
            <div className="search-empty muted">No results found.</div>
          )}
          {!searching && !indexing && !searched && (
            <div className="search-empty muted">
              Search by keyword. Use <code>from:user</code>, <code>in:#channel</code>,{" "}
              <code>has:attachment</code> to filter.
            </div>
          )}
          {hits.length > 0 && (
            <>
              {total != null && (
                <div className="search-count muted small">
                  {total} result{total === 1 ? "" : "s"}
                </div>
              )}
              {hits.map((m) => (
                <SearchHitRow key={m.id} message={m} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
});

const SearchHitRow = observer(function SearchHitRow({ message }: { message: Message }) {
  const channelLabel = resolveChannelName(message.channel_id) ?? "Unknown channel";
  const authorName = resolveUserName(message.author.id) ?? message.author.global_name ?? message.author.username;
  return (
    <button
      className="search-hit"
      onClick={() => {
        ui.openChannel(message.channel_id);
        ui.closeSearch();
      }}
    >
      <div className="search-hit-channel muted small nowrap">{channelLabel}</div>
      <div className="search-hit-row">
        <Avatar user={message.author} size={24} />
        <div className="search-hit-body">
          <span className="search-hit-author">{authorName}</span>
          <span className="search-hit-content nowrap">{message.content || "(attachment)"}</span>
        </div>
      </div>
    </button>
  );
});

/// Parse `from:/in:/has:` operators out of the raw query. Unknown operators
/// are left in the text portion (the server may support more than we parse).
/// `from:`/`in:` values that look like snowflakes pass through; names are
/// best-effort resolved against relationships, loaded-channel authors, and
/// known channels. Unresolved names are dropped (the keyword search still runs).
function parseQuery(raw: string): ParsedQuery {
  let text = "";
  const authorId: Snowflake[] = [];
  const channelId: Snowflake[] = [];
  const has: string[] = [];
  for (const part of raw.split(/\s+/)) {
    if (!part) continue;
    if (part.startsWith("from:")) {
      const v = part.slice(5);
      const id = resolveUserId(v);
      if (id) authorId.push(id);
    } else if (part.startsWith("in:")) {
      const v = part.slice(3);
      const id = resolveChannelId(v);
      if (id) channelId.push(id);
    } else if (part.startsWith("has:")) {
      const v = part.slice(4);
      // Normalize common aliases to the server's content-flag enum.
      if (v) has.push(v === "attachment" ? "file" : v);
    } else {
      text += (text ? " " : "") + part;
    }
  }
  return { text, authorId, channelId, has };
}

/// Resolve a `from:` token to a user id. Snowflakes (all digits) pass through;
/// otherwise best-effort match by username/global_name against relationships
/// and the authors of loaded messages.
function resolveUserId(token: string): Snowflake | undefined {
  if (!token) return undefined;
  if (/^\d+$/.test(token)) return token;
  const lower = token.toLowerCase();
  // Relationships (friends, blocked, etc.).
  const rel = relationships.relationships.find(
    (r) =>
      r.user.username?.toLowerCase() === lower ||
      r.user.global_name?.toLowerCase() === lower,
  );
  if (rel) return rel.user.id;
  // Authors of any loaded message.
  for (const list of messages.byChannel.values()) {
    const m = list.find(
      (x) =>
        x.author.username?.toLowerCase() === lower ||
        x.author.global_name?.toLowerCase() === lower,
    );
    if (m) return m.author.id;
  }
  return undefined;
}

/// Resolve an `in:` token to a channel id. Snowflakes pass through; names are
/// matched (case-insensitive, leading `#` stripped) against known channels —
/// DM channels + the channels of loaded guilds.
function resolveChannelId(token: string): Snowflake | undefined {
  if (!token) return undefined;
  const cleaned = token.replace(/^#/, "");
  if (/^\d+$/.test(cleaned)) return cleaned;
  const lower = cleaned.toLowerCase();
  // DM channels.
  const dm = dms.channels.find((c) => c.name?.toLowerCase() === lower);
  if (dm) return dm.id;
  // Guild channels from the guilds store.
  for (const g of guilds.guilds) {
    const ch = (g.channels ?? []).find((c) => c.name?.toLowerCase() === lower);
    if (ch) return ch.id;
  }
  return undefined;
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}