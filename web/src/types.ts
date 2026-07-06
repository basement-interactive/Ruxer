// Types mirroring the Rust `fluxer::models` structs. Kept in sync by hand.

export type Snowflake = string;

export interface User {
  id: Snowflake;
  username: string;
  discriminator: string;
  global_name?: string | null;
  avatar?: string | null;
  avatar_color?: number | null;
  bot?: boolean;
  system?: boolean;
  flags?: number;
}

export interface UserPrivate {
  id: Snowflake;
  username: string;
  discriminator: string;
  global_name?: string | null;
  avatar?: string | null;
  avatar_color?: number | null;
  bot?: boolean;
  system?: boolean;
  flags?: number;
  email?: string | null;
  verified?: boolean;
  mfa_enabled?: boolean;
  bio?: string | null;
  pronouns?: string | null;
  banner?: string | null;
  accent_color?: number | null;
  premium_type?: number | null;
}

export interface Role {
  id: Snowflake;
  name: string;
  color: number;
  position: number;
  permissions: string;
  hoist?: boolean;
  mentionable?: boolean;
}

export interface Emoji {
  id: Snowflake;
  name: string;
  animated?: boolean;
  nsfw?: boolean;
}

// Premium/subscription state from GET /premium/state. Loosely typed — only the
// fields the UI renders are modeled; the rest pass through.
export interface PremiumState {
  effective?: {
    is_premium?: boolean;
    premium_type?: number | null;
    premium_since?: string | null;
    premium_until?: string | null;
    premium_will_cancel?: boolean;
    premium_billing_cycle?: string | null;
    self_hosted?: boolean;
  } | null;
  actual?: {
    has_active_paid_premium?: boolean;
    is_visionary?: boolean;
    has_ever_purchased?: boolean;
  } | null;
  billing?: Record<string, unknown> | null;
  pricing?: Record<string, unknown> | null;
}

export interface AuditLogChange {
  key: string;
  old_value?: unknown;
  new_value?: unknown;
}

export interface AuditLogEntry {
  id: Snowflake;
  action_type: number;
  user_id?: Snowflake | null;
  target_id?: Snowflake | null;
  reason?: string | null;
  options?: Record<string, unknown> | null;
  changes?: AuditLogChange[] | null;
}

export interface AuditLog {
  audit_log_entries: AuditLogEntry[];
  users?: User[];
  webhooks?: Webhook[];
}

export interface Webhook {
  id: Snowflake;
  type?: number;
  guild_id?: Snowflake | null;
  channel_id?: Snowflake | null;
  name?: string | null;
  avatar?: string | null;
  avatar_hash?: string | null;
  user?: User | null;
}

/// A custom guild sticker.
export interface Sticker {
  id: Snowflake;
  name: string;
  description?: string | null;
  tags?: string | null;
  asset?: string;
  format_type?: number;
  guild_id?: Snowflake | null;
}

export interface Guild {
  id: Snowflake;
  name: string;
  icon?: string | null;
  banner?: string | null;
  splash?: string | null;
  owner_id: Snowflake;
  features?: string[];
  verification_level?: number;
  nsfw?: boolean;
  member_count?: number | null;
  online_count?: number | null;
  roles: Role[];
  emojis: Emoji[];
  channels: Channel[];
}

export const channelType = {
  GUILD_TEXT: 0,
  DM: 1,
  GUILD_VOICE: 2,
  GROUP_DM: 3,
  GUILD_CATEGORY: 4,
  // Personal-notes self-DM channel. Fluxer assigns every user exactly one
  // DM_PERSONAL_NOTES channel (surfaced via list_private_channels). The exact
  // integer is server-determined; we identify the notes channel by type when
  // known, else by a self-DM whose only recipient is the current user.
  DM_PERSONAL_NOTES: 5,
  GUILD_LINK: 998,
} as const;

export interface PermissionOverwrite {
  id: Snowflake;
  type: number;
  allow: string;
  deny: string;
}

export interface Channel {
  id: Snowflake;
  type: number;
  name?: string | null;
  topic?: string | null;
  guild_id?: string | null;
  owner_id?: string | null;
  parent_id?: string | null;
  last_message_id?: string | null;
  nsfw?: boolean;
  rate_limit_per_user?: number | null;
  recipients: User[];
  permission_overwrites: PermissionOverwrite[];
  position?: number | null;
}

export interface Member {
  user: User;
  nick?: string | null;
  avatar?: string | null;
  roles: Snowflake[];
  joined_at: string;
  mute?: boolean;
  deaf?: boolean;
  communication_disabled_until?: string | null;
}

export interface ReactionEmoji {
  id?: Snowflake | null;
  name: string;
  animated?: boolean | null;
}

export interface Reaction {
  emoji: ReactionEmoji;
  count: number;
  me?: boolean;
}

/// One page of "who reacted" users (GET .../reactions/{emoji}/users).
export interface ReactionUsersPage {
  items: User[];
  has_more: boolean;
  next_after: Snowflake | null;
}

/// A file attached to a message. Mirrors Discord/Fluxer's attachment object.
export interface Attachment {
  id: Snowflake;
  filename: string;
  size: number;
  url: string;
  proxy_url?: string | null;
  content_type?: string | null;
  width?: number | null;
  height?: number | null;
  description?: string | null;
  spoiler?: boolean;
}

/// A pending attachment the frontend wants to send with a message. The path
/// points to a local file picked via the file dialog. Optional `filename`
/// overrides the basename; `spoiler` marks the attachment as a spoiler.
export interface AttachmentInput {
  path: string;
  filename?: string;
  spoiler?: boolean;
}

export interface MessageReference {
  message_id: Snowflake;
  channel_id?: Snowflake | null;
  guild_id?: Snowflake | null;
  type?: number;
}

/// Embed author/provider metadata.
export interface EmbedAuthor {
  name: string;
  url?: string | null;
  icon_url?: string | null;
  proxy_icon_url?: string | null;
}

/// An image/video/audio media object on an embed.
export interface EmbedMedia {
  url: string;
  proxy_url?: string | null;
  content_type?: string | null;
  width?: number | null;
  height?: number | null;
  description?: string | null;
  /// Duration in seconds, when known.
  duration?: number | null;
}

/// Embed footer.
export interface EmbedFooter {
  text: string;
  icon_url?: string | null;
  proxy_icon_url?: string | null;
}

/// An inline field on a rich embed.
export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

/// A message embed (link preview / rich embed / video / image). Mirrors the
/// Fluxer `MessageEmbedResponse` schema. Only `type` is required; the rest are
/// optional. `html` carries sanitized oEmbed HTML (e.g. a YouTube iframe).
export interface Embed {
  type: string;
  url?: string | null;
  title?: string | null;
  color?: number | null;
  timestamp?: string | null;
  description?: string | null;
  author?: EmbedAuthor | null;
  image?: EmbedMedia | null;
  thumbnail?: EmbedMedia | null;
  footer?: EmbedFooter | null;
  fields?: EmbedField[];
  provider?: EmbedAuthor | null;
  video?: EmbedMedia | null;
  audio?: EmbedMedia | null;
  html?: string | null;
  html_width?: number | null;
  html_height?: number | null;
  nsfw?: boolean | null;
}

/// A snapshot of a forwarded message, attached to the carrier message's
/// `message_snapshots` array. Mirrors the Fluxer `MessageSnapshotResponse`
/// schema. Snapshots carry the original content/embeds/attachments but no
/// author (the carrier message's author is the forwarder).
export interface MessageSnapshot {
  content?: string | null;
  timestamp?: string | null;
  edited_timestamp?: string | null;
  embeds?: Embed[];
  attachments?: Attachment[];
  type?: number;
}

export interface Message {
  id: Snowflake;
  channel_id: Snowflake;
  author: User;
  webhook_id?: string | null;
  type: number;
  flags?: number;
  content: string;
  timestamp: string;
  edited_timestamp?: string | null;
  pinned?: boolean;
  mention_everyone?: boolean;
  tts?: boolean;
  mentions: User[];
  mention_roles: Snowflake[];
  reactions: Reaction[];
  attachments: Attachment[];
  embeds: Embed[];
  /// Snapshots of forwarded messages (present when this message is a forward).
  message_snapshots?: MessageSnapshot[];
  message_reference?: MessageReference | null;
  nonce?: string | null;
  /// Client-only optimistic-send state. Absent on confirmed (server) messages.
  /// "sending" = awaiting the server ack; "failed" = the send errored and can
  /// be retried. Reconciled by nonce when the real MESSAGE_CREATE arrives.
  _state?: "sending" | "failed";
  /// Original send arguments, retained on a failed optimistic message so the
  /// user can retry without re-typing.
  _retry?: {
    content: string;
    replyTo?: Snowflake;
    stickerIds?: Snowflake[];
  };
}

export interface Relationship {
  id: Snowflake;
  type: number; // 1=friend, 2=blocked, 3=pending, 4=implicit
  user: User;
  since?: string | null;
  nickname?: string | null;
}

export const messageType = {
  DEFAULT: 0,
  RECIPIENT_ADD: 1,
  RECIPIENT_REMOVE: 2,
  CALL: 3,
  CHANNEL_NAME_CHANGE: 4,
  CHANNEL_ICON_CHANGE: 5,
  CHANNEL_PINNED_MESSAGE: 6,
  USER_JOIN: 7,
  REPLY: 19,
} as const;

// Backend command results.
export interface LoginResult {
  me: UserPrivate;
  guilds: Guild[];
  dms: Channel[];
  relationships: Relationship[];
  endpoints?: Endpoints | null;
}

export interface Endpoints {
  api?: string | null;
  /// Public REST API base (no `Origin` check); preferred for non-browser
  /// clients. The Tauri backend uses this over `api` to avoid
  /// `INVALID_API_ORIGIN` rejections.
  api_public?: string | null;
  gateway?: string | null;
  media?: string | null;
  admin?: string | null;
  static_cdn?: string | null;
  features?: string[];
}

export interface ApiError {
  message: string;
  code: string;
  status: number;
}

export interface GatewayEventPayload {
  name: string;
  data: any;
}

// Presence status type.
export type PresenceStatus = "online" | "dnd" | "idle" | "invisible" | "offline";

// A presence record from the gateway.
export interface PresenceRecord {
  user: { id: Snowflake };
  status?: PresenceStatus | null;
  afk?: boolean;
  mobile?: boolean;
  guild_id?: string | null;
  custom_status?: { text?: string; emoji_id?: string | null; emoji_name?: string | null } | null;
}

/// A voice state. Mirrors the gateway's VoiceState object. `self_*` fields are
/// the local user's choices; `mute`/`deaf`/`suppress` reflect server- or
/// moderator-imposed state.
export interface VoiceState {
  guild_id?: Snowflake | null;
  channel_id?: Snowflake | null;
  user_id: Snowflake;
  session_id?: string | null;
  deaf?: boolean;
  mute?: boolean;
  self_deaf?: boolean;
  self_mute?: boolean;
  self_video?: boolean;
  self_stream?: boolean;
  suppress?: boolean;
  request_to_speak_timestamp?: string | null;
}

/// Voice server info delivered via VOICE_SERVER_UPDATE. The frontend uses
/// `endpoint` (the LiveKit WebSocket URL) + `token` to connect via
/// livekit-client.
export interface VoiceServerUpdate {
  token: string;
  guild_id: Snowflake;
  endpoint: string;
}

/// A thread metadata object delivered via THREAD_* events.
export interface ThreadMetadata {
  archived: boolean;
  auto_archive_duration: number;
  archive_timestamp: string;
  locked: boolean;
  invitable?: boolean;
}

/// A thread channel (a GUILD_TEXT sub-channel with thread metadata).
export interface ThreadChannel extends Channel {
  thread_metadata?: ThreadMetadata;
  member_count?: number;
  message_count?: number;
  owner_id?: Snowflake;
  applied_tags?: Snowflake[];
}

/// A guild ban entry.
export interface GuildBan {
  reason?: string | null;
  user: User;
}

/// A chunk of guild members delivered via GUILD_MEMBERS_CHUNK.
export interface GuildMembersChunk {
  guild_id: Snowflake;
  members: Member[];
  chunk_index?: number;
  chunk_count?: number;
  not_found?: Snowflake[];
  presences?: PresenceRecord[];
  nonce?: string | null;
}

/// User settings (a subset that the client cares about). The full settings
/// object is large; we only track fields we render.
export interface UserSettings {
  status?: PresenceStatus | null;
  custom_status?: { text?: string; emoji_id?: string | null; emoji_name?: string | null } | null;
  theme?: "dark" | "light" | null;
  locale?: string | null;
  guild_positions?: Snowflake[];
  inline_attachment_media?: boolean;
  render_spoilers?: "always" | "on_click" | null;
  message_display_compact?: boolean;
  show_current_game?: boolean;
}

/// A trimmed guild object embedded in an invite preview.
export interface InviteGuild {
  id: Snowflake;
  name?: string | null;
  icon?: string | null;
  banner?: string | null;
  description?: string | null;
  features?: string[];
  verification_level?: number | null;
}

/// A trimmed channel object embedded in an invite preview.
export interface InviteChannel {
  id: Snowflake;
  name?: string | null;
  type: number;
}

/// An invite to a guild (or a channel within a guild). Returned by
/// `GET /invites/{code}` and accepted via `POST /invites/{code}`.
export interface Invite {
  code: string;
  guild?: InviteGuild | null;
  channel?: InviteChannel | null;
  inviter?: User | null;
  approximate_member_count?: number | null;
  approximate_presence_count?: number | null;
  max_age?: number | null;
  max_uses?: number | null;
  temporary?: boolean;
  revoked?: boolean;
  uses?: number | null;
}

/// A per-channel read-state entry: the last-read message id + mention count.
/// Used to drive unread/mention badges and the inbox view.
export interface ReadState {
  id: Snowflake;
  mention_count?: number;
  last_message_id?: Snowflake | null;
  last_pin_timestamp?: string | null;
}

/// A guild ban entry: the banned user + an optional reason.
export interface GuildBan {
  reason?: string | null;
  user: User;
}

// --- Email/password + MFA login (E.23) ---

/// The result of `login_credentials` / `verify_totp`: either a completed
/// login (session token to feed to `login` with kind="session") or an MFA
/// challenge the UI must resolve. Tagged with `kind` by the Rust enum.
export type LoginCredentialsResult =
  | { kind: "Token"; token: string; user_id: Snowflake }
  | {
      kind: "Mfa";
      ticket: string;
      allowed_methods: string[];
      totp: boolean;
      webauthn: boolean;
    };

// --- GIF (Klipy provider) ---

/// A single GIF result from the GIF search/trending API.
export interface GifResult {
  id: string;
  title: string;
  url: string;
  src: string;
  proxy_src: string;
  width: number;
  height: number;
}

/// A discoverable public guild (community listing).
export interface DiscoveryGuild {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  banner?: string | null;
  approximate_member_count?: number | null;
  approximate_presence_count?: number | null;
}

/// A discovery category.
export interface DiscoveryCategory {
  id: string;
  name: string;
}