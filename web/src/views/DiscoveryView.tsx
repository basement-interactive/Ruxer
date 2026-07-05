// DiscoveryView: a page for browsing public communities (guilds). Shows a
// search bar, category filters, and guild cards with join buttons.
// Source: reference/fluxer/fluxer_app/src/features/discovery/discovery/DiscoveryPage.tsx

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { api } from "../api";
import { guilds, ui, toasts } from "../stores";
import type { DiscoveryGuild, DiscoveryCategory } from "../types";
import "./DiscoveryView.css";

export const DiscoveryView = observer(function DiscoveryView() {
  const [categories, setCategories] = useState<DiscoveryCategory[]>([]);
  const [guildList, setGuildList] = useState<DiscoveryGuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | undefined>(undefined);
  const [joining, setJoining] = useState<string | null>(null);

  // Load categories on mount.
  useEffect(() => {
    api.discoveryCategories()
      .then((cats) => setCategories(cats ?? []))
      .catch(() => {});
  }, []);

  // Load guilds when query/category changes (debounced).
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      api.discoveryGuilds(activeCategory, query || undefined)
        .then((g) => setGuildList(g ?? []))
        .catch(() => setGuildList([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, activeCategory]);

  const joinGuild = async (guild: DiscoveryGuild) => {
    setJoining(guild.id);
    try {
      await api.discoveryJoin(guild.id);
      toasts.success(`Joined "${guild.name}"`);
    } catch (e) {
      toasts.error("Failed to join", String(e));
    } finally {
      setJoining(null);
    }
  };

  return (
    <div className="discovery-view">
      <div className="discovery-header">
        <h1 className="discovery-title">Explore Communities</h1>
        <p className="discovery-subtitle muted">
          Find public communities to join.
        </p>
      </div>
      <div className="discovery-controls">
        <input
          className="discovery-search"
          placeholder="Search communities"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="discovery-categories">
          <button
            className={`discovery-cat ${!activeCategory ? "active" : ""}`}
            onClick={() => setActiveCategory(undefined)}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`discovery-cat ${activeCategory === c.id ? "active" : ""}`}
              onClick={() => setActiveCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="discovery-grid">
        {loading && <div className="discovery-loading muted">Loading communities…</div>}
        {!loading && guildList.length === 0 && (
          <div className="discovery-empty muted">No communities found.</div>
        )}
        {guildList.map((g) => (
          <DiscoveryCard
            key={g.id}
            guild={g}
            onJoin={() => joinGuild(g)}
            joining={joining === g.id}
          />
        ))}
      </div>
      <button className="discovery-close" onClick={() => ui.selectDm()} title="Back to Home">
        ✕
      </button>
    </div>
  );
});

const DiscoveryCard = observer(function DiscoveryCard({
  guild,
  onJoin,
  joining,
}: {
  guild: DiscoveryGuild;
  onJoin: () => void;
  joining: boolean;
}) {
  const alreadyJoined = guilds.guilds.some((g) => g.id === guild.id);
  const media = "";
  const iconUrl = guild.icon ? `${media}/icons/${guild.id}/${guild.icon}.webp?size=128` : null;

  return (
    <div className="discovery-card">
      <div className="discovery-card-icon">
        {iconUrl ? (
          <img src={iconUrl} alt="" className="discovery-card-img" />
        ) : (
          <div className="discovery-card-fallback">
            {Array.from(guild.name)[0]?.toUpperCase() ?? "?"}
          </div>
        )}
      </div>
      <div className="discovery-card-info">
        <div className="discovery-card-name">{guild.name}</div>
        {guild.description && (
          <div className="discovery-card-desc muted small">{guild.description}</div>
        )}
        <div className="discovery-card-stats muted small">
          {guild.approximate_member_count != null && `${guild.approximate_member_count.toLocaleString()} members`}
          {guild.approximate_presence_count != null && ` · ${guild.approximate_presence_count.toLocaleString()} online`}
        </div>
      </div>
      <button
        className="discovery-card-join"
        disabled={joining || alreadyJoined}
        onClick={onJoin}
      >
        {alreadyJoined ? "Joined" : joining ? "Joining…" : "Join"}
      </button>
    </div>
  );
});