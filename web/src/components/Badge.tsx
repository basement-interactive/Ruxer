// Badge — ported from the real Fluxer client to produce identical visuals.
// Source: reference/fluxer/fluxer_app/src/features/ui/components/MentionBadge.module.css
//
// Re-authored clean (not AGPL-copied) but with every design value traced to the
// source file:line. Renders an unread/mention count pill.

import "./Badge.css";

export type BadgeSize = "small" | "medium";

export interface BadgeProps {
  count: number;
  size?: BadgeSize;
  /** When true, renders as a small dot (no count) — e.g. for unread without a count. */
  dot?: boolean;
  className?: string;
}

export function Badge({ count, size = "small", dot = false, className }: BadgeProps) {
  if (dot) {
    return <span className={`flx-badge flx-badge--dot ${className ?? ""}`} aria-label={`${count} unread`} />;
  }
  // Cap the displayed count at 99+ (matches the source's display behavior).
  const display = count > 99 ? "99+" : String(count);
  return (
    <span className={`flx-badge flx-badge--${size} ${className ?? ""}`} aria-label={`${count} unread`}>
      {display}
    </span>
  );
}