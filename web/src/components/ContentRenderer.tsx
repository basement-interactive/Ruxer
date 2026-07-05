// ContentRenderer: parses a message's content into segments and renders them as
// styled React elements. Block-level markdown (headings, subtext, lists, fenced
// code blocks, masked links, tables, alerts, blockquotes) is parsed first into
// block nodes; the inline content within each block is then parsed with the
// shared inline parser (bold/italic/underline/strike/spoiler/inline-code,
// mentions, custom emoji, links, invites, timestamps). Mirrors the reference
// client's markdown renderers for 1:1 parity.

import { useMemo } from "react";
import { resolveUserName, resolveChannelName } from "../stores";
import type { Snowflake } from "../types";
import { emojiUrl } from "../utils";
import { useAssetUrl } from "../utils/mediaCache";
import { InviteEmbed } from "./InviteEmbed";
import "./ContentRenderer.css";

// ---------------------------------------------------------------------------
// Segment model
// ---------------------------------------------------------------------------

// Inline-level segments: the leaves rendered inside a paragraph, heading,
// list item, table cell, blockquote, alert, etc.
type InlineSegment =
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
  | { kind: "maskedLink"; label: InlineSegment[]; url: string }
  | { kind: "invite"; code: string; url: string }
  | { kind: "timestamp"; ts: string }
  | { kind: "newline" };

type AlertType = "note" | "tip" | "important" | "warning" | "caution";
type TableAlignment = "left" | "center" | "right" | "none";

// A list item can itself contain nested block content (nested lists).
type ListItemNode = { children: BlockSegment[]; ordinal?: number };

// Block-level segments: the top-level structure of a message.
type BlockSegment =
  | { kind: "paragraph"; segments: InlineSegment[] }
  | { kind: "heading"; level: 1 | 2 | 3; segments: InlineSegment[] }
  | { kind: "subtext"; segments: InlineSegment[] }
  | { kind: "list"; ordered: boolean; items: ListItemNode[] }
  | { kind: "codeBlock"; lang: string; code: string }
  | { kind: "blockquote"; children: BlockSegment[] }
  | { kind: "alert"; alertType: AlertType; children: BlockSegment[] }
  | { kind: "table"; header: InlineSegment[][]; alignments: TableAlignment[]; rows: InlineSegment[][][] };

// ---------------------------------------------------------------------------
// Public components
// ---------------------------------------------------------------------------

export function ContentRenderer({ content }: { content: string; messageId: Snowflake }) {
  const blocks = useMemo(() => parseBlocks(content), [content]);
  return <div className="content-rendered">{renderBlocks(blocks)}</div>;
}

/// A lightweight formatted-text renderer for embed fields (title, description,
/// field name/value). Runs the same block+inline parser as ContentRenderer so
/// embed text supports the full markdown feature set — matching how the official
/// client renders embed descriptions.
export function FormattedText({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return <>{renderBlocks(blocks)}</>;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderBlocks(blocks: BlockSegment[]): React.ReactNode {
  return blocks.map((b, i) => renderBlock(b, i));
}

function renderInlines(segments: InlineSegment[]): React.ReactNode {
  return segments.map((seg, i) => renderInline(seg, i));
}

function renderBlock(block: BlockSegment, key: number): React.ReactNode {
  switch (block.kind) {
    case "paragraph":
      return <span key={key}>{renderInlines(block.segments)}</span>;
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3";
      return (
        <Tag key={key} className={`md-heading md-h${block.level}`}>
          {renderInlines(block.segments)}
        </Tag>
      );
    }
    case "subtext":
      return (
        <small key={key} className="md-subtext">
          {renderInlines(block.segments)}
        </small>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      const start = block.items[0]?.ordinal ?? 1;
      return (
        <Tag key={key} className="md-list" start={block.ordered ? start : undefined}>
          {block.items.map((item, i) => (
            <li key={i} className="md-list-item">
              {renderBlocks(item.children)}
            </li>
          ))}
        </Tag>
      );
    }
    case "codeBlock":
      return <CodeBlock key={key} lang={block.lang} code={block.code} />;
    case "blockquote":
      return (
        <div key={key} className="blockquote-container">
          <div className="blockquote-divider" />
          <blockquote className="blockquote-content">{renderBlocks(block.children)}</blockquote>
        </div>
      );
    case "alert":
      return <Alert key={key} alertType={block.alertType} blocks={block.children} />;
    case "table":
      return <Table key={key} header={block.header} alignments={block.alignments} rows={block.rows} />;
  }
}

function renderInline(seg: InlineSegment, key: number): React.ReactNode {
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
      return (
        <code key={key} className="inline-code">
          {seg.text}
        </code>
      );
    case "userMention":
      return (
        <span key={key} className="mention">
          @{seg.resolved ?? seg.id}
        </span>
      );
    case "roleMention":
      return (
        <span key={key} className="mention">
          @{seg.id}
        </span>
      );
    case "channelMention":
      return (
        <span key={key} className="mention">
          {seg.resolved ?? `#${seg.id}`}
        </span>
      );
    case "everyone":
      return (
        <span key={key} className="mention">
          @everyone
        </span>
      );
    case "here":
      return (
        <span key={key} className="mention">
          @here
        </span>
      );
    case "customEmoji":
      return <CustomEmoji key={key} name={seg.name} id={seg.id} animated={seg.animated} />;
    case "link":
      return (
        <a key={key} href={seg.text} target="_blank" rel="noreferrer noopener" className="link">
          {seg.text}
        </a>
      );
    case "maskedLink":
      return (
        <a key={key} href={seg.url} target="_blank" rel="noreferrer noopener" className="link" title={seg.url}>
          {renderInlines(seg.label)}
        </a>
      );
    case "timestamp":
      return (
        <span key={key} className="timestamp">
          {formatTimestamp(seg.ts)}
        </span>
      );
    case "newline":
      return <br key={key} />;
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
// Code block: monospace + language label, with a lightweight tokenizer that
// stays dependency-free. Highlights strings, comments, numbers and a small set
// of common keywords when a recognized language is given; renders plain
// otherwise.
// ---------------------------------------------------------------------------

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const label = lang.trim();
  const tokens = useMemo(() => highlightCode(label.toLowerCase(), code), [label, code]);
  return (
    <div className="code-container">
      {label && <div className="code-lang">{label}</div>}
      <pre className="code-block">
        <code className="hljs">{tokens}</code>
      </pre>
    </div>
  );
}

const HL_KEYWORDS: Record<string, RegExp> = {
  keyword: /\b(?:const|let|var|function|fn|def|class|struct|enum|impl|trait|pub|use|import|from|export|default|return|if|else|elif|for|while|loop|match|switch|case|break|continue|async|await|yield|new|delete|typeof|instanceof|in|of|as|type|interface|extends|implements|public|private|protected|static|void|null|nil|None|true|false|self|this|super|then|do|end|then|where|mut|move|dyn|unsafe|package|func|go|defer|select|chan|map|range|try|catch|finally|throw|raise|with|lambda|pass|and|or|not|is)\b/g,
};

// Order matters — earlier patterns win the character range.
function highlightCode(lang: string, code: string): React.ReactNode {
  const supported = new Set([
    "js", "jsx", "ts", "tsx", "javascript", "typescript", "json", "rust", "rs",
    "python", "py", "go", "golang", "c", "cpp", "c++", "java", "kotlin", "kt",
    "css", "scss", "html", "xml", "sh", "bash", "shell", "sql", "php", "ruby", "rb",
    "swift", "yaml", "yml", "toml",
  ]);
  if (!lang || !supported.has(lang)) {
    return code;
  }

  // Token spans: [start, end, className]. Non-overlapping, left-to-right.
  type Span = { start: number; end: number; cls: string };
  const spans: Span[] = [];
  const claimed: boolean[] = new Array(code.length).fill(false);

  const claim = (start: number, end: number, cls: string) => {
    for (let i = start; i < end; i++) {
      if (claimed[i]) return false;
    }
    for (let i = start; i < end; i++) claimed[i] = true;
    spans.push({ start, end, cls });
    return true;
  };

  const runRegex = (re: RegExp, cls: string) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      claim(m.index, m.index + m[0].length, cls);
    }
  };

  // Strings and comments first (highest priority) so keywords inside them don't win.
  runRegex(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g, "hl-string");
  runRegex(/\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\//g, "hl-comment");
  runRegex(/\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, "hl-number");
  runRegex(HL_KEYWORDS.keyword, "hl-keyword");

  if (spans.length === 0) return code;

  spans.sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let cursor = 0;
  let k = 0;
  for (const span of spans) {
    if (span.start > cursor) out.push(<span key={`t${k++}`}>{code.slice(cursor, span.start)}</span>);
    out.push(
      <span key={`t${k++}`} className={span.cls}>
        {code.slice(span.start, span.end)}
      </span>,
    );
    cursor = span.end;
  }
  if (cursor < code.length) out.push(<span key={`t${k++}`}>{code.slice(cursor)}</span>);
  return out;
}

// ---------------------------------------------------------------------------
// Alert (GitHub-style callout)
// ---------------------------------------------------------------------------

function Alert({ alertType, blocks }: { alertType: AlertType; blocks: BlockSegment[] }) {
  const cfg = ALERT_CONFIG[alertType];
  return (
    <div className={`alert alert-${alertType}`}>
      <div className="alert-title">
        <span className="alert-icon">{cfg.icon}</span>
        {cfg.title}
      </div>
      <div className="alert-content">{renderBlocks(blocks)}</div>
    </div>
  );
}

const ALERT_CONFIG: Record<AlertType, { title: string; icon: React.ReactNode }> = {
  note: { title: "Note", icon: <IconInfo /> },
  tip: { title: "Tip", icon: <IconLightbulb /> },
  important: { title: "Important", icon: <IconWarning /> },
  warning: { title: "Warning", icon: <IconWarningOctagon /> },
  caution: { title: "Caution", icon: <IconWarningCircle /> },
};

// Inline SVG icons approximating the reference's phosphor icons. Kept
// dependency-free; sized to 1.25em and inheriting currentColor.
function svgProps() {
  return {
    width: "1.25em",
    height: "1.25em",
    viewBox: "0 0 256 256",
    fill: "currentColor",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true as const,
  };
}

function IconInfo() {
  return (
    <svg {...svgProps()}>
      <path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24Zm-4 48a12 12 0 1 1-12 12 12 12 0 0 1 12-12Zm12 112a16 16 0 0 1-16-16v-40a8 8 0 0 1 0-16 16 16 0 0 1 16 16v40a8 8 0 0 1 0 16Z" />
    </svg>
  );
}

function IconLightbulb() {
  return (
    <svg {...svgProps()}>
      <path d="M176 232a8 8 0 0 1-8 8H88a8 8 0 0 1 0-16h80a8 8 0 0 1 8 8Zm40-128a87.62 87.62 0 0 1-33.64 69.2A16.24 16.24 0 0 0 176 186v6a16 16 0 0 1-16 16H96a16 16 0 0 1-16-16v-6a16 16 0 0 0-6.23-12.66A87.59 87.59 0 0 1 40 104.49C39.74 56.83 78.26 17.14 125.88 16A88 88 0 0 1 216 104Z" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg {...svgProps()}>
      <path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24Zm-8 56a8 8 0 0 1 16 0v56a8 8 0 0 1-16 0Zm8 104a12 12 0 1 1 12-12 12 12 0 0 1-12 12Z" />
    </svg>
  );
}

function IconWarningOctagon() {
  return (
    <svg {...svgProps()}>
      <path d="M164.24 20H91.76a16 16 0 0 0-11.32 4.69L27.31 77.82A16 16 0 0 0 22.62 89.14v72.48a16 16 0 0 0 4.69 11.32l53.13 53.13A16 16 0 0 0 91.76 232h72.48a16 16 0 0 0 11.32-4.69l53.13-53.13a16 16 0 0 0 4.69-11.32V89.14a16 16 0 0 0-4.69-11.32L175.56 24.69A16 16 0 0 0 164.24 20ZM120 80a8 8 0 0 1 16 0v56a8 8 0 0 1-16 0Zm8 104a12 12 0 1 1 12-12 12 12 0 0 1-12 12Z" />
    </svg>
  );
}

function IconWarningCircle() {
  return (
    <svg {...svgProps()}>
      <path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24Zm-8 56a8 8 0 0 1 16 0v56a8 8 0 0 1-16 0Zm8 104a12 12 0 1 1 12-12 12 12 0 0 1-12 12Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function Table({
  header,
  alignments,
  rows,
}: {
  header: InlineSegment[][];
  alignments: TableAlignment[];
  rows: InlineSegment[][][];
}) {
  const alignClass = (i: number) => {
    switch (alignments[i]) {
      case "left":
        return "align-left";
      case "center":
        return "align-center";
      case "right":
        return "align-right";
      default:
        return undefined;
    }
  };
  return (
    <div className="table-container">
      <table className="md-table">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i} scope="col" className={["table-header", alignClass(i)].filter(Boolean).join(" ")}>
                {renderInlines(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td key={i} className={["table-cell", alignClass(i)].filter(Boolean).join(" ")}>
                  {renderInlines(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
// BLOCK PARSER
// ===========================================================================
//
// Splits content into lines, then walks line-by-line detecting block
// constructs. Text that isn't a recognized block is accumulated into a
// "paragraph" run (inline-parsed, with newlines preserved as <br>).

function parseBlocks(content: string): BlockSegment[] {
  const lines = content.split("\n");
  return parseBlockLines(lines);
}

function parseBlockLines(lines: string[]): BlockSegment[] {
  const blocks: BlockSegment[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    // Join with newlines; inline parser turns them into <br>.
    const text = paragraph.join("\n");
    blocks.push({ kind: "paragraph", segments: parseInline(text) });
    paragraph = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // --- Fenced code block ---
    const fence = matchFenceOpen(line);
    if (fence !== null) {
      flushParagraph();
      const { lang, closeMarker } = fence;
      const codeLines: string[] = [];
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        if (lines[j].trim() === closeMarker) {
          closed = true;
          break;
        }
        codeLines.push(lines[j]);
        j++;
      }
      if (closed) {
        blocks.push({ kind: "codeBlock", lang, code: codeLines.join("\n") });
        i = j + 1;
        continue;
      }
      // Unterminated fence: treat the opening line as ordinary text.
    }

    // --- Heading (# / ## / ###) ---
    const heading = matchHeading(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", level: heading.level, segments: parseInline(heading.text) });
      i++;
      continue;
    }

    // --- Subtext (-#) ---
    const subtext = matchSubtext(line);
    if (subtext !== null) {
      flushParagraph();
      blocks.push({ kind: "subtext", segments: parseInline(subtext) });
      i++;
      continue;
    }

    // --- Table ( | a | b |  +  | --- | --- | ) ---
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushParagraph();
      const table = parseTable(lines, i);
      if (table) {
        blocks.push(table.block);
        i = table.next;
        continue;
      }
    }

    // --- Blockquote / Alert ( > ) ---
    if (isBlockquoteLine(line)) {
      flushParagraph();
      const bq = collectBlockquote(lines, i);
      blocks.push(bq.block);
      i = bq.next;
      continue;
    }

    // --- Lists ( - / * / + / N. ) ---
    if (matchListItem(line)) {
      flushParagraph();
      const list = parseList(lines, i);
      blocks.push(list.block);
      i = list.next;
      continue;
    }

    // --- Otherwise: paragraph text ---
    paragraph.push(line);
    i++;
  }

  flushParagraph();
  return blocks;
}

// --- Fenced code blocks ---

function matchFenceOpen(line: string): { lang: string; closeMarker: string } | null {
  const m = line.match(/^(```+)([^`]*)$/);
  if (!m) return null;
  const fence = m[1];
  const lang = m[2].trim();
  // Language token can't contain backticks; the rest of the line is the lang.
  return { lang, closeMarker: fence };
}

// --- Headings ---

function matchHeading(line: string): { level: 1 | 2 | 3; text: string } | null {
  const m = line.match(/^(#{1,3})\s+(.+)$/);
  if (!m) return null;
  // Discord/Fluxer: a heading needs non-whitespace visible content. `# ` alone
  // (whitespace-only) stays plain text.
  const text = m[2];
  if (text.trim().length === 0) return null;
  return { level: m[1].length as 1 | 2 | 3, text };
}

// --- Subtext ---

function matchSubtext(line: string): string | null {
  const m = line.match(/^-#\s+(.+)$/);
  if (!m) return null;
  if (m[1].trim().length === 0) return null;
  return m[1];
}

// --- Tables ---

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.length > 1;
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  const cells = splitTableCells(t);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

// Split a `| a | b |` row into cell strings, honoring `\|` escapes.
function splitTableCells(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  const cells: string[] = [];
  let buf = "";
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "\\" && i + 1 < t.length && t[i + 1] === "|") {
      buf += "|";
      i++;
      continue;
    }
    if (t[i] === "|") {
      cells.push(buf);
      buf = "";
      continue;
    }
    buf += t[i];
  }
  cells.push(buf);
  return cells;
}

function parseAlignment(sep: string): TableAlignment {
  const s = sep.trim();
  const left = s.startsWith(":");
  const right = s.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "none";
}

function parseTable(
  lines: string[],
  start: number,
): { block: BlockSegment; next: number } | null {
  const headerCells = splitTableCells(lines[start]).map((c) => c.trim());
  const sepCells = splitTableCells(lines[start + 1]).map((c) => c.trim());
  const alignments = sepCells.map(parseAlignment);
  const colCount = headerCells.length;

  const rows: InlineSegment[][][] = [];
  let i = start + 2;
  while (i < lines.length && isTableRow(lines[i]) && !isTableSeparator(lines[i])) {
    const cells = splitTableCells(lines[i]).map((c) => c.trim());
    // Normalize to header column count.
    const row: InlineSegment[][] = [];
    for (let c = 0; c < colCount; c++) {
      row.push(parseInline(cells[c] ?? ""));
    }
    rows.push(row);
    i++;
  }

  const header = headerCells.map((c) => parseInline(c));
  // Pad alignments to column count.
  while (alignments.length < colCount) alignments.push("none");
  return {
    block: { kind: "table", header, alignments: alignments.slice(0, colCount), rows },
    next: i,
  };
}

// --- Blockquotes & alerts ---

function isBlockquoteLine(line: string): boolean {
  return line === ">" || line.startsWith("> ");
}

// Strip the leading `>` (and one optional space) from a blockquote line.
function stripQuote(line: string): string {
  if (line.startsWith("> ")) return line.slice(2);
  if (line === ">") return "";
  if (line.startsWith(">")) return line.slice(1);
  return line;
}

const ALERT_MARKERS: Record<string, AlertType> = {
  "[!NOTE]": "note",
  "[!TIP]": "tip",
  "[!IMPORTANT]": "important",
  "[!WARNING]": "warning",
  "[!CAUTION]": "caution",
};

function collectBlockquote(lines: string[], start: number): { block: BlockSegment; next: number } {
  const inner: string[] = [];
  let i = start;
  while (i < lines.length && isBlockquoteLine(lines[i])) {
    inner.push(stripQuote(lines[i]));
    i++;
  }

  // GitHub-style alert: first non-empty inner line is exactly `[!TYPE]`.
  const firstIdx = inner.findIndex((l) => l.trim().length > 0);
  if (firstIdx >= 0) {
    const marker = inner[firstIdx].trim();
    const alertType = ALERT_MARKERS[marker.toUpperCase()];
    if (alertType) {
      const body = inner.slice(firstIdx + 1);
      return {
        block: { kind: "alert", alertType, children: parseBlockLines(body) },
        next: i,
      };
    }
  }

  return {
    block: { kind: "blockquote", children: parseBlockLines(inner) },
    next: i,
  };
}

// --- Lists ---

type ListMatch = { indent: number; ordered: boolean; ordinal?: number; content: string };

function matchListItem(line: string): ListMatch | null {
  // Unordered: - / * / + followed by a space.
  let m = line.match(/^(\s*)([-*+])\s+(.*)$/);
  if (m) {
    return { indent: m[1].length, ordered: false, content: m[3] };
  }
  // Ordered: N. or N) followed by a space.
  m = line.match(/^(\s*)(\d{1,9})[.)]\s+(.*)$/);
  if (m) {
    return { indent: m[1].length, ordered: true, ordinal: parseInt(m[2], 10), content: m[3] };
  }
  return null;
}

// Parse a contiguous list starting at `start`. Handles nesting by indentation.
function parseList(lines: string[], start: number): { block: BlockSegment; next: number } {
  const first = matchListItem(lines[start])!;
  const baseIndent = first.indent;
  const ordered = first.ordered;
  const items: ListItemNode[] = [];

  let i = start;
  while (i < lines.length) {
    const m = matchListItem(lines[i]);
    if (!m) {
      // A blank line ends the list; other non-item lines also end it.
      break;
    }
    if (m.indent < baseIndent) break;
    if (m.indent > baseIndent) {
      // Deeper indentation belongs to the previous item as a nested list.
      const nested = parseList(lines, i);
      if (items.length > 0) {
        items[items.length - 1].children.push(nested.block);
      } else {
        // No parent item (shouldn't happen): treat as its own list.
        items.push({ children: [nested.block], ordinal: m.ordinal });
      }
      i = nested.next;
      continue;
    }
    if (m.ordered !== ordered) break; // switching list type ends this list

    // Same-level item: its content is the inline text (parsed as a paragraph).
    const itemBlocks: BlockSegment[] = [{ kind: "paragraph", segments: parseInline(m.content) }];
    items.push({ children: itemBlocks, ordinal: m.ordinal });
    i++;
  }

  return { block: { kind: "list", ordered, items }, next: i };
}

// ===========================================================================
// INLINE PARSER (ported from content.rs — bold/italic/underline/strike/
// spoiler/inline-code, mentions, custom emoji, links, masked links, invites,
// timestamps, and newlines). Runs on the text within a single block.
// ===========================================================================

function parseInline(content: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let textBuf = "";
  let pos = 0;

  while (pos < content.length) {
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

    // Newline (within a paragraph → <br>)
    if (remaining[0] === "\n") {
      flushText();
      segments.push({ kind: "newline" });
      pos += 1;
      continue;
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

    // Masked link: [label](url)
    if (remaining[0] === "[") {
      const masked = parseMaskedLink(remaining);
      if (masked) {
        flushText();
        segments.push(masked.seg);
        pos += masked.consumed;
        continue;
      }
    }

    // Formatting
    const fmt = parseFormatting(remaining);
    if (fmt) {
      flushText();
      const inner = parseInline(fmt.inner);
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

// Masked link [label](url) — label is inline-parsed; url is validated to be a
// safe http(s) URL (reuses the autolink safety trimming).
function parseMaskedLink(text: string): { consumed: number; seg: InlineSegment } | null {
  if (text[0] !== "[") return null;
  // Find matching ] (no nested brackets, allow escapes).
  let i = 1;
  let label = "";
  let closed = false;
  while (i < text.length) {
    if (text[i] === "\\" && i + 1 < text.length) {
      label += text[i + 1];
      i += 2;
      continue;
    }
    if (text[i] === "]") {
      closed = true;
      break;
    }
    if (text[i] === "\n") return null;
    label += text[i];
    i++;
  }
  if (!closed || label.length === 0) return null;
  // Next char must be '('.
  if (text[i + 1] !== "(") return null;
  let j = i + 2;
  let url = "";
  let closedParen = false;
  let depth = 0;
  while (j < text.length) {
    const c = text[j];
    if (c === "\n") return null;
    if (c === "(") {
      depth++;
      url += c;
      j++;
      continue;
    }
    if (c === ")") {
      if (depth > 0) {
        depth--;
        url += c;
        j++;
        continue;
      }
      closedParen = true;
      break;
    }
    url += c;
    j++;
  }
  if (!closedParen) return null;
  url = url.trim();
  // Only allow http(s) URLs whose full span is safe (matches the autolink
  // safety of the existing code — rejects whitespace, quotes, angle brackets).
  if (!/^https?:\/\//i.test(url)) return null;
  const safeUrl = parseUrl(url);
  if (!safeUrl || safeUrl.length !== url.length) return null;
  return {
    consumed: j + 1,
    seg: { kind: "maskedLink", label: parseInline(label), url },
  };
}

function parseFormatting(
  text: string,
): { consumed: number; inner: string; flags: StyleFlags } | null {
  if (text.length < 2) return null;
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

function parseAngle(text: string): { consumed: number; seg: InlineSegment } | null {
  const end = text.indexOf(">");
  if (end < 2) return null;
  const inner = text.slice(1, end);

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
  if (inner.startsWith("t:")) {
    const ts = inner.slice(2).split(":")[0];
    if (/^\d+$/.test(ts)) {
      return { consumed: end + 1, seg: { kind: "timestamp", ts } };
    }
  }
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
    if (c === "(") {
      parenDepth++;
      end++;
      continue;
    }
    if (c === ")") {
      if (parenDepth > 0) {
        parenDepth--;
        end++;
        continue;
      }
      break;
    }
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === '"' || c === "<" || c === ">") break;
    end++;
  }
  while (end > prefix && ".;:!?,".includes(text[end - 1])) end--;
  if (end <= prefix) return null;
  return text.slice(0, end);
}

/// Detect a Fluxer invite URL.
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
