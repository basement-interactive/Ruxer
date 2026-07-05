// Typed wrappers around Tauri commands and events. All frontend code goes
// through this module so the boundary is in one place.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ApiError,
  AttachmentInput,
  AuditLog,
  Channel,
  Emoji,
  DiscoveryCategory,
  DiscoveryGuild,
  GifResult,
  Guild,
  GuildBan,
  Invite,
  LoginCredentialsResult,
  LoginResult,
  Member,
  Message,
  PremiumState,
  ReadState,
  Relationship,
  Role,
  Snowflake,
  Webhook,
  Sticker,
  User,
  Endpoints,
} from "./types";

// Convert a thrown Tauri error into our ApiError shape. The returned object
// carries a `toString()` so `String(e)` at toast call sites renders the
// human message instead of "[object Object]" (plain objects use
// Object.prototype.toString, which yields "[object Object]").
function toApiError(e: unknown): ApiError {
  if (typeof e === "object" && e !== null && "message" in e) {
    const src = e as Partial<ApiError>;
    const err: ApiError = {
      message: String(src.message ?? ""),
      code: src.code ?? "UNKNOWN",
      status: src.status ?? 0,
    };
    // Attach a toString so `String(err)` / template literals show the message.
    (err as ApiError & { toString(): string }).toString = function () {
      return this.message;
    };
    return err;
  }
  const msg = String(e);
  const err: ApiError = { message: msg, code: "UNKNOWN", status: 0 };
  (err as ApiError & { toString(): string }).toString = function () {
    return this.message;
  };
  return err;
}

async function call<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw toApiError(e);
  }
}

export const api = {
  login: (p: {
    token: string;
    kind: string;
    instance?: string;
    apiBase?: string;
    gatewayUrl?: string;
    cdnBase?: string;
  }) =>
    call<LoginResult>("login", {
      token: p.token,
      kind: p.kind,
      instance: p.instance,
      apiBase: p.apiBase,
      gatewayUrl: p.gatewayUrl,
      cdnBase: p.cdnBase,
    }),

  logout: () => call<void>("logout"),

  currentUser: () => call<Snowflake | null>("current_user"),

  /// Email/password login — first leg of the E.23 flow. POST /auth/login.
  /// Returns a token (feed to `login` with kind="session") or an MFA
  /// challenge (resolve with `verifyTotp`).
  loginCredentials: (p: {
    instance?: string;
    apiBase?: string;
    email: string;
    password: string;
  }) =>
    call<LoginCredentialsResult>("login_credentials", {
      instance: p.instance,
      apiBase: p.apiBase,
      email: p.email,
      password: p.password,
    }),

  /// Complete MFA — POST /auth/login/mfa/totp. Verifies the TOTP code
  /// against the ticket from `loginCredentials` and returns the session token.
  verifyTotp: (p: {
    instance?: string;
    apiBase?: string;
    ticket: string;
    code: string;
  }) =>
    call<LoginCredentialsResult>("verify_totp", {
      instance: p.instance,
      apiBase: p.apiBase,
      ticket: p.ticket,
      code: p.code,
    }),

  /// Whether a session is stored in the OS keychain (secure-storage build only).
  hasStoredSession: () => call<boolean>("has_stored_session"),

  /// Read the stored session from the OS keychain. Returns null when absent.
  restoreSession: () =>
    call<{
      token: string;
      kind: string;
      instance: string;
      endpoints?: Endpoints | null;
    } | null>("restore_session"),

  listGuilds: () => call<Guild[]>("list_guilds"),
  createGuild: (name: string, icon?: string) =>
    call<Guild>("create_guild", { name, icon }),
  fetchInvite: (code: string) => call<Invite>("fetch_invite", { code }),
  acceptInvite: (code: string) =>
    call<{ kind: "Guild"; guild: Guild } | { kind: "Channel"; channel: Channel }>(
      "accept_invite",
      { code },
    ),
  leaveGuild: (guildId: Snowflake) => call<void>("leave_guild", { guildId }),

  // --- Guild admin (D.20) ---
  listGuildBans: (guildId: Snowflake) => call<GuildBan[]>("list_guild_bans", { guildId }),
  banUser: (
    guildId: Snowflake,
    userId: Snowflake,
    reason?: string,
    deleteMessageSeconds?: number,
  ) =>
    call<void>("ban_user", {
      guildId,
      userId,
      reason,
      deleteMessageSeconds,
    }),
  unbanUser: (guildId: Snowflake, userId: Snowflake) =>
    call<void>("unban_user", { guildId, userId }),
  kickMember: (guildId: Snowflake, userId: Snowflake) =>
    call<void>("kick_member", { guildId, userId }),
  getGuildMember: (guildId: Snowflake, userId: Snowflake) =>
    call<Member>("get_guild_member", { guildId, userId }),
  // Voice/role moderation: server mute/deafen, move (channel_id), nick.
  // `channel_id` present in the patch (incl. null) => move/disconnect; absent
  // => leave the member's channel untouched (set_channel gates this server-side).
  updateGuildMember: (
    guildId: Snowflake,
    userId: Snowflake,
    patch: { mute?: boolean; deaf?: boolean; channel_id?: Snowflake | null; nick?: string },
  ) =>
    call<Member>("update_guild_member", {
      guildId,
      userId,
      mute: patch.mute,
      deaf: patch.deaf,
      nick: patch.nick,
      setChannel: "channel_id" in patch,
      channelId: patch.channel_id ?? null,
    }),
  deleteGuild: (guildId: Snowflake) => call<void>("delete_guild", { guildId }),

  // --- Channel admin (D.20) ---
  createChannel: (
    guildId: Snowflake,
    name: string,
    kind: number,
    parentId?: Snowflake,
    topic?: string,
  ) => call<Channel>("create_channel", { guildId, name, kind, parentId, topic }),
  editChannel: (
    channelId: Snowflake,
    name?: string,
    topic?: string,
    parentId?: Snowflake,
  ) => call<Channel>("edit_channel", { channelId, name, topic, parentId }),
  createChannelInvite: (channelId: Snowflake, maxAge?: number, maxUses?: number) =>
    call<Invite>("create_channel_invite", { channelId, maxAge, maxUses }),
  listChannelInvites: (channelId: Snowflake) =>
    call<Invite[]>("list_channel_invites", { channelId }),
  revokeInvite: (code: string) => call<Invite>("revoke_invite", { code }),

  subscribeGuild: (guildId: Snowflake) => call<void>("subscribe_guild", { guildId }),
  subscribeRanges: (guildId: Snowflake, ranges: Array<[number, number]>) =>
    call<void>("subscribe_ranges", { guildId, ranges }),
  requestMembers: (guildId: Snowflake, query?: string, limit?: number) =>
    call<void>("request_members", { guildId, query, limit }),
  updatePresence: (
    status: string,
    activities: unknown[],
    afk?: boolean,
    since?: number,
  ) =>
    call<void>("update_presence", {
      status,
      activities: Array.isArray(activities) ? activities : [],
      afk,
      since,
    }),
  voiceStateUpdate: (
    guildId: Snowflake | null,
    channelId: Snowflake | null,
    selfMute?: boolean,
    selfDeaf?: boolean,
    selfVideo?: boolean,
  ) =>
    call<void>("voice_state_update", {
      guildId,
      channelId,
      selfMute,
      selfDeaf,
      selfVideo,
    }),
  listDms: () => call<Channel[]>("list_dms"),
  listChannels: (guildId: Snowflake) =>
    call<Channel[]>("list_channels", { guildId }),
  listMembers: (guildId: Snowflake) =>
    call<Member[]>("list_members", { guildId }),
  listGuildEmojis: (guildId: Snowflake) =>
    call<Emoji[]>("list_guild_emojis", { guildId }),
  listGuildStickers: (guildId: Snowflake) =>
    call<Sticker[]>("list_guild_stickers", { guildId }),
  createGuildSticker: (
    guildId: Snowflake,
    name: string,
    image: string,
    tags: string[],
    description?: string,
  ) =>
    call<Sticker>("create_guild_sticker", {
      guildId,
      name,
      description,
      tags,
      image,
    }),
  updateGuildSticker: (
    guildId: Snowflake,
    stickerId: Snowflake,
    patch: { name?: string; description?: string; tags?: string[] },
  ) => call<Sticker>("update_guild_sticker", { guildId, stickerId, ...patch }),
  deleteGuildSticker: (guildId: Snowflake, stickerId: Snowflake) =>
    call<void>("delete_guild_sticker", { guildId, stickerId }),
  premiumState: () => call<PremiumState>("premium_state"),
  saveTheme: (css: string) => call<unknown>("save_theme", { css }),
  // UI editor advanced mode: run a sandboxed LuaU layout script in the Rust
  // sandbox (src-tauri/src/ui_editor.rs). Returns the array of presentation ops
  // the script emitted; throws (ApiError) on a script/syntax/budget error.
  uiEditorRunLua: (script: string) => call<unknown[]>("ui_editor_run_lua", { script }),
  reportMessage: (channelId: Snowflake, messageId: Snowflake, category: string) =>
    call<void>("report_message", { channelId, messageId, category }),
  reportUser: (userId: Snowflake, category: string, guildId?: Snowflake) =>
    call<void>("report_user", { userId, category, guildId }),
  reportGuild: (guildId: Snowflake, category: string, inviteCode?: string) =>
    call<void>("report_guild", { guildId, category, inviteCode }),
  listGuildRoles: (guildId: Snowflake) =>
    call<Role[]>("list_guild_roles", { guildId }),
  createGuildRole: (
    guildId: Snowflake,
    name: string,
    color?: number,
    permissions?: string,
  ) => call<Role>("create_guild_role", { guildId, name, color, permissions }),
  updateGuildRole: (
    guildId: Snowflake,
    roleId: Snowflake,
    patch: {
      name?: string;
      color?: number;
      permissions?: string;
      hoist?: boolean;
      mentionable?: boolean;
    },
  ) => call<Role>("update_guild_role", { guildId, roleId, ...patch }),
  deleteGuildRole: (guildId: Snowflake, roleId: Snowflake) =>
    call<void>("delete_guild_role", { guildId, roleId }),
  addMemberRole: (guildId: Snowflake, userId: Snowflake, roleId: Snowflake) =>
    call<void>("add_member_role", { guildId, userId, roleId }),
  removeMemberRole: (guildId: Snowflake, userId: Snowflake, roleId: Snowflake) =>
    call<void>("remove_member_role", { guildId, userId, roleId }),
  guildAuditLog: (guildId: Snowflake) =>
    call<AuditLog>("guild_audit_log", { guildId }),
  listChannelWebhooks: (channelId: Snowflake) =>
    call<Webhook[]>("list_channel_webhooks", { channelId }),
  createGuildEmoji: (guildId: Snowflake, name: string, image: string) =>
    call<Emoji>("create_guild_emoji", { guildId, name, image }),
  updateGuildEmoji: (guildId: Snowflake, emojiId: Snowflake, name: string) =>
    call<Emoji>("update_guild_emoji", { guildId, emojiId, name }),
  deleteGuildEmoji: (guildId: Snowflake, emojiId: Snowflake) =>
    call<void>("delete_guild_emoji", { guildId, emojiId }),
  createChannelWebhook: (channelId: Snowflake, name: string, avatar?: string) =>
    call<Webhook>("create_channel_webhook", { channelId, name, avatar }),
  updateWebhook: (
    webhookId: Snowflake,
    patch: { name?: string; avatar?: string; channelId?: Snowflake },
  ) => call<Webhook>("update_webhook", { webhookId, ...patch }),
  deleteWebhook: (webhookId: Snowflake) =>
    call<void>("delete_webhook", { webhookId }),

  listMessages: (channelId: Snowflake, limit?: number, before?: Snowflake) =>
    call<Message[]>("list_messages", { channelId, limit, before }),
  /// Send a message, optionally with file attachments. Each `AttachmentInput`
  /// points to a local file path picked via the native file dialog; the Tauri
  /// backend reads the bytes and sends them as multipart `files[N]` parts in
  /// the same `POST /channels/{cid}/messages` request as the text body.
  sendMessage: (
    channelId: Snowflake,
    content: string,
    replyTo?: Snowflake,
    attachments?: AttachmentInput[],
    stickerIds?: Snowflake[],
    nonce?: string,
  ) =>
    call<Message>("send_message", {
      channelId,
      content,
      replyTo,
      attachments,
      stickerIds,
      nonce,
    }),
  editMessage: (channelId: Snowflake, messageId: Snowflake, content: string) =>
    call<Message>("edit_message", { channelId, messageId, content }),
  deleteMessage: (channelId: Snowflake, messageId: Snowflake) =>
    call<void>("delete_message", { channelId, messageId }),
  bulkDeleteMessages: (channelId: Snowflake, messageIds: Snowflake[]) =>
    call<void>("bulk_delete_messages", { channelId, messageIds }),
  triggerTyping: (channelId: Snowflake) =>
    call<void>("trigger_typing", { channelId }),

  /// Acknowledge that the user has read up to `messageId` in `channelId`. The
  /// server updates read state and clears unread/mention badges for that channel.
  ackMessage: (channelId: Snowflake, messageId: Snowflake) =>
    call<void>("ack_message", { channelId, messageId }),
  /// Mark every message in `channelId` as read.
  ackChannel: (channelId: Snowflake) =>
    call<void>("ack_channel", { channelId }),

  // --- Threads (D.17) ---
  startThread: (
    channelId: Snowflake,
    name: string,
    messageId?: Snowflake,
    autoArchiveDuration?: number,
  ) =>
    call<Channel>("start_thread", {
      channelId,
      name,
      messageId,
      autoArchiveDuration,
    }),
  startThreadOnMessage: (
    channelId: Snowflake,
    messageId: Snowflake,
    name: string,
    autoArchiveDuration?: number,
  ) =>
    call<Channel>("start_thread_on_message", {
      channelId,
      messageId,
      name,
      autoArchiveDuration,
    }),
  listActiveThreads: (channelId: Snowflake) =>
    call<Channel[]>("list_active_threads", { channelId }),
  joinThread: (channelId: Snowflake) => call<void>("join_thread", { channelId }),
  leaveThread: (channelId: Snowflake) => call<void>("leave_thread", { channelId }),

  // --- Search (D.16) ---
  searchMessages: (p: {
    query: string;
    authorId?: Snowflake[];
    channelId?: Snowflake[];
    guildId?: Snowflake[];
    has?: string[];
    limit?: number;
    page?: number;
  }) =>
    call<{ hits: { message: Message }[]; total: number | null; indexing: boolean }>("search_messages", {
      query: p.query,
      authorId: p.authorId,
      channelId: p.channelId,
      guildId: p.guildId,
      has: p.has,
      limit: p.limit,
      page: p.page,
    }),

  // --- GIF search (Klipy provider) ---
  gifSearch: (query: string, locale: string = "en") =>
    call<GifResult[]>("gif_search", { query, locale }),
  gifTrending: (locale: string = "en") =>
    call<GifResult[]>("gif_trending", { locale }),

  // --- Discovery (public community browser) ---
  discoveryGuilds: (category?: string, query?: string) =>
    call<DiscoveryGuild[]>("discovery_guilds", { category, query }),
  discoveryCategories: () =>
    call<DiscoveryCategory[]>("discovery_categories"),
  discoveryJoin: (guildId: string) =>
    call<unknown>("discovery_join", { guildId }),

  // --- Read state (D.18) ---
  listReadState: () => call<ReadState[]>("list_read_state"),

  listPins: (channelId: Snowflake) =>
    call<Message[]>("list_pins", { channelId }),
  pinMessage: (channelId: Snowflake, messageId: Snowflake) =>
    call<void>("pin_message", { channelId, messageId }),
  unpinMessage: (channelId: Snowflake, messageId: Snowflake) =>
    call<void>("unpin_message", { channelId, messageId }),

  addReaction: (
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: string,
    customEmojiId?: Snowflake,
  ) =>
    call<void>("add_reaction", {
      channelId,
      messageId,
      emoji,
      customEmojiId,
    }),
  removeOwnReaction: (
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: string,
    customEmojiId?: Snowflake,
  ) =>
    call<void>("remove_own_reaction", {
      channelId,
      messageId,
      emoji,
      customEmojiId,
    }),

  openDm: (userId: Snowflake) => call<Channel>("open_dm", { userId }),
  createGroupDm: (recipients: Snowflake[]) =>
    call<Channel>("create_group_dm", { recipients }),
  listRelationships: () => call<Relationship[]>("list_relationships"),
  sendFriendRequest: (userId: string) =>
    call<Relationship>("send_friend_request", { userId }),
  removeRelationship: (userId: Snowflake) =>
    call<void>("remove_relationship", { userId }),

  getUser: (userId: Snowflake) => call<User>("get_user", { userId }),
  getChannel: (channelId: Snowflake) =>
    call<Channel>("get_channel", { channelId }),
  deleteChannel: (channelId: Snowflake) =>
    call<void>("delete_channel", { channelId }),
  addRecipient: (channelId: Snowflake, userId: Snowflake) =>
    call<void>("add_recipient", { channelId, userId }),
  removeRecipient: (channelId: Snowflake, userId: Snowflake) =>
    call<void>("remove_recipient", { channelId, userId }),

  markChannelLoaded: (channelId: Snowflake) =>
    call<void>("mark_channel_loaded", { channelId }),

  imageProxy: (url: string) => call<string | null>("image_proxy", { url }),

  /// Resolve a remote media URL to a cached `asset://` URL backed by the
  /// on-disk temp cache. Preferred over `imageProxy` for `<img>`/`<video>`/
  /// `<a download>`: native browser caching, no base64 overhead.
  imageProxyAsset: (url: string) => call<string | null>("image_proxy_asset", { url }),

  /// Upload a local file as an attachment to a channel. Returns the raw JSON
  /// response from the server (a message object or attachment descriptor).
  uploadAttachment: (channelId: Snowflake, filePath: string) =>
    call<unknown>("upload_attachment", { channelId, filePath }),

  resolveEndpoints: () => call<Endpoints | null>("resolve_endpoints"),
};

// Gateway event listener. Returns an unlisten function.
export function onGatewayEvent(
  handler: (name: string, data: any) => void,
): Promise<UnlistenFn> {
  return listen<{ name: string; data: any }>("gateway", (e) => {
    handler(e.payload.name, e.payload.data);
  });
}

// Backend log mirror. The Rust `log_forward` layer emits `backend-log` events
// with `{ level, target, message }`; the frontend routes them to console.*.
export type BackendLogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR";
export interface BackendLogEntry {
  level: BackendLogLevel;
  target: string;
  message: string;
}

export function onBackendLog(
  handler: (entry: BackendLogEntry) => void,
): Promise<UnlistenFn> {
  return listen<BackendLogEntry>("backend-log", (e) => {
    handler(e.payload);
  });
}
