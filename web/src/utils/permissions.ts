// Guild permission bitfield helpers.
//
// Permissions are a 64-bit bitfield transmitted as a decimal string. Bit
// positions follow the Discord-compatible scheme Fluxer uses. We model the
// field with BigInt (JS numbers lose precision past 2^53) and expose a small,
// curated set of the most commonly-edited flags for the role editor.

export interface PermissionFlag {
  key: string;
  label: string;
  bit: bigint;
}

// Curated subset shown in the role editor, in display order. The bit positions
// are the standard guild-permission positions; the full field has more flags
// that round-trip untouched through the editor.
export const PERMISSION_FLAGS: PermissionFlag[] = [
  { key: "ADMINISTRATOR", label: "Administrator", bit: 1n << 3n },
  { key: "MANAGE_GUILD", label: "Manage Server", bit: 1n << 5n },
  { key: "MANAGE_ROLES", label: "Manage Roles", bit: 1n << 28n },
  { key: "MANAGE_CHANNELS", label: "Manage Channels", bit: 1n << 4n },
  { key: "KICK_MEMBERS", label: "Kick Members", bit: 1n << 1n },
  { key: "BAN_MEMBERS", label: "Ban Members", bit: 1n << 2n },
  { key: "MODERATE_MEMBERS", label: "Timeout Members", bit: 1n << 40n },
  { key: "MANAGE_MESSAGES", label: "Manage Messages", bit: 1n << 13n },
  { key: "MENTION_EVERYONE", label: "Mention @everyone", bit: 1n << 17n },
  { key: "VIEW_AUDIT_LOG", label: "View Audit Log", bit: 1n << 7n },
  { key: "MANAGE_WEBHOOKS", label: "Manage Webhooks", bit: 1n << 29n },
  { key: "MANAGE_EXPRESSIONS", label: "Manage Emoji & Stickers", bit: 1n << 30n },
  { key: "CREATE_INSTANT_INVITE", label: "Create Invite", bit: 1n << 0n },
  { key: "VIEW_CHANNEL", label: "View Channels", bit: 1n << 10n },
  { key: "SEND_MESSAGES", label: "Send Messages", bit: 1n << 11n },
  { key: "CONNECT", label: "Connect (Voice)", bit: 1n << 20n },
  { key: "SPEAK", label: "Speak (Voice)", bit: 1n << 21n },
  { key: "MOVE_MEMBERS", label: "Move Members", bit: 1n << 24n },
];

/** Parse a permissions string (decimal) to a BigInt; 0 on empty/invalid. */
export function parsePermissions(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function hasPermission(bits: bigint, flag: bigint): boolean {
  return (bits & flag) === flag;
}

/** Toggle a single flag on a bitfield, returning the new bitfield. */
export function togglePermission(bits: bigint, flag: bigint, on: boolean): bigint {
  return on ? bits | flag : bits & ~flag;
}

export function permissionsToString(bits: bigint): string {
  return bits.toString();
}
