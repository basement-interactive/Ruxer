// ForwardModal: searchable multi-destination picker for forwarding a message.
// Reference parity: features/messaging/components/modals/ForwardModal.tsx —
// search over DMs + guild text/voice channels, up to 5 destinations, optional
// comment (sent as a follow-up plain message per destination), Send navigates
// to the destination when exactly one was chosen (Shift-click skips that).

import { observer } from "mobx-react-lite";
import { useMemo, useState } from "react";
import { ui, dms, guilds, messages, toasts, dmLabel } from "../stores";
import { channelType, type Snowflake, type User } from "../types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import "./ForwardModal.css";

const MAX_DESTINATIONS = 5;
const MAX_COMMENT = 2000;

/// A forwardable destination assembled from the stores.
type Destination = {
  key: string;
  channelId: Snowflake;
  /// Primary display name (# channel name or DM label).
  name: string;
  /// Secondary line: "{guild} • {category}" for guild channels, "Direct
  /// Messages" for DMs — or the disable reason when not sendable.
  secondary: string;
  kind: "dm" | "group" | "text" | "voice";
  /// DM recipient for the avatar (single DMs only).
  recipient?: User;
  guildIndex: number | null;
  /// Non-null when the destination can't receive the forward.
  disableReason: string | null;
  /// Source channel sorts last (it stays pickable — matches reference).
  isSource: boolean;
};

export const ForwardModal = observer(function ForwardModal() {
  const message = ui.forwardTarget;
  if (!message) return null;

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<Snowflake>>(new Set());
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  const entries = useMemo(() => buildDestinations(message.channel_id), [message.channel_id]);
  const shown = useMemo(() => filterDestinations(entries, query), [entries, query]);

  const toggle = (d: Destination) => {
    if (d.disableReason) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(d.channelId)) next.delete(d.channelId);
      else if (next.size < MAX_DESTINATIONS) next.add(d.channelId);
      return next;
    });
  };

  const close = () => {
    ui.closeForward();
  };

  const handleSend = async (skipNavigation: boolean) => {
    if (selected.size === 0 || sending) return;
    setSending(true);
    const targets = [...selected];
    try {
      await messages.forward(targets, message, comment.trim() || undefined);
      toasts.success("Message forwarded");
      close();
      // Single destination: jump there (unless Shift was held).
      if (!skipNavigation && targets.length === 1) {
        const dest = entries.find((e) => e.channelId === targets[0]);
        if (dest) {
          if (dest.guildIndex != null) ui.selectGuild(dest.guildIndex);
          ui.openChannel(dest.channelId);
        }
      }
    } catch {
      toasts.error("Failed to forward message", "We couldn't forward the message at this time.");
      setSending(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title="Forward message"
      size="small"
      className="forward-modal"
      footer={
        <>
          <button className="forward-btn-secondary" onClick={close}>
            Cancel
          </button>
          <button
            className="forward-btn-primary"
            disabled={selected.size === 0 || sending}
            onClick={(e) => handleSend(e.shiftKey)}
          >
            Send ({selected.size}/{MAX_DESTINATIONS})
          </button>
        </>
      }
    >
      <div className="forward-search">
        <SearchIcon />
        <input
          className="forward-search-input"
          placeholder="Search channels or DMs"
          maxLength={100}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className="forward-list">
        {shown.length === 0 && <div className="forward-empty">No channels found</div>}
        {shown.map((d) => {
          const isSelected = selected.has(d.channelId);
          const capped = !isSelected && selected.size >= MAX_DESTINATIONS;
          const disabled = !!d.disableReason || capped;
          return (
            <button
              key={d.key}
              className={
                "forward-item" + (isSelected ? " selected" : "") + (disabled ? " disabled" : "")
              }
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => toggle(d)}
            >
              <span className="forward-item-content">
                <DestinationIcon dest={d} />
                <span className="forward-item-info">
                  <span className="forward-item-name nowrap">{d.name}</span>
                  {(d.disableReason ?? d.secondary) && (
                    <span className="forward-item-secondary nowrap">
                      {d.disableReason ?? d.secondary}
                    </span>
                  )}
                </span>
              </span>
              <span className={"forward-check" + (isSelected ? " on" : "")} aria-hidden>
                {isSelected && <CheckIcon />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="forward-comment">
        <textarea
          className="forward-comment-input"
          placeholder="Add a comment (optional)"
          maxLength={MAX_COMMENT}
          value={comment}
          rows={1}
          onChange={(e) => setComment(e.target.value)}
        />
        {comment.length > 0 && (
          <span className="forward-comment-count muted small">
            {comment.length}/{MAX_COMMENT}
          </span>
        )}
      </div>
    </Modal>
  );
});

/// Assemble the destination list: DMs (already last-activity ordered) first,
/// then each guild's text/voice channels alphabetically. The source channel
/// sorts last; unsendable channels sort after sendable ones. (The reference
/// sorts by recent-visit order — the custom UI has no recents store, so DM
/// activity order + alphabetical guild channels is the documented fallback.)
function buildDestinations(sourceChannelId: Snowflake): Destination[] {
  const out: Destination[] = [];
  const SEND_MESSAGES = 1n << 11n;

  for (const c of dms.channels) {
    const group = c.type === channelType.GROUP_DM || c.recipients.length > 1;
    out.push({
      key: `dm:${c.id}`,
      channelId: c.id,
      name: dmLabel(c) || "Unnamed",
      secondary: "Direct Messages",
      kind: group ? "group" : "dm",
      recipient: !group ? c.recipients[0] : undefined,
      guildIndex: null,
      disableReason: null,
      isSource: c.id === sourceChannelId,
    });
  }

  guilds.guilds.forEach((g, i) => {
    const chs = guilds.channelsByGuild.get(g.id) ?? [];
    const canSend = guilds.canModerateGuild(g.id, SEND_MESSAGES);
    const sorted = chs
      .filter((c) => c.type === channelType.GUILD_TEXT || c.type === channelType.GUILD_VOICE)
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    for (const c of sorted) {
      const category = c.parent_id ? chs.find((p) => p.id === c.parent_id)?.name : undefined;
      out.push({
        key: `g:${g.id}:c:${c.id}`,
        channelId: c.id,
        name: c.name ?? "unnamed",
        secondary: [g.name, category].filter(Boolean).join(" • "),
        kind: c.type === channelType.GUILD_VOICE ? "voice" : "text",
        guildIndex: i,
        disableReason: canSend
          ? null
          : 'You need the "Send Messages" permission to send messages in this channel',
        isSource: c.id === sourceChannelId,
      });
    }
  });

  // Stable partition: available first, then disabled, source always last.
  return out.sort((a, b) => {
    if (a.isSource !== b.isSource) return a.isSource ? 1 : -1;
    const aOff = a.disableReason ? 1 : 0;
    const bOff = b.disableReason ? 1 : 0;
    return aOff - bOff;
  });
}

function filterDestinations(entries: Destination[], query: string): Destination[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) => e.name.toLowerCase().includes(q) || e.secondary.toLowerCase().includes(q),
  );
}

function DestinationIcon({ dest }: { dest: Destination }) {
  if (dest.kind === "dm" && dest.recipient) {
    return (
      <span className="forward-item-icon">
        <Avatar user={dest.recipient} size={32} />
      </span>
    );
  }
  return (
    <span className="forward-item-icon">
      {dest.kind === "group" ? <GroupIcon /> : dest.kind === "voice" ? <SpeakerIcon /> : <HashIcon />}
    </span>
  );
}

// Icons (inline SVG, house style: no icon dependency).
function SearchIcon() {
  return (
    <svg className="forward-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}
function HashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="9" y1="4" x2="7" y2="20" />
      <line x1="17" y1="4" x2="15" y2="20" />
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="3.5" y1="15" x2="19.5" y2="15" />
    </svg>
  );
}
function SpeakerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 3.4v17.2c0 .9-1.06 1.36-1.7.74L6.6 17H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2.6l4.7-4.34c.64-.62 1.7-.16 1.7.74z" />
      <path d="M16 8.5a4.5 4.5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18.5 6a8 8 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function GroupIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-7 1.7-7 4v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2c0-2.3-3.7-4-7-4z" />
      <path d="M17 11a3 3 0 1 0-2-5.24A5.98 5.98 0 0 1 15 7c0 1.2-.35 2.3-.96 3.24.55.48 1.24.76 1.96.76zm2.5 2.6c1.5.75 2.5 1.86 2.5 3.4v2a1 1 0 0 1-1 1h-3v-2c0-1.77-.8-3.23-2.06-4.31.98-.3 2.18-.34 3.56-.09z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 12.5 9.5 18 20 6" />
    </svg>
  );
}
