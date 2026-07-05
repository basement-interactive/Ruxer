// GuildIcon: renders a guild's icon image, or a colored square with the guild's
// initial when no icon is set. Loads via the cached media layer.

import type { Guild } from "../types";
import { guildIconUrl } from "../utils";
import { useAssetUrl } from "../utils/mediaCache";

export function GuildIcon({ guild, size = 48 }: { guild: Guild; size?: number }) {
  const url = guildIconUrl(guild);
  const src = useAssetUrl(url);

  if (src) {
    return (
      <img
        src={src}
        alt={guild.name}
        width={size}
        height={size}
        draggable={false}
        style={{ width: size, height: size, objectFit: "cover" }}
      />
    );
  }
  const initial = Array.from(guild.name.trim() || "?")[0] ?? "?";
  return (
    <span style={{ fontSize: size * 0.42, fontWeight: 600, color: "#fff" }}>
      {initial.toUpperCase()}
    </span>
  );
}