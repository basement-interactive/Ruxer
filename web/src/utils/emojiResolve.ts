// Emoji shortcode resolution: convert `:name:` tokens in message text into
// either a unicode glyph (for well-known shortcodes like `:smiley:` → `😊`) or
// a Discord-style custom-emoji reference `<:name:id>` / `<a:name:id>` (for
// guild custom emoji). Unknown `:name:` tokens are left untouched.
//
// Used by the Composer on send so messages are stored in a form every client
// can render (the web client, mobile, etc. all understand `<:name:id>` and the
// literal unicode char). This matches how Discord-family protocols work: bare
// `:name:` text is not auto-rendered by other clients, so we resolve at send
// time.

import type { Emoji, Snowflake } from "../types";
import { resolveShortcodeCi } from "../emoji-data";

/// A `:name:` token match inside a string: the start index, the name (without
/// colons), and the total token length (both colons included).
interface ShortcodeMatch {
  start: number;
  name: string;
  /** Length of the whole `:name:` token including both colons. */
  len: number;
}

/// Find all `:name:` tokens in `text`. Names are `[A-Za-z0-9_-]+`. Overlapping
/// or adjacent colons are handled by scanning left-to-right and skipping past a
/// consumed token.
export function findShortcodes(text: string): ShortcodeMatch[] {
  const out: ShortcodeMatch[] = [];
  let i = 0;
  while (i < text.length) {
    const colon = text.indexOf(":", i);
    if (colon < 0) break;
    // Read the name until the next colon.
    let j = colon + 1;
    while (j < text.length && /[\w-]/.test(text[j])) j++;
    // Need a closing colon immediately after the name, and a non-empty name.
    if (j > colon + 1 && text[j] === ":") {
      out.push({ start: colon, name: text.slice(colon + 1, j), len: j - colon + 1 });
      i = j + 1;
      continue;
    }
    i = colon + 1;
  }
  return out;
}

/// Resolve a single `:name:` against custom guild emoji first (case-insensitive
/// by name), then the unicode shortcode table. Returns the replacement string
/// or `null` when the name matches neither (caller leaves it intact).
export function resolveOne(
  name: string,
  customEmoji: Array<Emoji & { guildId: Snowflake; guildName: string }>,
): string | null {
  const lower = name.toLowerCase();
  // Custom guild emoji: case-insensitive name match. First match wins; Fluxer
  // emoji names are unique within a guild but can collide across guilds, so the
  // first one (arbitrary order) is acceptable for resolution.
  const custom = customEmoji.find((e) => e.name.toLowerCase() === lower);
  if (custom) {
    return custom.animated
      ? `<a:${custom.name}:${custom.id}>`
      : `<:${custom.name}:${custom.id}>`;
  }
  // Unicode shortcode table.
  const uni = resolveShortcodeCi(name);
  if (uni) return uni[1];
  return null;
}

/// Replace every resolvable `:name:` token in `text`. Tokens that match neither
/// a custom emoji nor a unicode shortcode are left as-is.
export function resolveShortcodesInText(
  text: string,
  customEmoji: Array<Emoji & { guildId: Snowflake; guildName: string }>,
): string {
  const matches = findShortcodes(text);
  if (matches.length === 0) return text;
  let result = "";
  let cursor = 0;
  for (const m of matches) {
    result += text.slice(cursor, m.start);
    const replacement = resolveOne(m.name, customEmoji);
    result += replacement ?? text.slice(m.start, m.start + m.len);
    cursor = m.start + m.len;
  }
  result += text.slice(cursor);
  return result;
}
