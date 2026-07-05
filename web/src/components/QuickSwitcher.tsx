// QuickSwitcher: a Cmd-K palette that fuzzy-matches DMs + guild channels and
// navigates to the selected one. The list is built from the guilds + dms
// stores; typing filters by channel/DM name. Arrow keys move the selection,
// Enter opens, Escape closes.

import { observer } from "mobx-react-lite";
import { useEffect, useMemo, useRef, useState } from "react";
import { guilds, dms, ui } from "../stores";
import { dmLabel } from "../stores";
import type { Guild, Snowflake } from "../types";
import { channelType } from "../types";
import "./QuickSwitcher.css";

/// A single navigable entry in the switcher list.
interface SwitcherEntry {
  key: string;
  label: string;
  hint: string;
  kind: "dm" | "channel";
  channelId: Snowflake;
  guildId: Snowflake | null;
  guildIndex: number | null;
}

export const QuickSwitcher = observer(function QuickSwitcher() {
  const open = ui.quickSwitcherOpen;
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build the full entry list from stores. Recomputed when the stores change
  // (observer tracks the maps/arrays we read).
  const entries: SwitcherEntry[] = useMemo(() => buildEntries(), [guilds.guilds, dms.channels, guilds.channelsByGuild]);

  // Reset selection + query + focus when opening.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSel(0);
      // Focus on the next tick so the input is mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on Escape; navigate on Enter; arrows move the selection.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      ui.closeQuickSwitcher();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(filtered.length - 1, s + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const entry = filtered[sel];
      if (entry) goTo(entry);
      return;
    }
  };

  if (!open) return null;

  const filtered = filterEntries(entries, query);
  // Clamp selection to the filtered list.
  const safeSel = Math.min(sel, Math.max(0, filtered.length - 1));

  return (
    <div className="quick-switcher-overlay" onClick={() => ui.closeQuickSwitcher()}>
      <div className="quick-switcher" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="quick-switcher-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSel(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Find or start a conversation…"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="quick-switcher-list">
          {filtered.length === 0 && (
            <div className="quick-switcher-empty muted">No results.</div>
          )}
          {filtered.map((entry, i) => (
            <button
              key={entry.key}
              className={`quick-switcher-row ${i === safeSel ? "selected" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => goTo(entry)}
            >
              <span className="quick-switcher-label nowrap">{entry.label}</span>
              <span className="quick-switcher-hint muted small nowrap">{entry.hint}</span>
            </button>
          ))}
        </div>
        <div className="quick-switcher-footer muted small">
          <span>↑↓ to navigate</span>
          <span>↵ to open</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );

  function goTo(entry: SwitcherEntry) {
    if (entry.guildIndex != null) ui.selectGuild(entry.guildIndex);
    ui.openChannel(entry.channelId);
    ui.closeQuickSwitcher();
  }
});

/// Build the full list of switcher entries from the stores. DMs first, then
/// each guild's text + voice channels.
function buildEntries(): SwitcherEntry[] {
  const out: SwitcherEntry[] = [];
  // DMs.
  for (const c of dms.channels) {
    out.push({
      key: `dm:${c.id}`,
      label: dmLabel(c),
      hint: "Direct Messages",
      kind: "dm",
      channelId: c.id,
      guildId: null,
      guildIndex: null,
    });
  }
  // Guild channels.
  guilds.guilds.forEach((g: Guild, i: number) => {
    const chs = guilds.channelsByGuild.get(g.id) ?? [];
    for (const c of chs) {
      // Only surface navigable channels (text + voice). Categories aren't
      // destinations.
      if (c.type !== channelType.GUILD_TEXT && c.type !== channelType.GUILD_VOICE) continue;
      out.push({
        key: `g:${g.id}:c:${c.id}`,
        label: c.name ?? "unnamed",
        hint: g.name,
        kind: "channel",
        channelId: c.id,
        guildId: g.id,
        guildIndex: i,
      });
    }
  });
  return out;
}

/// Case-insensitive substring filter with a light fuzzy rank: entries whose
/// label starts with the query sort first, then contains, then the rest.
function filterEntries(entries: SwitcherEntry[], query: string): SwitcherEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.slice(0, 50);
  const matched = entries.filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      e.hint.toLowerCase().includes(q),
  );
  // Rank: starts-with > contains. Stable within each bucket by original order.
  const startsWith: SwitcherEntry[] = [];
  const contains: SwitcherEntry[] = [];
  for (const e of matched) {
    if (e.label.toLowerCase().startsWith(q)) startsWith.push(e);
    else contains.push(e);
  }
  return [...startsWith, ...contains].slice(0, 50);
}