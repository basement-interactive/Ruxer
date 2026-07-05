// GuildsRail: the leftmost 72px column. Discord-style server rail with the
// Fluxer/home button, favorites, a divider, guild icons, and discover/add
// buttons at the bottom. Each icon morphs from circle to rounded square on
// hover/selection, with a white selection pill on the left edge.

import { observer } from "mobx-react-lite";
import { guilds, ui, toasts } from "../stores";
import { api } from "../api";
import type { ContextMenuItem } from "../stores";
import type { Guild } from "../types";
import { GuildIcon } from "../components/GuildIcon";
import "./GuildsRail.css";

// Index of the guild currently being dragged (HTML5 drag-and-drop reorder).
let dragSourceIndex: number | null = null;

export const GuildsRail = observer(function GuildsRail() {
  return (
    <nav className="guild-rail" aria-label="Servers">
      <div className="guild-rail-top">
        <RailButton
          label="Direct Messages"
          selected={ui.side === "dm" || ui.side === "friends"}
          onClick={() => ui.selectDm()}
          icon="home"
        />
        <div className="guild-rail-divider" />
      </div>

      <div className="guild-rail-list">
        {guilds.guilds.map((g, i) => (
          <GuildRailItem key={g.id} guild={g} index={i} />
        ))}
      </div>

      <div className="guild-rail-bottom">
        <RailButton label="Add a Server" icon="add" onClick={() => ui.openCreateGuild()} />
        <RailButton
          label="Discover"
          icon="discover"
          selected={ui.side === "discovery"}
          onClick={() => { ui.side = "discovery"; ui.selectedGuildIndex = null; }}
        />
      </div>
    </nav>
  );
});

const GuildRailItem = observer(function GuildRailItem({
  guild,
  index,
}: {
  guild: Guild;
  index: number;
}) {
  const selected = ui.side === "guild" && ui.selectedGuildIndex === index;
  // Unread state — check readState for this guild (simplified: show pill when
  // there are unread messages, matching GuildListItem.tsx:234).
  const hasUnread = false; // TODO: wire to GuildReadState.hasRead(guild.id)
  return (
    <div
      className={`guild-rail-item ${selected ? "selected" : ""} ${hasUnread ? "unread" : ""}`}
      draggable
      onDragStart={(e) => {
        dragSourceIndex = index;
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (dragSourceIndex != null && dragSourceIndex !== index) {
          guilds.reorderGuild(dragSourceIndex, index);
        }
        dragSourceIndex = null;
      }}
      onDragEnd={() => { dragSourceIndex = null; }}
      onContextMenu={(e) => {
        e.preventDefault();
        const items: ContextMenuItem[] = [
          {
            kind: "action",
            label: "Server Settings",
            onClick: () => ui.openGuildSettings(guild.id),
          },
          { kind: "action", label: "Mark as Read", onClick: () => {} },
          { kind: "separator" },
          {
            kind: "action",
            label: "Leave Server",
            danger: true,
            onClick: async () => {
              try {
                await api.leaveGuild(guild.id);
                import("mobx").then(({ runInAction }) =>
                  runInAction(() => {
                    guilds.guilds = guilds.guilds.filter((g) => g.id !== guild.id);
                  }),
                );
                if (ui.side === "guild") ui.selectDm();
                toasts.success(`Left "${guild.name}"`);
              } catch (err) {
                toasts.error("Failed to leave server", String(err));
              }
            },
          },
          { kind: "separator" },
          {
            kind: "action",
            label: "Report Server",
            danger: true,
            onClick: () => ui.openReport({ kind: "guild", guildId: guild.id }),
          },
          {
            kind: "action",
            label: "Copy Server ID",
            onClick: () => navigator.clipboard?.writeText(guild.id).catch(() => {}),
          },
        ];
        ui.openContextMenu(items, { x: e.clientX, y: e.clientY });
      }}
    >
      {/* Selection/unread pill indicator (GuildsLayout.module.css:286-304) */}
      {(selected || hasUnread) && <span className="guild-pill" />}
      <button
        className={`guild-rail-icon ${selected ? "selected" : ""}`}
        onClick={() => ui.selectGuild(index)}
        title={guild.name}
      >
        <GuildIcon guild={guild} size={44} />
      </button>
      <span className="guild-rail-tooltip">{guild.name}</span>
    </div>
  );
});

function RailButton({
  label,
  selected,
  onClick,
  icon,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
  icon: "home" | "add" | "discover";
}) {
  return (
    <div className={`guild-rail-item ${selected ? "selected" : ""}`}>
      {selected && <span className="guild-pill" />}
      <button
        className={`guild-rail-icon ${icon === "add" ? "add" : icon === "discover" ? "discover" : "home"} ${selected ? "selected" : ""}`}
        onClick={onClick}
        title={label}
      >
        <RailIcon kind={icon} />
      </button>
      <span className="guild-rail-tooltip">{label}</span>
    </div>
  );
}

function RailIcon({ kind }: { kind: "home" | "add" | "discover" }) {
  switch (kind) {
    case "home":
      return <HomeIcon />;
    case "add":
      return <AddPlusIcon />;
    case "discover":
      return <CompassIcon />;
  }
}

// Minimal inline SVG icons so we don't pull an icon library.
function HomeIcon() {
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" fill="currentColor">
      <path d="M23.111 7.5a11 11 0 0 0-1.085-1.9l1.393-1.393a1 1 0 0 0 0-1.414l-1.768-1.768a1 1 0 0 0-1.414 0L18.244 2.418A11 11 0 0 0 14 1.5c-1.5 0-2.9.3-4.2.85L7.7 2.418 6.3 1.018a1 1 0 0 0-1.414 0L3.118 3.786a1 1 0 0 0 0 1.414l1.393 1.393A11 11 0 0 0 3.426 7.5H1.5a1 1 0 0 0-1 1V11a1 1 0 0 0 1 1h1.6a11 11 0 0 0 .85 2.1L2.518 14.536a1 1 0 0 0 0 1.414l1.768 1.768a1 1 0 0 0 1.414 0L7.1 16.5a11 11 0 0 0 2.1.85V19a1 1 0 0 0 1 1h3.8a1 1 0 0 0 1-1v-1.6a11 11 0 0 0 2.1-.85l1.418 1.418a1 1 0 0 0 1.414 0l1.768-1.768a1 1 0 0 0 0-1.414L20.05 14.1a11 11 0 0 0 .85-2.1h1.6a1 1 0 0 0 1-1V8.5a1 1 0 0 0-1-1h-1.389zM14 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
    </svg>
  );
}
function CompassIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none" />
    </svg>
  );
}

function AddPlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="6" x2="12" y2="18" />
      <line x1="6" y1="12" x2="18" y2="12" />
    </svg>
  );
}

// The user area is rendered at the bottom of the ChannelSidebar (Discord-style).