// Utility functions: image URL builders + formatting helpers.

import type { Guild, User, Snowflake } from "./types";
import { session } from "./stores";

/// Build the image URL for a user avatar. Returns the cache-key candidate.
export function avatarUrl(user: User): string {
  const media = session.endpoints?.media ?? "";
  if (user.avatar) {
    return `${media}/avatars/${user.id}/${user.avatar}.webp?size=128`;
  }
  // Default avatar from static CDN.
  const staticCdn = session.endpoints?.static_cdn ?? "";
  if (!staticCdn) return "";
  const idx = bigMod(user.id, 6);
  return `${staticCdn}/avatars/${idx}.png`;
}

/// Build the image URL for a guild icon.
export function guildIconUrl(guild: Guild): string {
  const media = session.endpoints?.media ?? "";
  if (!guild.icon) return "";
  const ext = guild.icon.startsWith("a_") ? "gif" : "webp";
  return `${media}/icons/${guild.id}/${guild.icon}.${ext}?size=128`;
}

/// Build the image URL for a custom emoji.
export function emojiUrl(emojiId: Snowflake, animated: boolean): string {
  const media = session.endpoints?.media ?? "";
  const ext = animated ? "gif" : "webp";
  return `${media}/emojis/${emojiId}.${ext}`;
}

/// Parse a snowflake as a big integer and return `id % mod` without BigInt
/// precision issues for small mods.
export function bigMod(id: Snowflake, mod: number): number {
  // Snowflakes are 64-bit; JS numbers lose precision past 2^53. Do modular
  // reduction digit-by-digit on the decimal string.
  let r = 0;
  for (const ch of id) {
    r = (r * 10 + (ch.charCodeAt(0) - 48)) % mod;
  }
  return r;
}

/// Format an ISO timestamp as a short "Today at HH:MM" / "MM/DD/YYYY" string.
export function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = formatTime(date);
  if (sameDay) return `Today at ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString())
    return `Yesterday at ${time}`;
  return `${date.toLocaleDateString()} ${time}`;
}

/// Format just the time portion: "HH:MM AM/PM".
export function formatTime(date: Date): string {
  let h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/// A short relative time for DM list timestamps.
export function shortTime(ts: string): string {
  const date = new Date(ts);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24 && date.toDateString() === now.toDateString())
    return formatTime(date);
  return date.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
  });
}
