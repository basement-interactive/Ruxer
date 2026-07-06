// Markdown timestamp formatting (<t:epoch:style>). Style → Intl mappings,
// validation bounds and the relative-time unit ladder are traced to the
// reference client's date_utils package; implementation re-authored.

import { settings } from "../stores";

export type TimestampStyle =
  | "ShortTime"
  | "LongTime"
  | "ShortDate"
  | "LongDate"
  | "ShortDateTime"
  | "LongDateTime"
  | "ShortDateShortTime"
  | "ShortDateMediumTime"
  | "RelativeTime";

/// Style char → style. Only the FIRST char of the style part is matched
/// (so `<t:1:tt>` is valid); unknown chars invalidate the whole token.
export const TIMESTAMP_STYLE_BY_CHAR: Record<string, TimestampStyle> = {
  t: "ShortTime",
  T: "LongTime",
  d: "ShortDate",
  D: "LongDate",
  f: "ShortDateTime",
  F: "LongDateTime",
  s: "ShortDateShortTime",
  S: "ShortDateMediumTime",
  R: "RelativeTime",
};

/// Intl.DateTimeFormat options per style (RelativeTime has no absolute form).
const TIMESTAMP_STYLE_OPTIONS: Record<Exclude<TimestampStyle, "RelativeTime">, Intl.DateTimeFormatOptions> = {
  ShortTime: { hour: "numeric", minute: "numeric" },
  LongTime: { hour: "numeric", minute: "numeric", second: "numeric" },
  ShortDate: { year: "numeric", month: "numeric", day: "numeric" },
  LongDate: { month: "long", day: "numeric", year: "numeric" },
  ShortDateTime: { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric" },
  LongDateTime: { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric" },
  ShortDateShortTime: { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric" },
  ShortDateMediumTime: { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric", second: "numeric" },
};

/// Date-only styles never get an hour cycle.
const STYLES_WITHOUT_HOUR_CYCLE = new Set<TimestampStyle>(["ShortDate", "LongDate"]);

/// Locales that conventionally use 12-hour clocks (prefix match, lowercased).
const TWELVE_HOUR_LOCALES = [
  "en-us", "en-ca", "en-au", "en-nz", "en-ph", "en-in", "en-pk", "en-bd",
  "en-za", "es-mx", "es-co", "ar", "hi", "bn", "ur", "fil", "tl",
];

export function localeUses12Hour(locale: string): boolean {
  const l = locale.toLowerCase();
  return TWELVE_HOUR_LOCALES.some((p) => l.startsWith(p));
}

// Formatter caches — Intl formatter construction is expensive.
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function getDateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let f = dateFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    dateFormatters.set(key, f);
  }
  return f;
}

function getRelativeFormatter(locale: string, numeric: "auto" | "always"): Intl.RelativeTimeFormat {
  const key = `${locale}:${numeric}`;
  let f = relativeFormatters.get(key);
  if (!f) {
    f = new Intl.RelativeTimeFormat(locale, { numeric });
    relativeFormatters.set(key, f);
  }
  return f;
}

/// Validate + convert an epoch-seconds value. Null for anything a Date can't
/// represent (mirrors the reference's parse bounds: 0 and > 8.64e12 rejected
/// at tokenization; NaN dates rejected here).
export function getDateFromUnixTimestampSeconds(sec: number): Date | null {
  if (!Number.isFinite(sec)) return null;
  const date = new Date(sec * 1000);
  if (isNaN(date.getTime())) return null;
  return date;
}

/// Format an absolute timestamp per style.
export function formatTimestampWithStyle(
  sec: number,
  style: Exclude<TimestampStyle, "RelativeTime">,
  locale: string,
  hour12: boolean,
): string {
  const base = TIMESTAMP_STYLE_OPTIONS[style] ?? TIMESTAMP_STYLE_OPTIONS.ShortDateTime;
  const options = STYLES_WITHOUT_HOUR_CYCLE.has(style) ? base : { ...base, hour12 };
  return getDateFormatter(locale, options).format(new Date(sec * 1000));
}

// Shared "now" cached for 250ms so many chips in one render pass agree.
let sharedNow: Date | null = null;
let sharedNowAt = 0;
function getSharedNow(): Date {
  const t = Date.now();
  if (!sharedNow || t - sharedNowAt > 250) {
    sharedNow = new Date(t);
    sharedNowAt = t;
  }
  return sharedNow;
}

/// Relative phrase for a date. Unit ladder: years (>=365d) → months (>=30d) →
/// weeks (>=7d) → days → hours → minutes → seconds. numeric:"auto" yields
/// wordings like "tomorrow"; "always" forces "in 1 day" (tooltip line 2).
export function formatRelativeTime(
  date: Date,
  locale: string,
  numeric: "auto" | "always",
): string {
  const fmt = getRelativeFormatter(locale, numeric);
  const diffMs = date.getTime() - getSharedNow().getTime();
  const sign = diffMs < 0 ? -1 : 1;
  const absMs = Math.abs(diffMs);
  const absDays = Math.floor(absMs / 86_400_000);
  if (absDays >= 365) return fmt.format(sign * Math.floor(absDays / 365), "year");
  if (absDays >= 30) return fmt.format(sign * Math.floor(absDays / 30), "month");
  if (absDays >= 7) return fmt.format(sign * Math.floor(absDays / 7), "week");
  if (absDays > 0) return fmt.format(sign * absDays, "day");
  const absHours = Math.floor(absMs / 3_600_000);
  if (absHours > 0) return fmt.format(sign * absHours, "hour");
  const absMinutes = Math.floor(absMs / 60_000);
  if (absMinutes > 0) return fmt.format(sign * absMinutes, "minute");
  return fmt.format(sign * Math.floor(absMs / 1000), "second");
}

/// Tooltip line 1: full date + time with seconds, e.g.
/// "Sunday, June 28, 2026 9:41:30 AM".
export function getFormattedDateTimeWithSeconds(
  date: Date,
  locale: string,
  hour12: boolean,
): string {
  const datePart = getDateFormatter(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const timePart = getDateFormatter(locale, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12,
  }).format(date);
  return `${datePart} ${timePart}`;
}

/// The locale timestamps format with: the app's UI locale, falling back to the
/// browser locale (which carries the region needed for the 12/24h heuristic).
export function getTimestampLocale(): string {
  const l = settings.settings.locale;
  if (l && l !== "en") return l;
  return navigator.language || "en";
}

export function getHour12(): boolean {
  return localeUses12Hour(getTimestampLocale());
}
