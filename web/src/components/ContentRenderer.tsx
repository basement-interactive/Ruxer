// ContentRenderer: parses a message's content into segments (text, formatting,
// mentions, custom emoji, links, timestamps) and renders them as styled React
// elements. Ports the Rust `content.rs` parser to the frontend.

import { useMemo } from "react";
import { resolveUserName, resolveChannelName } from "../stores";
import type { Snowflake } from "../types";
import { emojiUrl } from "../utils";
import { useAssetUrl } from "../utils/mediaCache";
import { InviteEmbed } from "./InviteEmbed";
import "./ContentRenderer.css";

type Segment =
  | { kind: "text"; text: string }
  | { kind: "styled"; text: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean; spoiler: boolean }
  | { kind: "code"; text: string }
  | { kind: "userMention"; id: string; resolved?: string }
  | { kind: "roleMention"; id: string }
  | { kind: "channelMention"; id: string; resolved?: string }
  | { kind: "everyone" }
  | { kind: "here" }
  | { kind: "customEmoji"; name: string; id: string; animated: boolean }
  | { kind: "link"; text: string }
  | { kind: "invite"; code: string; url: string }
  | { kind: "timestamp"; ts: string }
  | { kind: "newline" }
  | { kind: "blockquote"; segments: Segment[] };

export function ContentRenderer({ content }: { content: string; messageId: Snowflake }) {
  const segments = useMemo(() => parseContent(content), [content]);
  return (
    <div className="content-rendered">
      {renderSegments(segments)}
    </div>
  );
}

/// Render an array of segments (shared by ContentRenderer + blockquotes).
function renderSegments(segments: Segment[]): React.ReactNode {
  return segments.map((seg, i) => renderSegment(seg, i));
}

/// A lightweight formatted-text renderer for embed fields (title, description,
/// field name/value). Runs the same parser as ContentRenderer so embed text
/// supports `**bold**`, `*italic*`, `__underline__`, `~~strike~~`, `||spoiler||`,
/// `` `code` ``, and `>` blockquotes — matching how the official client renders
/// embed descriptions. Mention/emoji/invite resolution still runs (resolves
/// against the loaded stores), but embeds typically only carry plain text.
export function FormattedText({ text }: { text: string }) {
  const segments = useMemo(() => parseContent(text), [text]);
  return <>{renderSegments(segments)}</>;
}

function renderSegment(seg: Segment, key: number): React.ReactNode {
  switch (seg.kind) {
    case "text":
      return <span key={key}>{seg.text}</span>;
    case "styled": {
      let el: React.ReactNode = seg.text;
      if (seg.bold) el = <strong key={key}>{el}</strong>;
      if (seg.italic) el = <em key={key}>{el}</em>;
      if (seg.underline) el = <u key={key}>{el}</u>;
      if (seg.strike) el = <s key={key}>{el}</s>;
      if (seg.spoiler) {
        return (
          <span key={key} className="spoiler">
            {seg.text}
          </span>
        );
      }
      return <span key={key}>{el}</span>;
    }
    case "code":
      return <code key={key} className="inline-code">{seg.text}</code>;
    case "userMention":
      return (
        <span key={key} className="mention">
          @{seg.resolved ?? seg.id}
        </span>
      );
    case "roleMention":
      return <span key={key} className="mention">@{seg.id}</span>;
    case "channelMention":
      return <span key={key} className="mention">{seg.resolved ?? `#${seg.id}`}</span>;
    case "everyone":
      return <span key={key} className="mention">@everyone</span>;
    case "here":
      return <span key={key} className="mention">@here</span>;
    case "customEmoji":
      return <CustomEmoji key={key} name={seg.name} id={seg.id} animated={seg.animated} />;
    case "link":
      return (
        <a
          key={key}
          href={seg.text}
          target="_blank"
          rel="noreferrer noopener"
          className="link"
        >
          {seg.text}
        </a>
      );
    case "timestamp":
      return <span key={key} className="timestamp">{formatTimestamp(seg.ts)}</span>;
    case "newline":
      return <br key={key} />;
    case "blockquote":
      return <blockquote key={key} className="blockquote">{renderSegments(seg.segments)}</blockquote>;
    case "invite":
      return <InviteEmbed key={key} code={seg.code} url={seg.url} />;
  }
}

// Custom emoji: loads via the cached media layer.
function CustomEmoji({ name, id, animated }: { name: string; id: string; animated: boolean }) {
  const url = emojiUrl(id, animated);
  return <EmojiImage url={url} name={name} size={22} />;
}

function EmojiImage({ url, name, size }: { url: string; name: string; size: number }) {
  const src = useAssetUrl(url);
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        draggable={false}
        style={{ verticalAlign: "middle", display: "inline-block" }}
      />
    );
  }
  return <span className="muted">:{name}:</span>;
}

// ---------------------------------------------------------------------------
// Parser (ported from content.rs)
// ---------------------------------------------------------------------------

function parseContent(content: string): Segment[] {
  const segments: Segment[] = [];
  let textBuf = "";
  let pos = 0;
  const bytes = content;

  while (pos < bytes.length) {
    const remaining = content.slice(pos);

    // Escape
    if (remaining[0] === "\\" && pos + 1 < content.length) {
      const next = content[pos + 1];
      if ("\\*_~|`>[]()#-.!\"'".includes(next)) {
        textBuf += next;
        pos += 2;
        continue;
      }
    }

    // Newline
    if (remaining[0] === "\n") {
      flushText();
      segments.push({ kind: "newline" });
      pos += 1;
      continue;
    }

    // Blockquote: a `>` at the start of a line (pos 0 or just after a newline).
    // Consumes consecutive `> `-prefixed lines into one blockquote segment.
    if (remaining[0] === ">" && (pos === 0 || content[pos - 1] === "\n")) {
      const block = collectBlockquote(content, pos);
      if (block) {
        flushText();
        segments.push({ kind: "blockquote", segments: parseContent(block.inner) });
        pos += block.consumed;
        continue;
      }
    }

    // Inline code
    if (remaining[0] === "`") {
      const end = findClosingBacktick(remaining, 1);
      if (end >= 0) {
        flushText();
        segments.push({ kind: "code", text: remaining.slice(1, end) });
        pos += end + 1;
        continue;
      }
    }

    // Formatting
    const fmt = parseFormatting(remaining);
    if (fmt) {
      flushText();
      // Recursively parse inner content.
      const inner = parseContent(fmt.inner);
      // If inner is all plain text, emit one styled run.
      if (inner.every((s) => s.kind === "text")) {
        const combined = inner.map((s) => (s.kind === "text" ? s.text : "")).join("");
        segments.push({ kind: "styled", text: combined, ...fmt.flags });
      } else {
        for (const s of inner) {
          if (s.kind === "styled") {
            segments.push({
              ...s,
              bold: s.bold || fmt.flags.bold,
              italic: s.italic || fmt.flags.italic,
              underline: s.underline || fmt.flags.underline,
              strike: s.strike || fmt.flags.strike,
              spoiler: s.spoiler || fmt.flags.spoiler,
            });
          } else {
            segments.push(s);
          }
        }
      }
      pos += fmt.consumed;
      continue;
    }

    // Angle-bracket constructs
    if (remaining[0] === "<") {
      const angle = parseAngle(remaining);
      if (angle) {
        flushText();
        segments.push(angle.seg);
        pos += angle.consumed;
        continue;
      }
    }

    // @everyone / @here
    if (remaining.startsWith("@everyone")) {
      flushText();
      segments.push({ kind: "everyone" });
      pos += 9;
      continue;
    }
    if (remaining.startsWith("@here")) {
      flushText();
      segments.push({ kind: "here" });
      pos += 5;
      continue;
    }

    // URL autolink
    if (remaining.startsWith("https://") || remaining.startsWith("http://")) {
      const url = parseUrl(remaining);
      if (url) {
        flushText();
        // Invite link? Render a custom joinable embed instead of a plain link.
        const invite = parseInviteUrl(url);
        if (invite) {
          segments.push({ kind: "invite", code: invite.code, url });
        } else {
          segments.push({ kind: "link", text: url });
        }
        pos += url.length;
        continue;
      }
    }

    // Normal char (handle multi-byte via Array.from for safety)
    const ch = Array.from(remaining)[0];
    textBuf += ch;
    pos += ch.length;
  }

  flushText();
  return segments;

  function flushText() {
    if (textBuf) {
      segments.push({ kind: "text", text: textBuf });
      textBuf = "";
    }
  }
}

type StyleFlags = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  spoiler: boolean;
};

function parseFormatting(
  text: string
): { consumed: number; inner: string; flags: StyleFlags } | null {
  if (text.length < 2) return null;
  // ***bold italic*** or ___bold italic___
  if (text.startsWith("***") || text.startsWith("___")) {
    const marker = text.slice(0, 3);
    const end = findClosing(text, marker, 3);
    if (end >= 0) {
      return {
        consumed: end + 3,
        inner: text.slice(3, end),
        flags: { bold: true, italic: true, underline: false, strike: false, spoiler: false },
      };
    }
  }
  // ||spoiler||
  if (text.startsWith("||")) {
    const end = findClosing(text, "||", 2);
    if (end >= 0) {
      return {
        consumed: end + 2,
        inner: text.slice(2, end),
        flags: { bold: false, italic: false, underline: false, strike: false, spoiler: true },
      };
    }
  }
  // ~~strikethrough~~
  if (text.startsWith("~~")) {
    const end = findClosing(text, "~~", 2);
    if (end >= 0) {
      return {
        consumed: end + 2,
        inner: text.slice(2, end),
        flags: { bold: false, italic: false, underline: false, strike: true, spoiler: false },
      };
    }
  }
  // **bold**
  if (text.startsWith("**")) {
    const end = findClosing(text, "**", 2);
    if (end >= 0) {
      return {
        consumed: end + 2,
        inner: text.slice(2, end),
        flags: { bold: true, italic: false, underline: false, strike: false, spoiler: false },
      };
    }
  }
  // __underline__
  if (text.startsWith("__")) {
    const end = findClosing(text, "__", 2);
    if (end >= 0) {
      return {
        consumed: end + 2,
        inner: text.slice(2, end),
        flags: { bold: false, italic: false, underline: true, strike: false, spoiler: false },
      };
    }
  }
  // *italic* / _italic_ (single char, with flanking check)
  if (text[0] === "*") {
    const end = findClosingSingle(text, "*");
    if (end >= 0) {
      return {
        consumed: end + 1,
        inner: text.slice(1, end),
        flags: { bold: false, italic: true, underline: false, strike: false, spoiler: false },
      };
    }
  }
  if (text[0] === "_" && !isWordUnderscore(text, 0)) {
    const end = findClosingSingle(text, "_");
    if (end >= 0) {
      return {
        consumed: end + 1,
        inner: text.slice(1, end),
        flags: { bold: false, italic: true, underline: false, strike: false, spoiler: false },
      };
    }
  }
  return null;
}

function findClosing(text: string, marker: string, start: number): number {
  let pos = start;
  while (pos + marker.length <= text.length) {
    if (text[pos] === "\\") {
      pos += 2;
      continue;
    }
    if (text.slice(pos, pos + marker.length) === marker) {
      return pos;
    }
    pos += 1;
  }
  return -1;
}

function findClosingSingle(text: string, marker: string): number {
  let pos = 1;
  while (pos < text.length) {
    if (text[pos] === "\\") {
      pos += 2;
      continue;
    }
    if (text[pos] === marker) {
      // Skip if part of a double marker (** or __)
      if (pos + 1 < text.length && text[pos + 1] === marker) {
        pos += 2;
        continue;
      }
      return pos;
    }
    pos += 1;
  }
  return -1;
}

function findClosingBacktick(text: string, start: number): number {
  let pos = start;
  while (pos < text.length) {
    if (text[pos] === "\n") return -1;
    if (text[pos] === "\\") {
      pos += 2;
      continue;
    }
    if (text[pos] === "`") return pos;
    pos += 1;
  }
  return -1;
}

function isWordUnderscore(text: string, pos: number): boolean {
  const prev = pos > 0 ? text[pos - 1] : "";
  const next = pos + 1 < text.length ? text[pos + 1] : "";
  const isWord = (c: string) => /[a-z0-9_]/i.test(c);
  return isWord(prev) && isWord(next);
}

function parseAngle(
  text: string
): { consumed: number; seg: Segment } | null {
  const end = text.indexOf(">");
  if (end < 2) return null;
  const inner = text.slice(1, end);

  // Custom emoji <:name:id> or <a:name:id>
  if (inner.startsWith(":")) {
    const split = splitEmoji(inner.slice(1));
    if (split) {
      return {
        consumed: end + 1,
        seg: { kind: "customEmoji", name: split.name, id: split.id, animated: false },
      };
    }
  }
  if (inner.startsWith("a:")) {
    const split = splitEmoji(inner.slice(2));
    if (split) {
      return {
        consumed: end + 1,
        seg: { kind: "customEmoji", name: split.name, id: split.id, animated: true },
      };
    }
  }
  // Timestamp <t:epoch[:style]>
  if (inner.startsWith("t:")) {
    const ts = inner.slice(2).split(":")[0];
    if (/^\d+$/.test(ts)) {
      return { consumed: end + 1, seg: { kind: "timestamp", ts } };
    }
  }
  // User mention <@id> or <@!id>
  if (inner.startsWith("@!")) {
    const rest = inner.slice(2);
    if (/^\d+$/.test(rest)) {
      return {
        consumed: end + 1,
        seg: { kind: "userMention", id: rest, resolved: resolveUserName(rest) },
      };
    }
  }
  if (inner.startsWith("@")) {
    const rest = inner.slice(1);
    if (/^\d+$/.test(rest)) {
      return {
        consumed: end + 1,
        seg: { kind: "userMention", id: rest, resolved: resolveUserName(rest) },
      };
    }
    if (rest.startsWith("&")) {
      const roleId = rest.slice(1);
      if (/^\d+$/.test(roleId)) {
        return { consumed: end + 1, seg: { kind: "roleMention", id: roleId } };
      }
    }
  }
  // Channel mention <#id>
  if (inner.startsWith("#")) {
    const rest = inner.slice(1);
    if (/^\d+$/.test(rest)) {
      return {
        consumed: end + 1,
        seg: { kind: "channelMention", id: rest, resolved: resolveChannelName(rest) },
      };
    }
  }
  return null;
}

function splitEmoji(s: string): { name: string; id: string } | null {
  const colon = s.indexOf(":");
  if (colon < 0) return null;
  const name = s.slice(0, colon);
  const id = s.slice(colon + 1);
  if (!name || !id) return null;
  if (!/^[\w-]+$/.test(name)) return null;
  if (!/^\d+$/.test(id)) return null;
  return { name, id };
}

function parseUrl(text: string): string | null {
  const prefix = text.startsWith("https://") ? 8 : text.startsWith("http://") ? 7 : 0;
  if (!prefix) return null;
  let end = prefix;
  let parenDepth = 0;
  while (end < text.length) {
    const c = text[end];
    if (c === "(") { parenDepth++; end++; continue; }
    if (c === ")") {
      if (parenDepth > 0) { parenDepth--; end++; continue; }
      break;
    }
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === '"' || c === "<" || c === ">") break;
    end++;
  }
  // Trim trailing punctuation
  while (end > prefix && ".;:!?,".includes(text[end - 1])) end--;
  if (end <= prefix) return null;
  return text.slice(0, end);
}

/// Collect a blockquote starting at `pos`. Returns the inner text (with the `>`
/// prefixes stripped) + the number of characters consumed (covering all
/// consecutive `>`-prefixed lines). Returns null when `pos` doesn't point at a
/// `>` line.
function collectBlockquote(content: string, pos: number): { inner: string; consumed: number } | null {
  if (content[pos] !== ">") return null;
  let i = pos;
  let inner = "";
  while (i < content.length) {
    if (content[i] !== ">") break;
    // Skip the `>` and an optional single space.
    i += 1;
    if (content[i] === " ") i += 1;
    // Read to end of line.
    const nl = content.indexOf("\n", i);
    const lineEnd = nl < 0 ? content.length : nl;
    inner += content.slice(i, lineEnd);
    if (nl < 0) { i = content.length; break; }
    // Include the newline in the inner text + consume it.
    inner += "\n";
    i = nl + 1;
    // A blank line ends the blockquote.
    if (content[i] !== ">") break;
  }
  // Trim a trailing newline from inner (the last line didn't need it).
  if (inner.endsWith("\n")) inner = inner.slice(0, -1);
  return { inner, consumed: i - pos };
}

/// Detect a Fluxer invite URL. Matches `https://fluxer.gg/{code}`,
/// `https://fluxer.app/invite/{code}`, and bare `/invite/{code}`. Returns the
/// invite code, or null when the URL isn't an invite.
function parseInviteUrl(url: string): { code: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "fluxer.gg" && host !== "fluxer.app") return null;
    const m = u.pathname.match(/^\/(?:invite\/)?([A-Za-z0-9]+)$/);
    if (!m) return null;
    return { code: m[1] };
  } catch {
    return null;
  }
}

function formatTimestamp(ts: string): string {
  const secs = parseInt(ts, 10);
  if (isNaN(secs)) return `<t:${ts}>`;
  const date = new Date(secs * 1000);
  return date.toLocaleString();
}