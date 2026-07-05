// Avatar — ported from the real Fluxer client to produce identical visuals.
// Source:
//   - reference/fluxer/fluxer_app/src/features/ui/components/BaseAvatar.tsx
//   - reference/fluxer/fluxer_app/src/features/ui/components/BaseAvatar.module.css
//   - reference/fluxer/fluxer_app/scripts/GenerateAvatarMasks.ts (STATUS_CONFIG + calculateStatusGeometry)
//   - reference/fluxer/fluxer_app/src/features/ui/constants/TypingConstants.ts
//
// The real client renders the avatar + status dot as a single SVG with a mask
// cutout: a white circle (the avatar) with a black circle (the status cutout)
// punched out of the bottom-right corner, then the status color fills the
// cutout's inner area. This re-creates that anatomy exactly, citing every
// value from the source files above.
//
// Re-authored clean (not AGPL-copied). Identical pixels: yes. Copy-pasted
// AGPL files: no.

import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import { presence } from "../stores";
import type { User } from "../types";
import { avatarUrl } from "../utils";
import { useAssetUrl } from "../utils/mediaCache";
import "./Avatar.css";

// Per-size status geometry from GenerateAvatarMasks.ts:21-33 + calculateStatusGeometry.
// innerRadius = statusSize/2; outerRadius = cutoutRadius; borderWidth = cutoutRadius - innerRadius;
// cx = cy = cutoutCenter. (GenerateAvatarMasks.ts:128-143)
interface StatusGeom {
  statusSize: number;
  innerRadius: number;
  outerRadius: number;
  borderWidth: number;
  cx: number;
  cy: number;
}
const STATUS_CONFIG: Record<number, { statusSize: number; cutoutRadius: number; cutoutCenter: number }> = {
  // GenerateAvatarMasks.ts:21-33
  16: { statusSize: 10, cutoutRadius: 5, cutoutCenter: 13 },
  20: { statusSize: 10, cutoutRadius: 5, cutoutCenter: 17 },
  24: { statusSize: 10, cutoutRadius: 7, cutoutCenter: 20 },
  32: { statusSize: 10, cutoutRadius: 8, cutoutCenter: 27 },
  36: { statusSize: 10, cutoutRadius: 8, cutoutCenter: 30 },
  40: { statusSize: 12, cutoutRadius: 9, cutoutCenter: 34 },
  44: { statusSize: 14, cutoutRadius: 10, cutoutCenter: 38 },
  48: { statusSize: 14, cutoutRadius: 10, cutoutCenter: 42 },
  56: { statusSize: 16, cutoutRadius: 11, cutoutCenter: 49 },
  80: { statusSize: 16, cutoutRadius: 16 / 2 + 16 * 0.2, cutoutCenter: 68 },
  120: { statusSize: 24, cutoutRadius: 24 / 2 + 24 * 0.2, cutoutCenter: 100 },
};

function getStatusGeom(size: number): StatusGeom {
  // Exact match or interpolate (GenerateAvatarMasks.ts:63-104).
  const cfg = STATUS_CONFIG[size];
  if (cfg) {
    const innerRadius = cfg.statusSize / 2;
    const outerRadius = cfg.cutoutRadius;
    const borderWidth = cfg.cutoutRadius - innerRadius;
    return { statusSize: cfg.statusSize, innerRadius, outerRadius, borderWidth, cx: cfg.cutoutCenter, cy: cfg.cutoutCenter };
  }
  // Fallback: interpolate between nearest sizes (GenerateAvatarMasks.ts:67-83).
  const sizes = Object.keys(STATUS_CONFIG).map(Number).sort((a, b) => a - b);
  const upper = sizes.find((s) => s > size) ?? sizes[sizes.length - 1];
  const lower = sizes[sizes.indexOf(upper) - 1] ?? sizes[0];
  const progress = (size - lower) / (upper - lower);
  const lc = STATUS_CONFIG[lower];
  const uc = STATUS_CONFIG[upper];
  const statusSize = lc.statusSize + (uc.statusSize - lc.statusSize) * progress;
  const cutoutRadius = lc.cutoutRadius + (uc.cutoutRadius - lc.cutoutRadius) * progress;
  const cutoutCenter = lc.cutoutCenter + (uc.cutoutCenter - lc.cutoutCenter) * progress;
  const innerRadius = statusSize / 2;
  const outerRadius = cutoutRadius;
  const borderWidth = cutoutRadius - innerRadius;
  return { statusSize, innerRadius, outerRadius, borderWidth, cx: cutoutCenter, cy: cutoutCenter };
}

// supportsStatus = size > 16 (AvatarStatusLayout.ts:42)
function supportsStatus(size: number): boolean {
  return size > 16;
}

export const Avatar = observer(function Avatar({
  user,
  size = 40,
  className = "",
  showStatus = false,
  speaking = false,
}: {
  user: User;
  size?: number;
  className?: string;
  showStatus?: boolean;
  /// When true, draws the green speaking ring (voice active-speaker indicator).
  speaking?: boolean;
}) {
  const url = avatarUrl(user);
  const src = useAssetUrl(url);
  const status = showStatus ? presence.getStatus(user.id) : "offline";
  const geom = useMemo(() => getStatusGeom(size), [size]);
  const showDot = showStatus && supportsStatus(size) && status !== "offline";
  const statusColor = `var(--status-${status})`;
  // The border ring color: the avatar's surrounding background. The real
  // client's mask leaves a ring of the background color between the avatar
  // circle and the status dot (the cutout's outerRadius > innerRadius). We
  // render that ring explicitly with the background color.
  const ringColor = "var(--background-secondary)";

  const initials = userInitials(user);
  const color = authorColor(user.id);

  const maskId = useMemo(() => `flx-avatar-mask-${size}-${user.id.slice(0, 6)}`, [size, user.id]);
  const r = size / 2;
  const viewBox = `0 0 ${size} ${size}`;

  return (
    <div
      className={`flx-avatar ${speaking ? "flx-avatar--speaking" : ""} ${className}`}
      style={{
        width: `${size / 16}rem`,
        height: `${size / 16}rem`,
        minWidth: `${size / 16}rem`,
        minHeight: `${size / 16}rem`,
      }}
    >
      <svg viewBox={viewBox} className="flx-avatar__svg" aria-hidden role="presentation">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={size}>
            <circle fill="white" cx={r} cy={r} r={r} />
            {showDot && (
              <circle fill="black" cx={geom.cx} cy={geom.cy} r={geom.outerRadius} />
            )}
          </mask>
        </defs>
        {src ? (
          <image
            href={src}
            width={size}
            height={size}
            mask={`url(#${maskId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <rect
            x={0}
            y={0}
            width={size}
            height={size}
            fill={color}
            mask={`url(#${maskId})`}
          />
        )}
      </svg>
      {!src && (
        <div className="flx-avatar__fallback" style={{ background: color }}>
          {initials}
        </div>
      )}
      {showDot && (
        <span
          className={`flx-avatar__status flx-avatar__status--${status}`}
          style={{
            width: `${geom.statusSize / 16}rem`,
            height: `${geom.statusSize / 16}rem`,
            right: `${(size - geom.cx - geom.statusSize / 2) / 16}rem`,
            bottom: `${(size - geom.cy - geom.statusSize / 2) / 16}rem`,
            borderColor: ringColor,
            borderWidth: `${geom.borderWidth / 16}rem`,
            background: statusColor,
          }}
        />
      )}
    </div>
  );
});

function userInitials(user: User): string {
  const name = user.global_name ?? user.username;
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  const chars = words.slice(0, 2).map((w) => Array.from(w)[0] ?? "");
  return chars.join("").toUpperCase();
}

function authorColor(id: string): string {
  const colors = [
    "#5865f2", "#eb459e", "#f0b232", "#57f287", "#fee75c",
    "#ed4245", "#eb459e", "#5865f2", "#23a55a", "#f0b232",
  ];
  let hash = 0;
  for (const ch of String(id)) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}