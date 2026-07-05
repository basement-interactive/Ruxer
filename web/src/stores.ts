// MobX stores: the single source of truth for app state. Gateway events mutate
// these stores directly, and React components observe them via mobx-react-lite.

import { makeAutoObservable, observable, action, runInAction } from "mobx";
import { listen } from "@tauri-apps/api/event";
import { api, onGatewayEvent, onBackendLog } from "./api";
import {
  LiveKitRoom,
  type VoiceConnectionState,
  type VoiceParticipant,
} from "./voice/LiveKitRoom";
import type {
  AttachmentInput,
  Channel,
  Emoji,
  Guild,
  LoginResult,
  Member,
  Message,
  ReadState,
  Relationship,
  Snowflake,
  Sticker,
  ThreadChannel,
  User,
  UserPrivate,
  UserSettings,
  VoiceServerUpdate,
  VoiceState,
  GuildBan,
  GuildMembersChunk,
} from "./types";
import { channelType } from "./types";
import {
  playSound,
  stopSound,
  setSoundsMuted,
  setMasterVolume,
  setSoundOutputDevice,
} from "./sounds";
import { bigMod } from "./utils";
import { parsePermissions } from "./utils/permissions";
import { resolveAssetUrl } from "./utils/mediaCache";

// A single entry in a right-click context menu.
export type ContextMenuItem =
  | { kind: "action"; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }
  | { kind: "separator" }
  // A toggle row (e.g. local mute). Clicking flips `checked` and does NOT
  // close the menu.
  | { kind: "checkbox"; label: string; checked: boolean; onToggle: (checked: boolean) => void; danger?: boolean; disabled?: boolean }
  // A labeled slider row (e.g. per-user volume). Does NOT close the menu.
  | { kind: "slider"; label: string; value: number; min: number; max: number; defaultValue?: number; format?: (v: number) => string; onChange: (v: number) => void };

/// Normalize an inbound message so optional-but-array-typed fields are never
/// `undefined`. The Fluxer gateway omits empty arrays on real MESSAGE_CREATE
/// events (e.g. `reactions`, `attachments`, `mentions`, `mention_roles`),
/// which would crash renderers that read `.length`. Apply this at every
/// boundary where a message enters the store: REST fetch, MESSAGE_CREATE,
/// MESSAGE_UPDATE. Cheap (one shallow copy) and idempotent.
function normalizeMessage(raw: Message): Message {
  if (!raw) return raw;
  return {
    ...raw,
    author: raw.author ?? ({ id: "", username: "" } as User),
    mentions: raw.mentions ?? [],
    mention_roles: raw.mention_roles ?? [],
    reactions: raw.reactions ?? [],
    attachments: raw.attachments ?? [],
    embeds: raw.embeds ?? [],
    message_snapshots: raw.message_snapshots ?? [],
  };
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

export class SessionStore {
  me: UserPrivate | null = null;
  meId: Snowflake | null = null;
  endpoints: { media?: string | null; static_cdn?: string | null } | null = null;
  loggingIn = false;
  loginError: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get isLoggedIn() {
    return this.me !== null;
  }

  setLoginError(msg: string | null) {
    this.loginError = msg;
  }

  async login(token: string, kind: string, opts: {
    instance?: string;
    apiBase?: string;
    gatewayUrl?: string;
    cdnBase?: string;
  }) {
    this.loggingIn = true;
    this.loginError = null;
    try {
      // Attach the gateway listener BEFORE invoking `login`, because the
      // `login` Tauri command spawns the gateway task during its execution
      // and emits the initial "connecting"/"connected" status events before
      // this await returns. If we listened after, we'd miss those events and
      // the banner would stay stuck on its default.
      startGatewayListener();
      const result = await api.login({
        token,
        kind,
        instance: opts.instance,
        apiBase: opts.apiBase,
        gatewayUrl: opts.gatewayUrl,
        cdnBase: opts.cdnBase,
      });
      runInAction(() => {
        applyLoginResult(result);
        this.loggingIn = false;
      });
      // Set the status explicitly in case the "connecting" event raced ahead
      // of the listener attach; the listener will refine it to "connected".
      ui.setGatewayStatus("connecting");
      return result;
    } catch (e: any) {
      runInAction(() => {
        this.loginError = e?.message ?? String(e);
        this.loggingIn = false;
      });
      throw e;
    }
  }

  async logout() {
    try {
      await api.logout();
    } finally {
      runInAction(() => {
        this.me = null;
        this.meId = null;
        this.endpoints = null;
        ui.setGatewayStatus("disconnected");
        clearStores();
      });
      // Allow the next login to re-attach the gateway event listeners.
      gatewayStarted = false;
    }
  }

  /// E.23: email/password + MFA login flow. Runs the first leg
  /// (`loginCredentials` → POST /auth/login). If the server returns an MFA
  /// challenge, this returns `{ kind: "mfa", ticket }` so the UI can prompt
  /// for a TOTP code; the caller then invokes `completeMfa(code)` to finish.
  /// On a completed login (no MFA) this bootstraps the full client via
  /// `login(token, "session", opts)` and returns `{ kind: "ok" }`.
  async loginWithCredentials(
    email: string,
    password: string,
    opts: {
      instance?: string;
      apiBase?: string;
      gatewayUrl?: string;
      cdnBase?: string;
    },
  ): Promise<
    | { kind: "ok" }
    | { kind: "mfa"; ticket: string; totp: boolean; webauthn: boolean }
  > {
    this.loggingIn = true;
    this.loginError = null;
    try {
      const res = await api.loginCredentials({
        instance: opts.instance,
        apiBase: opts.apiBase,
        email,
        password,
      });
      if (res.kind === "Mfa") {
        return runInAction(() => {
          this.loggingIn = false;
          return {
            kind: "mfa",
            ticket: res.ticket,
            totp: res.totp,
            webauthn: res.webauthn,
          };
        });
      }
      // Token variant — bootstrap the full client with the session token.
      await this.login(res.token, "session", opts);
      return { kind: "ok" };
    } catch (e: any) {
      runInAction(() => {
        this.loginError = e?.message ?? String(e);
        this.loggingIn = false;
      });
      throw e;
    }
  }

  /// E.23: complete the MFA leg. Submits the TOTP code against the ticket
  /// obtained from `loginWithCredentials`, then bootstraps the full client
  /// with the resulting session token.
  async completeMfa(
    ticket: string,
    code: string,
    opts: {
      instance?: string;
      apiBase?: string;
      gatewayUrl?: string;
      cdnBase?: string;
    },
  ): Promise<{ kind: "ok" }> {
    this.loggingIn = true;
    this.loginError = null;
    try {
      const res = await api.verifyTotp({
        instance: opts.instance,
        apiBase: opts.apiBase,
        ticket,
        code,
      });
      if (res.kind === "Mfa") {
        // Shouldn't happen for TOTP, but handle gracefully.
        throw new Error("TOTP verification returned another MFA challenge");
      }
      await this.login(res.token, "session", opts);
      return { kind: "ok" };
    } catch (e: any) {
      runInAction(() => {
        this.loginError = e?.message ?? String(e);
        this.loggingIn = false;
      });
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Guilds store
// ---------------------------------------------------------------------------

export class GuildsStore {
  guilds: Guild[] = [];
  // Channels keyed by guild id.
  channelsByGuild = observable.map<Snowflake, Channel[]>();
  // Members keyed by guild id.
  membersByGuild = observable.map<Snowflake, Member[]>();
  // Emojis keyed by guild id (combined from guild.emojis + fetched).
  emojisByGuild = observable.map<Snowflake, Emoji[]>();
  // Stickers keyed by guild id.
  stickersByGuild = observable.map<Snowflake, Sticker[]>();
  // Active voice channel per guild (the channel id the current user is in, or null).
  voiceChannelByGuild = observable.map<Snowflake, Snowflake | null>();
  // Threads (channel id -> thread channel). Keyed by id so a thread update can
  // patch the entry regardless of which guild it lives in.
  threadsById = observable.map<Snowflake, ThreadChannel>();
  // Bans keyed by guild id.
  bansByGuild = observable.map<Snowflake, GuildBan[]>();

  constructor() {
    makeAutoObservable(this);
  }

  setGuilds(gs: Guild[]) {
    // Apply the user's saved guild order (drag-to-reorder), keeping any new
    // guilds (not in the saved order) at the end in server order.
    this.guilds = this.applySavedOrder(gs);
    // Seed channels/emojis from the guild payload if present.
    for (const g of gs) {
      if (g.channels?.length) this.channelsByGuild.set(g.id, g.channels);
      if (g.emojis?.length) this.emojisByGuild.set(g.id, g.emojis);
    }
  }

  /// Reorder guilds by moving the guild at `from` to `to` (drag-and-drop).
  /// Persists the new order to localStorage (and could sync to the server's
  /// guild_folders settings in a future pass).
  @action reorderGuild(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const next = [...this.guilds];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    this.guilds = next;
    try {
      localStorage.setItem("guilds.order", JSON.stringify(next.map((g) => g.id)));
    } catch {
      /* ignore */
    }
  }

  private applySavedOrder(gs: Guild[]): Guild[] {
    let order: Snowflake[] = [];
    try {
      const raw = localStorage.getItem("guilds.order");
      if (raw) order = JSON.parse(raw);
    } catch {
      return gs;
    }
    if (order.length === 0) return gs;
    const byId = new Map(gs.map((g) => [g.id, g]));
    const ordered: Guild[] = [];
    for (const id of order) {
      const g = byId.get(id);
      if (g) {
        ordered.push(g);
        byId.delete(id);
      }
    }
    // Append any guilds not in the saved order (newly joined) in server order.
    for (const g of gs) if (byId.has(g.id)) ordered.push(g);
    return ordered;
  }

  setChannels(guildId: Snowflake, chs: Channel[]) {
    this.channelsByGuild.set(guildId, chs);
  }

  setMembers(guildId: Snowflake, members: Member[]) {
    this.membersByGuild.set(guildId, members);
  }

  setEmojis(guildId: Snowflake, emojis: Emoji[]) {
    this.emojisByGuild.set(guildId, emojis);
  }

  setStickers(guildId: Snowflake, stickers: Sticker[]) {
    this.stickersByGuild.set(guildId, stickers);
  }

  /// Load the active (non-archived) threads for a guild channel and merge them
  /// into `threadsById` + the guild's channel list so they appear in the UI.
  @action
  async loadActiveThreads(channelId: Snowflake) {
    try {
      const threads = await api.listActiveThreads(channelId);
      runInAction(() => {
        for (const t of threads) {
          this.threadsById.set(t.id, t as ThreadChannel);
          // Also merge into the guild's channel list if not already present.
          if (t.guild_id) {
            const chs = this.channelsByGuild.get(t.guild_id) ?? [];
            if (!chs.some((c) => c.id === t.id)) {
              this.channelsByGuild.set(t.guild_id, [...chs, t]);
            }
          }
        }
      });
    } catch (e) {
      toasts.error("Failed to load threads", String(e));
    }
  }

  /// Start a new thread on a channel (or on a specific message) and add it to
  /// the store. Returns the created thread channel.
  @action
  async startThread(
    channelId: Snowflake,
    name: string,
    messageId?: Snowflake,
  ): Promise<ThreadChannel | null> {
    try {
      const t = messageId
        ? await api.startThreadOnMessage(channelId, messageId, name)
        : await api.startThread(channelId, name);
      runInAction(() => {
        this.threadsById.set(t.id, t as ThreadChannel);
        if (t.guild_id) {
          const chs = this.channelsByGuild.get(t.guild_id) ?? [];
          if (!chs.some((c) => c.id === t.id)) {
            this.channelsByGuild.set(t.guild_id, [...chs, t]);
          }
        }
      });
      return t as ThreadChannel;
    } catch (e) {
      toasts.error("Failed to create thread", String(e));
      return null;
    }
  }

  setBans(guildId: Snowflake, bans: GuildBan[]) {
    this.bansByGuild.set(guildId, bans);
  }

  getGuild(id: Snowflake): Guild | undefined {
    return this.guilds.find((g) => g.id === id);
  }

  getMember(guildId: Snowflake, userId: Snowflake): Member | undefined {
    return this.membersByGuild.get(guildId)?.find((m) => m.user.id === userId);
  }

  /// Fetch a single member on demand (for profile roles when the member isn't
  /// in the lazily-loaded list) and merge into the guild's member list.
  async ensureMember(guildId: Snowflake, userId: Snowflake): Promise<void> {
    if (this.getMember(guildId, userId)) return;
    try {
      const m = await api.getGuildMember(guildId, userId);
      runInAction(() => {
        const list = this.membersByGuild.get(guildId) ?? [];
        if (!list.some((x) => x.user.id === userId)) {
          this.membersByGuild.set(guildId, [...list, m]);
        }
      });
    } catch (e) {
      // Member fetch is best-effort; the profile renders without roles. Warn so
      // a broken fetch (e.g. a deserialization failure) is visible, not silent.
      console.warn("ensureMember failed", guildId, userId, e);
    }
  }

  /// The current user's combined permission bitfield in a guild (OR of all the
  /// roles they hold, plus owner = all). Returns 0n if not a member.
  myPermissions(guildId: Snowflake): bigint {
    const g = this.getGuild(guildId);
    if (!g) return 0n;
    if (g.owner_id === session.meId) return ~0n;
    const me = this.getMember(guildId, session.meId ?? "");
    if (!me) return 0n;
    const roleById = new Map((g.roles ?? []).map((r) => [r.id, r]));
    let bits = parsePermissions(roleById.get(guildId)?.permissions); // @everyone
    for (const rid of me.roles) {
      bits |= parsePermissions(roleById.get(rid)?.permissions);
    }
    return bits;
  }

  /// Whether the current user can perform a moderation action (by permission
  /// bit) in a guild. Administrator and owner always pass.
  canModerateGuild(guildId: Snowflake, bit: bigint): boolean {
    const g = this.getGuild(guildId);
    if (g?.owner_id === session.meId) return true;
    const perms = this.myPermissions(guildId);
    const ADMIN = 1n << 3n;
    return (perms & ADMIN) === ADMIN || (perms & bit) === bit;
  }

  /// Whether the current user outranks a target member (role hierarchy) and the
  /// target isn't the owner / an administrator. Owner can manage anyone.
  canManageTarget(guildId: Snowflake, targetUserId: Snowflake): boolean {
    if (targetUserId === session.meId) return false;
    const g = this.getGuild(guildId);
    if (!g) return false;
    if (g.owner_id === session.meId) return true;
    if (g.owner_id === targetUserId) return false;
    const roleById = new Map((g.roles ?? []).map((r) => [r.id, r]));
    const ADMIN = 1n << 3n;
    // Target must not be an administrator (can't moderate admins).
    const target = this.getMember(guildId, targetUserId);
    if (target) {
      for (const rid of target.roles) {
        if ((parsePermissions(roleById.get(rid)?.permissions) & ADMIN) === ADMIN) return false;
      }
    }
    // An administrator can manage any non-admin/non-owner target regardless of
    // role position.
    if ((this.myPermissions(guildId) & ADMIN) === ADMIN) return true;
    // Plain moderator: must outrank the target. When role data isn't loaded yet
    // for either side, don't hard-deny — defer to the caller's permission gate
    // (canModerateGuild) which already requires the moderation bit.
    const highest = (uid: Snowflake): number | null => {
      const m = this.getMember(guildId, uid);
      if (!m) return null; // unknown — can't compare
      let top = 0;
      for (const rid of m.roles) {
        const r = roleById.get(rid);
        if (r && r.position > top) top = r.position;
      }
      return top;
    };
    const mine = highest(session.meId ?? "");
    const theirs = highest(targetUserId);
    if (mine == null || theirs == null) return true; // roles not loaded → allow
    return mine > theirs;
  }

  async loadChannels(guildId: Snowflake) {
    if (this.channelsByGuild.has(guildId)) return;
    try {
      const chs = await api.listChannels(guildId);
      runInAction(() => this.channelsByGuild.set(guildId, chs));
    } catch (e) {
      toasts.error("Failed to load channels", String(e));
    }
  }

  async loadMembers(guildId: Snowflake) {
    if (this.membersByGuild.has(guildId)) return;
    const guild = this.guilds.find((g) => g.id === guildId);
    const memberCount = guild?.member_count ?? 0;
    // Big guilds use the lazy member list: instead of pulling every member
    // up front (which can be tens of thousands), we subscribe to the index
    // ranges the user is actually viewing and the server pushes
    // GUILD_MEMBERS_CHUNK events covering only those indices. Small guilds
    // just fetch a page of members directly — the lazy list is overkill for
    // them and the REST call is simpler.
    const BIG_GUILD_THRESHOLD = 1000;
    if (memberCount >= BIG_GUILD_THRESHOLD) {
      this.subscribeMemberRanges(guildId, [[0, 99]]);
      return;
    }
    try {
      const members = await api.listMembers(guildId);
      runInAction(() => this.membersByGuild.set(guildId, members));
    } catch (e) {
      toasts.error("Failed to load members", String(e));
    }
  }

  /// Subscribe to additional member-list index ranges for a big guild's lazy
  /// member list. Called by the MemberList as the user scrolls. Ranges are
  /// inclusive on both ends. We track the union of subscribed ranges per
  /// guild so we don't re-subscribe to ranges we already have.
  subscribedRangesByGuild = observable.map<Snowflake, Array<[number, number]>>();

  subscribeMemberRanges(guildId: Snowflake, ranges: Array<[number, number]>) {
    const existing = this.subscribedRangesByGuild.get(guildId) ?? [];
    // Only subscribe to ranges we haven't already covered.
    const newRanges = ranges.filter(
      (r) => !existing.some((e) => e[0] <= r[0] && e[1] >= r[1]),
    );
    if (newRanges.length === 0) return;
    const merged = mergeRanges([...existing, ...newRanges]);
    runInAction(() => this.subscribedRangesByGuild.set(guildId, merged));
    api.subscribeRanges(guildId, newRanges).catch((e) =>
      toasts.error("Failed to subscribe to member ranges", String(e)),
    );
  }

  async loadEmojis(guildId: Snowflake) {
    if (this.emojisByGuild.has(guildId)) return;
    try {
      const emojis = await api.listGuildEmojis(guildId);
      runInAction(() => this.emojisByGuild.set(guildId, emojis));
    } catch (e) {
      toasts.error("Failed to load emojis", String(e));
    }
  }

  // Aggregate all custom emoji across guilds for the emoji picker.
  get allCustomEmoji(): Array<Emoji & { guildId: Snowflake; guildName: string }> {
    const out: Array<Emoji & { guildId: Snowflake; guildName: string }> = [];
    for (const g of this.guilds) {
      const emojis = this.emojisByGuild.get(g.id) ?? g.emojis ?? [];
      for (const e of emojis) {
        out.push({ ...e, guildId: g.id, guildName: g.name });
      }
    }
    return out;
  }

  // Aggregate all custom stickers across guilds for the sticker picker.
  get allCustomStickers(): Array<Sticker & { guildId: Snowflake; guildName: string }> {
    const out: Array<Sticker & { guildId: Snowflake; guildName: string }> = [];
    for (const g of this.guilds) {
      const stickers = this.stickersByGuild.get(g.id) ?? [];
      for (const s of stickers) {
        out.push({ ...s, guildId: g.id, guildName: g.name });
      }
    }
    return out;
  }

  // Find the channel (guild or thread) that owns a channel id, returning the
  // parent guild id and the channel. Used by voice-state and message routing
  // when we only have a channel id.
  findChannel(channelId: Snowflake): { guildId: Snowflake; channel: Channel } | undefined {
    for (const [gid, chs] of this.channelsByGuild.entries()) {
      const c = chs.find((c) => c.id === channelId);
      if (c) return { guildId: gid, channel: c };
    }
    // Threads live in threadsById but are also typically in channelsByGuild
    // (the parent guild's channel list includes them). Check threads as a
    // fallback so a thread-only event still resolves.
    const t = this.threadsById.get(channelId);
    if (t?.guild_id) return { guildId: t.guild_id, channel: t };
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Messages store
// ---------------------------------------------------------------------------

export class MessagesStore {
  // Messages keyed by channel id, oldest-first.
  byChannel = observable.map<Snowflake, Message[]>();
  // Channels we've loaded (avoid refetch on navigation).
  loaded = observable.set<Snowflake>();
  // Pins keyed by channel id.
  pinsByChannel = observable.map<Snowflake, Message[]>();
  // Typing indicators: channelId -> userIds with expiry.
  typingByChannel = observable.map<Snowflake, Map<Snowflake, number>>();
  // Unread channel ids.
  unread = observable.set<Snowflake>();

  constructor() {
    makeAutoObservable(this);
  }

  getMessages(channelId: Snowflake): Message[] {
    return this.byChannel.get(channelId) ?? [];
  }

  getPins(channelId: Snowflake): Message[] {
    return this.pinsByChannel.get(channelId) ?? [];
  }

  async load(channelId: Snowflake, limit = 50) {
    if (this.loaded.has(channelId)) return;
    try {
      const msgs = await api.listMessages(channelId, limit);
      // API returns newest-first; we store oldest-first for rendering.
      const oldestFirst = [...msgs].reverse().map(normalizeMessage);
      runInAction(() => {
        this.byChannel.set(channelId, oldestFirst);
        this.loaded.add(channelId);
      });
      api.markChannelLoaded(channelId);
    } catch (e) {
      toasts.error("Failed to load messages", String(e));
    }
  }

  /// Load older messages before the oldest currently-loaded message. Used for
  /// infinite scroll when the user scrolls to the top of the message stream.
  /// Returns the number of new messages loaded (0 = none/empty).
  async loadMore(channelId: Snowflake, limit = 50): Promise<number> {
    const list = this.byChannel.get(channelId);
    if (!list || list.length === 0) {
      // Nothing loaded yet; fall back to a normal load.
      await this.load(channelId, limit);
      return this.byChannel.get(channelId)?.length ?? 0;
    }
    const oldestId = list[0].id;
    try {
      const older = await api.listMessages(channelId, limit, oldestId);
      if (older.length === 0) return 0;
      const oldestFirst = [...older].reverse().map(normalizeMessage);
      runInAction(() => {
        // Prepend older messages, deduplicating by id.
        const existing = this.byChannel.get(channelId) ?? [];
        const seen = new Set(existing.map((m) => m.id));
        const deduped = oldestFirst.filter((m) => !seen.has(m.id));
        this.byChannel.set(channelId, [...deduped, ...existing]);
      });
      return older.length;
    } catch (e) {
      toasts.error("Failed to load older messages", String(e));
      return 0;
    }
  }

  async loadPins(channelId: Snowflake) {
    try {
      const pins = await api.listPins(channelId);
      runInAction(() => this.pinsByChannel.set(channelId, pins));
    } catch (e) {
      toasts.error("Failed to load pinned messages", String(e));
    }
  }

  async send(
    channelId: Snowflake,
    content: string,
    replyTo?: Snowflake,
    attachments?: AttachmentInput[],
    stickerIds?: Snowflake[],
  ) {
    // Optimistic send: insert a pending placeholder IMMEDIATELY so the message
    // appears the instant the user hits Enter, then reconcile it against the
    // server's confirmed message. The nonce round-trips (send_message → server
    // → REST response AND the gateway MESSAGE_CREATE echo) so whichever arrives
    // first can replace the placeholder without double-inserting.
    const nonce = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const author = (session.me as unknown as User) ?? ({ id: session.meId ?? "", username: "" } as User);
    const pending: Message = normalizeMessage({
      id: `pending-${nonce}`,
      channel_id: channelId,
      author,
      type: 0,
      content,
      timestamp: nowIso,
      mentions: [],
      mention_roles: [],
      reactions: [],
      attachments: [],
      embeds: [],
      nonce,
      message_reference: replyTo
        ? ({ message_id: replyTo, channel_id: channelId } as unknown as Message["message_reference"])
        : undefined,
      _state: "sending",
      _retry: { content, replyTo, stickerIds },
    } as Message);

    runInAction(() => {
      const list = this.byChannel.get(channelId) ?? [];
      list.push(pending);
      this.byChannel.set(channelId, [...list]);
    });

    try {
      const msg = await api.sendMessage(channelId, content, replyTo, attachments, stickerIds, nonce);
      // Reconcile: replace the pending placeholder (matched by nonce) with the
      // confirmed message. If the gateway already reconciled it, this is a
      // no-op de-dup by id.
      runInAction(() => {
        this.reconcilePending(channelId, nonce, normalizeMessage(msg));
      });
      return msg;
    } catch (e) {
      // Mark the placeholder FAILED so the row shows a retry affordance.
      runInAction(() => {
        const list = this.byChannel.get(channelId);
        if (list) {
          const i = list.findIndex((m) => m.nonce === nonce);
          if (i >= 0) {
            list[i] = { ...list[i], _state: "failed" };
            this.byChannel.set(channelId, [...list]);
          }
        }
      });
      throw e;
    }
  }

  /// Replace a pending optimistic message (by nonce) with the confirmed server
  /// message, or drop the placeholder if the confirmed message is already
  /// present (gateway echo raced ahead). Idempotent.
  @action reconcilePending(channelId: Snowflake, nonce: string, confirmed: Message) {
    const list = this.byChannel.get(channelId);
    if (!list) return;
    const pendingIdx = list.findIndex((m) => m.nonce === nonce && m._state);
    const realIdx = list.findIndex((m) => m.id === confirmed.id && !m._state);
    if (pendingIdx >= 0) {
      if (realIdx >= 0 && realIdx !== pendingIdx) {
        // Real message already inserted (gateway) — remove the placeholder.
        list.splice(pendingIdx, 1);
      } else {
        list[pendingIdx] = confirmed;
      }
      this.byChannel.set(channelId, [...list]);
    } else if (realIdx < 0) {
      list.push(confirmed);
      this.byChannel.set(channelId, [...list]);
    }
  }

  /// Retry a failed optimistic message: drop the failed placeholder and re-send
  /// with its retained arguments.
  async retry(channelId: Snowflake, failedNonce: string) {
    const list = this.byChannel.get(channelId);
    const failed = list?.find((m) => m.nonce === failedNonce && m._state === "failed");
    if (!failed?._retry) return;
    const { content, replyTo, stickerIds } = failed._retry;
    runInAction(() => {
      if (list) this.byChannel.set(channelId, list.filter((m) => m.nonce !== failedNonce));
    });
    await this.send(channelId, content, replyTo, undefined, stickerIds);
  }

  /// Drop a pending/failed optimistic message without sending (user chose to
  /// discard the unsent message).
  @action dropPending(channelId: Snowflake, nonce: string) {
    const list = this.byChannel.get(channelId);
    if (list) this.byChannel.set(channelId, list.filter((m) => m.nonce !== nonce));
  }

  /// Acknowledge that the user has read up to `messageId` in `channelId`.
  /// Best-effort: failures are logged but do not surface to the user. Called
  /// on channel view and on each new MESSAGE_CREATE in the active channel.
  async ack(channelId: Snowflake, messageId: Snowflake) {
    try {
      await api.ackMessage(channelId, messageId);
    } catch (e) {
      toasts.warn("Failed to acknowledge read state", String(e));
    }
  }

  async edit(channelId: Snowflake, messageId: Snowflake, content: string) {
    const msg = await api.editMessage(channelId, messageId, content);
    runInAction(() => {
      const list = this.byChannel.get(channelId);
      if (list) {
        const idx = list.findIndex((m) => m.id === messageId);
        if (idx >= 0) list[idx] = msg;
      }
    });
  }

  async delete(channelId: Snowflake, messageId: Snowflake) {
    // Optimistic delete — the gateway will also send MESSAGE_DELETE.
    runInAction(() => {
      const list = this.byChannel.get(channelId);
      if (list) {
        this.byChannel.set(
          channelId,
          list.filter((m) => m.id !== messageId)
        );
      }
    });
    try {
      await api.deleteMessage(channelId, messageId);
    } catch (e) {
      // The optimistic delete already happened; on failure the gateway won't
      // echo a delete, so we'd need to refetch. For now, log the error.
      toasts.error("Failed to delete message", String(e));
    }
  }

  async pin(channelId: Snowflake, messageId: Snowflake, pin: boolean) {
    if (pin) await api.pinMessage(channelId, messageId);
    else await api.unpinMessage(channelId, messageId);
    runInAction(() => {
      const list = this.byChannel.get(channelId);
      if (list) {
        const m = list.find((m) => m.id === messageId);
        if (m) m.pinned = pin;
      }
      // Invalidate pin cache so a reopen refetches.
      this.pinsByChannel.delete(channelId);
    });
  }

  async toggleReaction(
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: string,
    customEmojiId: Snowflake | undefined,
    reacted: boolean
  ) {
    // Optimistic update.
    this.applyReaction(channelId, messageId, emoji, customEmojiId, reacted);
    try {
      if (reacted) {
        await api.removeOwnReaction(channelId, messageId, emoji, customEmojiId);
      } else {
        await api.addReaction(channelId, messageId, emoji, customEmojiId);
      }
    } catch (e) {
      // Revert on failure.
      this.applyReaction(channelId, messageId, emoji, customEmojiId, !reacted);
      toasts.error("Failed to toggle reaction", String(e));
    }
  }

  @action applyReaction(
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: string,
    customEmojiId: Snowflake | undefined,
    removed: boolean
  ) {
    const list = this.byChannel.get(channelId);
    if (!list) return;
    const m = list.find((m) => m.id === messageId);
    if (!m) return;
    const existing = m.reactions.find((r) =>
      customEmojiId
        ? r.emoji.id === customEmojiId
        : r.emoji.id == null && r.emoji.name === emoji
    );
    if (existing) {
      if (removed) {
        existing.count = Math.max(0, existing.count - 1);
        existing.me = false;
        if (existing.count === 0) {
          m.reactions = m.reactions.filter((r) => r !== existing);
        }
      } else {
        existing.count += 1;
        existing.me = true;
      }
    } else if (!removed) {
      m.reactions.push({
        emoji: { id: customEmojiId ?? null, name: emoji, animated: false },
        count: 1,
        me: true,
      });
    }
    this.byChannel.set(channelId, [...list]);
  }

  markUnread(channelId: Snowflake) {
    this.unread.add(channelId);
  }

  markRead(channelId: Snowflake) {
    this.unread.delete(channelId);
  }

  @action addTyping(channelId: Snowflake, userId: Snowflake) {
    if (userId === session.meId) return;
    const map = this.typingByChannel.get(channelId) ?? new Map<Snowflake, number>();
    map.set(userId, Date.now() + 10000); // 10s expiry
    this.typingByChannel.set(channelId, map);
  }

  @action purgeExpiredTyping() {
    const now = Date.now();
    for (const [cid, map] of this.typingByChannel) {
      for (const [uid, deadline] of map) {
        if (deadline < now) map.delete(uid);
      }
      if (map.size === 0) this.typingByChannel.delete(cid);
    }
  }

  typingUsers(channelId: Snowflake, resolveName: (uid: Snowflake) => string | undefined): string[] {
    const map = this.typingByChannel.get(channelId);
    if (!map || map.size === 0) return [];
    return [...map.keys()]
      .map((uid) => resolveName(uid))
      .filter((n): n is string => !!n)
      .slice(0, 3);
  }

  // Apply a gateway MESSAGE_CREATE.
  @action applyMessageCreate(msg: Message) {
    const m = normalizeMessage(msg);
    const cid = m.channel_id;
    const list = this.byChannel.get(cid) ?? [];
    // Optimistic reconciliation: if this echo carries a nonce that matches a
    // pending placeholder we inserted locally, swap the placeholder for the
    // confirmed message (instead of appending a duplicate).
    if (m.nonce) {
      const pendingIdx = list.findIndex((x) => x.nonce === m.nonce && x._state);
      if (pendingIdx >= 0) {
        list[pendingIdx] = m;
        this.byChannel.set(cid, [...list]);
        this.typingByChannel.delete(cid);
        if (ui.selectedChannelId === cid) messages.ack(cid, m.id);
        return;
      }
    }
    if (!list.some((x) => x.id === m.id)) {
      list.push(m);
      this.byChannel.set(cid, [...list]);
    }
    // Clear typing for this channel since a message arrived.
    this.typingByChannel.delete(cid);
    // B.8: when the message lands in the active channel, ACK it to the server
    // so read state (and unread/mention badges across devices) stays in sync.
    // When it's not the active channel, mark it unread locally.
    if (ui.selectedChannelId === cid) {
      messages.ack(cid, m.id);
    } else {
      this.unread.add(cid);
    }
    // D.18: bump the server-side mention count when the message mentions the
    // current user (so the inbox + badge reflect it even before the next
    // read-state fetch).
    const mentionsMe = m.mentions.some((u) => u.id === session.meId);
    if (mentionsMe) {
      const rs = readState.byChannel.get(cid);
      readState.byChannel.set(cid, {
        id: cid,
        mention_count: (rs?.mention_count ?? 0) + 1,
        last_message_id: m.id,
        last_pin_timestamp: rs?.last_pin_timestamp,
      });
      // D.22: fire a desktop notification when the window isn't focused and
      // the message mentions the user.
      if (!document.hasFocus()) {
        fireDesktopNotification(m).catch(() => {});
      }
    }
    // Re-sort DM list if it's a DM.
    const dm = dms.channels.find((c) => c.id === cid);
    if (dm) {
      dm.last_message_id = m.id;
      dms.sort();
    }
    // Message chime — skip our own messages. DMs use the direct-message sound,
    // a message in the currently-open channel uses the quieter same-channel
    // sound, everything else uses the standard message sound.
    if (m.author?.id !== session.meId) {
      if (dm) playSound("direct-message");
      else if (ui.selectedChannelId === cid) playSound("same-channel-message");
      else if (mentionsMe) playSound("message");
    }
  }

  @action applyMessageUpdate(msg: Message) {
    const m = normalizeMessage(msg);
    const cid = m.channel_id;
    const list = this.byChannel.get(cid);
    if (!list) return;
    const idx = list.findIndex((x) => x.id === m.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...m };
      this.byChannel.set(cid, [...list]);
    }
  }

  @action applyMessageDelete(channelId: Snowflake, messageId: Snowflake) {
    const list = this.byChannel.get(channelId);
    if (!list) return;
    this.byChannel.set(
      channelId,
      list.filter((m) => m.id !== messageId)
    );
  }

  @action applyReactionAdd(
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: { id: Snowflake | null; name: string },
    userId: Snowflake,
  ) {
    const list = this.byChannel.get(channelId);
    if (!list) return;
    const m = list.find((m) => m.id === messageId);
    if (!m) return;
    const existing = m.reactions.find((r) =>
      emoji.id ? r.emoji.id === emoji.id : r.emoji.id == null && r.emoji.name === emoji.name
    );
    const isMe = session.meId === userId;
    if (existing) {
      existing.count += 1;
      if (isMe) existing.me = true;
    } else {
      m.reactions.push({
        emoji: { id: emoji.id, name: emoji.name, animated: false },
        count: 1,
        me: isMe,
      });
    }
    this.byChannel.set(channelId, [...list]);
  }

  @action applyReactionRemove(
    channelId: Snowflake,
    messageId: Snowflake,
    emoji: { id: Snowflake | null; name: string },
    userId: Snowflake,
  ) {
    const list = this.byChannel.get(channelId);
    if (!list) return;
    const m = list.find((m) => m.id === messageId);
    if (!m) return;
    const existing = m.reactions.find((r) =>
      emoji.id ? r.emoji.id === emoji.id : r.emoji.id == null && r.emoji.name === emoji.name
    );
    if (!existing) return;
    existing.count = Math.max(0, existing.count - 1);
    if (session.meId === userId) existing.me = false;
    if (existing.count === 0) {
      m.reactions = m.reactions.filter((r) => r !== existing);
    }
    this.byChannel.set(channelId, [...list]);
  }

  @action applyPinsChanged(channelId: Snowflake) {
    this.pinsByChannel.delete(channelId);
  }
}

// ---------------------------------------------------------------------------
// DMs store
// ---------------------------------------------------------------------------

export class DmsStore {
  channels: Channel[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  set(channels: Channel[]) {
    this.channels = channels;
    this.sort();
  }

  @action sort() {
    // Sort by last_message_id snowflake DESC (most recent activity first).
    // Channels with no last_message_id sort last. This mirrors Fluxer's DM
    // ordering: recent messages/calls push the DM to the top.
    this.channels = [...this.channels].sort((a, b) => {
      const aId = a.last_message_id ?? "";
      const bId = b.last_message_id ?? "";
      return bId.localeCompare(aId);
    });
  }

  @action add(channel: Channel) {
    if (!this.channels.some((c) => c.id === channel.id)) {
      this.channels.unshift(channel);
      this.sort();
    }
  }

  @action remove(channelId: Snowflake) {
    this.channels = this.channels.filter((c) => c.id !== channelId);
  }

  getDm(channelId: Snowflake): Channel | undefined {
    return this.channels.find((c) => c.id === channelId);
  }

  /// Find an existing DM channel with a given recipient user id.
  findDmWithUser(userId: Snowflake): Channel | undefined {
    return this.channels.find(
      (c) => c.recipients.length === 1 && c.recipients[0]?.id === userId
    );
  }

  /// The user's personal-notes channel (a self-DM backed by Fluxer's
  /// `DM_PERSONAL_NOTES` channel type). Identified by the notes channel type
  /// when present; falls back to a DM whose sole recipient is the current user.
  /// Returns `undefined` when the user has no notes channel loaded yet.
  get notesChannel(): Channel | undefined {
    const meId = session.me?.id;
    if (!meId) return undefined;
    // Prefer the explicit notes channel type.
    const byType = this.channels.find((c) => c.type === channelType.DM_PERSONAL_NOTES);
    if (byType) return byType;
    // Fall back to a self-DM: a non-group DM whose only recipient is me.
    return this.channels.find(
      (c) => c.type === channelType.DM && c.recipients.length === 1 && c.recipients[0]?.id === meId,
    );
  }
}

// ---------------------------------------------------------------------------
// Relationships store
// ---------------------------------------------------------------------------

export class RelationshipsStore {
  relationships: Relationship[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  set(rels: Relationship[]) {
    this.relationships = rels;
  }

  get friends(): Relationship[] {
    return this.relationships.filter((r) => r.type === 1);
  }
  get pending(): Relationship[] {
    return this.relationships.filter((r) => r.type === 3 || r.type === 4);
  }
  get blocked(): Relationship[] {
    return this.relationships.filter((r) => r.type === 2);
  }

  async load() {
    try {
      const rels = await api.listRelationships();
      runInAction(() => (this.relationships = rels));
    } catch (e) {
      toasts.error("Failed to load relationships", String(e));
    }
  }

  async sendFriendRequest(userId: string) {
    const rel = await api.sendFriendRequest(userId);
    runInAction(() => this.relationships.push(rel));
    return rel;
  }

  async remove(userId: Snowflake) {
    await api.removeRelationship(userId);
    runInAction(() => {
      this.relationships = this.relationships.filter((r) => r.user.id !== userId);
    });
  }

  /// Find the relationship type for a user (undefined = no relationship).
  getRelationship(userId: Snowflake): Relationship | undefined {
    return this.relationships.find((r) => r.user.id === userId);
  }
}

// ---------------------------------------------------------------------------
// Presence store — tracks online/offline status per user via gateway events.
// ---------------------------------------------------------------------------

export type PresenceStatus = "online" | "dnd" | "idle" | "invisible" | "offline";

export class PresenceStore {
  // userId -> status
  statuses = observable.map<Snowflake, PresenceStatus>();
  // userId -> mobile flag
  mobile = observable.map<Snowflake, boolean>();

  constructor() {
    makeAutoObservable(this);
  }

  getStatus(userId: Snowflake): PresenceStatus {
    return this.statuses.get(userId) ?? "offline";
  }

  isOnline(userId: Snowflake): boolean {
    const s = this.getStatus(userId);
    return s === "online" || s === "dnd" || s === "idle";
  }

  isMobile(userId: Snowflake): boolean {
    return this.mobile.get(userId) ?? false;
  }

  @action handlePresenceUpdate(data: {
    user: { id: Snowflake };
    status?: string | null;
    mobile?: boolean;
    guild_id?: string | null;
  }) {
    const userId = data.user?.id;
    if (!userId) return;
    // Ignore updates for the current user (own presence is local).
    if (userId === session.meId) return;
    const status = normalizeStatus(data.status);
    if (status === "offline" && !data.guild_id) {
      this.statuses.delete(userId);
      this.mobile.delete(userId);
    } else {
      this.statuses.set(userId, status);
      this.mobile.set(userId, !!data.mobile);
    }
  }

  @action handlePresenceBulk(presences: any[]) {
    for (const p of presences) {
      this.handlePresenceUpdate(p);
    }
  }

  @action setFromReady(presences: any[]) {
    this.statuses.clear();
    this.mobile.clear();
    if (Array.isArray(presences)) {
      for (const p of presences) {
        this.handlePresenceUpdate(p);
      }
    }
  }

  @action clear() {
    this.statuses.clear();
    this.mobile.clear();
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(Math.max(v, 0), 1);
}

function normalizeStatus(s?: string | null): PresenceStatus {
  if (!s) return "offline";
  switch (s) {
    case "online":
    case "dnd":
    case "idle":
    case "invisible":
    case "offline":
      return s;
    default:
      return "offline";
  }
}

// ---------------------------------------------------------------------------
// Voice store — tracks who is in which voice channel and the LiveKit
// connection info for the current user's voice session. The actual LiveKit
// media connection (livekit-client) lives in the webview via the
// `LiveKitRoom` wrapper in `voice/LiveKitRoom.ts`; this store owns the wrapper
// and reacts to its events so the UI can render the voice-channel participant
// list and the in-call controls.
// ---------------------------------------------------------------------------

export class VoiceStore {
  // Voice states keyed by guild id -> array of voice states. DM/group-DM
  // voice states are keyed under the synthetic id "__dm".
  statesByGuild = observable.map<Snowflake, VoiceState[]>();
  // The LiveKit token + endpoint for the current user's voice session, set
  // when VOICE_SERVER_UPDATE arrives after a VOICE_STATE_UPDATE join. The
  // webview's livekit-client code consumes this to connect.
  voiceServer: VoiceServerUpdate | null = null;
  // The current user's voice session id (from the echoed VOICE_STATE_UPDATE).
  mySessionId: string | null = null;

  // --- LiveKit-driven state (C.10/C.12) ----------------------------------
  // The LiveKit room wrapper. Lazily created on first join; reused across
  // reconnects. `null` when no room has ever been created (e.g. before login).
  room: LiveKitRoom | null = null;
  // The LiveKit connection state, mirrored from `room.state` via events.
  connectionState: VoiceConnectionState = "disconnected";
  // The participants in the current LiveKit room, refreshed on every
  // `participants` event from the wrapper.
  participants: VoiceParticipant[] = [];
  // Identities present at the last `participants` event, for join/leave chimes.
  // Not observable — purely a diff helper.
  private _participantIds: Set<string> = new Set();
  // The identity of the currently-active speaker, or null when no one is
  // speaking. Used to highlight the speaker in the participant list.
  activeSpeaker: string | null = null;
  // The channel id the local user is currently joining (set when we send op 4
  // and cleared once VOICE_SERVER_UPDATE arrives + the room connects). Used to
  // pair the join flow.
  pendingChannelId: Snowflake | null = null;
  // The guild id of the channel we're joining (null for DM voice).
  pendingGuildId: Snowflake | null = null;
  // Whether the local user has been server-muted (reflected from
  // VOICE_STATE_UPDATE). The controls UI shows a distinct icon for this.
  serverMuted = false;
  // Whether the local user has been server-deafened.
  serverDeafened = false;
  // The last error from the LiveKit room, surfaced as a toast/banner. Cleared
  // on a successful connect.
  lastError: string | null = null;

  // --- Device selections (G.35) ------------------------------------------
  // The selected mic/camera/output device ids, persisted to localStorage so
  // they survive restarts. Applied on the next voice connect.
  micId = "";
  camId = "";
  outputId = "";
  // UI sound effect preferences (mute toggle + master volume 0..1).
  soundsEnabled = true;
  soundVolume = 0.5;

  constructor() {
    makeAutoObservable(this);
    // Restore persisted device + sound selections.
    try {
      this.micId = localStorage.getItem("voice.micId") ?? "";
      this.camId = localStorage.getItem("voice.camId") ?? "";
      this.outputId = localStorage.getItem("voice.outputId") ?? "";
      const en = localStorage.getItem("sounds.enabled");
      if (en != null) this.soundsEnabled = en === "1";
      const vol = localStorage.getItem("sounds.volume");
      if (vol != null) this.soundVolume = clamp01(parseFloat(vol));
    } catch {
      // localStorage may be unavailable (private mode); ignore.
    }
    // Push restored prefs into the sound engine.
    setSoundsMuted(!this.soundsEnabled);
    setMasterVolume(this.soundVolume);
    setSoundOutputDevice(this.outputId || null);
  }

  @action setSoundsEnabled(v: boolean) {
    this.soundsEnabled = v;
    setSoundsMuted(!v);
    try { localStorage.setItem("sounds.enabled", v ? "1" : "0"); } catch {}
  }
  @action setSoundVolume(v: number) {
    this.soundVolume = clamp01(v);
    setMasterVolume(this.soundVolume);
    try { localStorage.setItem("sounds.volume", String(this.soundVolume)); } catch {}
  }

  @action setMic(id: string) {
    this.micId = id;
    try { localStorage.setItem("voice.micId", id); } catch {}
  }
  @action setCam(id: string) {
    this.camId = id;
    try { localStorage.setItem("voice.camId", id); } catch {}
  }
  @action setOutput(id: string) {
    this.outputId = id;
    try { localStorage.setItem("voice.outputId", id); } catch {}
    // Apply to the active room immediately if connected.
    if (this.room) this.room.setOutputDevice(id).catch(() => {});
    // Route UI sound effects to the same output device.
    setSoundOutputDevice(id || null);
  }

  /// All voice states for a guild (or the DM bucket). Returns an empty array
  /// when no one is in voice.
  statesFor(guildId: Snowflake): VoiceState[] {
    return this.statesByGuild.get(guildId) ?? [];
  }

  /// The voice state for a specific user in a guild, if any.
  stateForUser(guildId: Snowflake, userId: Snowflake): VoiceState | undefined {
    return this.statesFor(guildId).find((v) => v.user_id === userId);
  }

  /// The channel id the current user is connected to in a guild, or null.
  myChannelId(guildId: Snowflake): Snowflake | null {
    return this.stateForUser(guildId, session.meId ?? "")?.channel_id ?? null;
  }

  /// Cross-guild voice activity: every voice channel with at least one
  /// connected member, grouped by guild + channel. Drives the Voice Activity
  /// feed in the home sidebar.
  get activityFeed(): {
    guildId: Snowflake;
    channelId: Snowflake;
    userIds: Snowflake[];
  }[] {
    const out: { guildId: Snowflake; channelId: Snowflake; userIds: Snowflake[] }[] = [];
    for (const [guildId, states] of this.statesByGuild.entries()) {
      const byChannel = new Map<Snowflake, Snowflake[]>();
      for (const v of states) {
        if (!v.channel_id) continue;
        const arr = byChannel.get(v.channel_id) ?? [];
        arr.push(v.user_id);
        byChannel.set(v.channel_id, arr);
      }
      for (const [channelId, userIds] of byChannel.entries()) {
        out.push({ guildId, channelId, userIds });
      }
    }
    return out;
  }

  /// Whether the current user is in any voice channel.
  get inVoice(): boolean {
    for (const states of this.statesByGuild.values()) {
      if (states.some((v) => v.user_id === session.meId && v.channel_id)) {
        return true;
      }
    }
    return false;
  }

  /// Whether the LiveKit room is connected (the media layer is up).
  get connected(): boolean {
    return this.connectionState === "connected";
  }

  /// The local participant, or null when not in a room.
  get localParticipant(): VoiceParticipant | null {
    return this.participants.find((p) => p.isLocal) ?? null;
  }

  @action applyVoiceStateUpdate(data: VoiceState) {
    const key = data.guild_id ?? "__dm";
    const list = this.statesByGuild.get(key) ?? [];
    const idx = list.findIndex((v) => v.user_id === data.user_id);
    if (data.channel_id == null) {
      // User disconnected — remove their state entirely.
      if (idx >= 0) {
        this.statesByGuild.set(key, list.filter((v) => v.user_id !== data.user_id));
      }
    } else if (idx >= 0) {
      const updated = [...list];
      updated[idx] = { ...updated[idx], ...data };
      this.statesByGuild.set(key, updated);
    } else {
      this.statesByGuild.set(key, [...list, data]);
    }
    // Track our own session id so we can pair with VOICE_SERVER_UPDATE.
    if (data.user_id === session.meId) {
      this.mySessionId = data.session_id ?? this.mySessionId;
      // C.12: reflect server mute/deafen from the echoed VOICE_STATE_UPDATE.
      this.serverMuted = data.self_mute ?? this.serverMuted;
      this.serverDeafened = data.self_deaf ?? this.serverDeafened;
    }
  }

  @action applyVoiceServerUpdate(data: VoiceServerUpdate) {
    this.voiceServer = data;
    // C.12: now that we have the endpoint + token, connect the LiveKit room.
    // The pending channel/guild ids were set by `joinChannel`.
    this.connectRoom(data).catch((e) => {
      this.lastError = `voice connect failed: ${String(e)}`;
    });
  }

  /// Join a voice channel. Sends op 4 VOICE_STATE_UPDATE via the gateway; the
  /// server responds with a VOICE_STATE_UPDATE echo + VOICE_SERVER_UPDATE
  /// carrying the LiveKit connection info, which triggers `connectRoom`.
  /// `guildId` is null for DM/group-DM voice channels.
  async joinChannel(guildId: Snowflake | null, channelId: Snowflake) {
    this.pendingChannelId = channelId;
    this.pendingGuildId = guildId;
    this.lastError = null;
    await api.voiceStateUpdate(guildId, channelId);
  }

  /// Leave the current voice channel. Sends op 4 with `channel_id: null` and
  /// disconnects the LiveKit room.
  async leaveChannel() {
    const guildId = this.pendingGuildId;
    this.pendingChannelId = null;
    this.pendingGuildId = null;
    playSound("voice-disconnect");
    await api.voiceStateUpdate(guildId, null);
    await this.disconnectRoom();
  }

  /// Connect the LiveKit room using the endpoint + token from
  /// VOICE_SERVER_UPDATE. Idempotent: if a room is already connected it's
  /// disconnected first. Resolves once the room is connected. Passes the
  /// persisted device selections (mic/camera) to LiveKit; the output device is
  /// applied after connect via setOutputDevice.
  async connectRoom(server: VoiceServerUpdate) {
    if (!this.room) {
      this.room = new LiveKitRoom();
      this.wireRoomEvents(this.room);
    }
    // If we're already connected (e.g. moving channels), disconnect first.
    if (this.room.state !== "disconnected") {
      await this.room.disconnect();
    }
    runInAction(() => { this.connectionState = "connecting"; });
    await this.room.connect(server.endpoint, server.token, {
      publishMic: true,
      voiceActivity: true,
      // Pure audio: device id only. The no-DSP flags (echo/noise/gain off) are
      // force-merged in LiveKitRoom. We deliberately do NOT force stereo or a
      // fixed channelCount here — forcing stereo capture breaks publishing on
      // mono mics / WebView2 (the track fails to route and nobody hears audio).
      // Mono 48 kHz with no processing is the universally-routable pure config.
      // Use `ideal` (not `exact`) so a saved device that's since been unplugged
      // gracefully falls back to the default mic instead of throwing
      // OverconstrainedError and leaving the user with NO working mic.
      audioCapture: this.micId ? { deviceId: { ideal: this.micId } } : undefined,
      // High-fidelity publish, but RED ON (forward error correction — needed for
      // packet-loss recovery on real networks; without it audio drops out) and
      // DTX OFF (continuous stream). Mono so it always routes.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audioPublish: {
        audioPreset: { maxBitrate: 128_000 },
        red: true,
        dtx: false,
      } as any,
      // `ideal` (not `exact`) so an unplugged camera falls back to the default
      // instead of failing the camera publish outright.
      videoCapture: this.camId ? { deviceId: { ideal: this.camId } } : undefined,
    });
    // Apply the selected output (speaker) device to remote audio elements.
    if (this.outputId) {
      this.room.setOutputDevice(this.outputId).catch(() => {});
    }
  }

  /// Disconnect the LiveKit room and clear LiveKit-derived state.
  async disconnectRoom() {
    if (this.room) {
      await this.room.disconnect();
    }
    // Mutations after an `await` run outside the action context, so wrap them
    // explicitly (MobX strict-mode requires every observable write in an action).
    runInAction(() => {
      this.participants = [];
      this._participantIds = new Set();
      this.activeSpeaker = null;
      this.connectionState = "disconnected";
    });
  }

  /// Toggle the local mic. Used by the UserArea mic button + in-call controls.
  async toggleMic() {
    if (!this.room) return;
    const enabled = !this.room.micEnabled;
    playSound(enabled ? "unmute" : "mute");
    await this.room.setMicEnabled(enabled);
    // Reflect the change back to the server via op 4 so other clients see the
    // mute state update.
    await api.voiceStateUpdate(this.pendingGuildId, this.pendingChannelId, !enabled);
  }

  /// Set the mic to a specific on/off state. Used by PTT (hotkey down = on,
  /// hotkey up = off). Reflects the mute state to the server via op 4.
  async setMicEnabled(enabled: boolean) {
    if (!this.room) return;
    await this.room.setMicEnabled(enabled);
    await api.voiceStateUpdate(this.pendingGuildId, this.pendingChannelId, !enabled);
  }

  /// Toggle the local camera.
  async toggleCamera() {
    if (!this.room) return;
    const next = !this.room.cameraEnabled;
    playSound(next ? "camera-on" : "camera-off");
    await this.room.setCameraEnabled(next);
  }

  /// Toggle screen share. Surfaces failures (user cancels the OS picker,
  /// WebView2 capture error) as a toast instead of silently doing nothing —
  /// previously a rejected getDisplayMedia looked like "the button does
  /// nothing".
  async toggleScreenShare() {
    if (!this.room) return;
    const next = !this.room.screenShareEnabled;
    playSound(next ? "stream-start" : "stream-stop");
    try {
      await this.room.setScreenShareEnabled(next);
    } catch (e) {
      // A user cancelling the OS picker throws NotAllowedError/AbortError —
      // that's not a real failure, so don't nag. Surface everything else.
      const name = (e as { name?: string })?.name ?? "";
      if (name !== "NotAllowedError" && name !== "AbortError") {
        toasts.error("Screen share failed", String(e));
      }
      // Re-throw is intentionally suppressed: the button handler already
      // swallows, and we've surfaced what matters.
    }
  }

  /// Toggle local deafen. Reflects on the LiveKit room (so the participant
  /// list shows the indicator + remote audio is muted locally) and on the
  /// server via op 4.
  async toggleDeafen() {
    if (!this.room) return;
    const next = !this.serverDeafened;
    playSound(next ? "deaf" : "undeaf");
    this.setServerDeafened(next);
    if (this.room) {
      this.room.localDeafened = next;
      await this.room.setMicEnabled(!next ? this.room.micEnabled : false);
    }
    await api.voiceStateUpdate(this.pendingGuildId, this.pendingChannelId, next ? true : !this.room?.micEnabled, next);
  }

  @action setServerDeafened(v: boolean) {
    this.serverDeafened = v;
  }

  /// Set per-participant playback volume by Fluxer user id (0..3, 1 = unchanged).
  setRemoteVolume(userId: Snowflake, volume: number) {
    if (this.room) this.room.setRemoteVolumeForUser(userId, volume);
  }

  // ----- Per-user local audio preferences (volume + local mute) -----
  // Volume is a 0..200 percentage (100 = unchanged), mirroring the real client.
  // Both are local-only and persisted across sessions.
  participantVolumes = observable.map<Snowflake, number>();
  localMutes = observable.map<Snowflake, boolean>();

  getVolume(userId: Snowflake): number {
    return this.participantVolumes.get(userId) ?? 100;
  }
  isLocalMuted(userId: Snowflake): boolean {
    return this.localMutes.get(userId) ?? false;
  }
  @action setVolume(userId: Snowflake, value: number) {
    const v = Math.max(0, Math.min(200, Math.round(value)));
    this.participantVolumes.set(userId, v);
    try { localStorage.setItem(`voice.vol.${userId}`, String(v)); } catch {}
    this.applyLocalAudioForUser(userId);
  }
  @action setLocalMute(userId: Snowflake, muted: boolean) {
    this.localMutes.set(userId, muted);
    try { localStorage.setItem(`voice.mute.${userId}`, muted ? "1" : "0"); } catch {}
    this.applyLocalAudioForUser(userId);
  }
  @action toggleLocalMute(userId: Snowflake) {
    this.setLocalMute(userId, !this.isLocalMuted(userId));
  }
  /// Resolve the user's effective 0..1 element volume (0 when locally muted)
  /// and push it to the LiveKit room.
  applyLocalAudioForUser(userId: Snowflake) {
    const effective = this.isLocalMuted(userId) ? 0 : this.getVolume(userId) / 100;
    this.setRemoteVolume(userId, effective);
  }

  /// Subscribe to the LiveKit room's events and mirror them into observable
  /// state so React components can react.
  @action
  private wireRoomEvents(room: LiveKitRoom) {
    room.on((e) => {
      runInAction(() => {
        switch (e.kind) {
          case "state":
            this.connectionState = e.state;
            if (e.state === "connected") {
              this.lastError = null;
              // Local user joined the channel: stop any incoming ring + chime.
              stopSound("incoming-ring");
              playSound("user-join");
            }
            break;
          case "participants": {
            // Diff against the prior set to chime on remote join/leave.
            const prev = this._participantIds;
            const next = new Set(e.participants.map((p) => p.identity));
            if (prev.size > 0) {
              for (const id of next) if (!prev.has(id)) playSound("user-join");
              for (const id of prev) if (!next.has(id)) playSound("user-leave");
            }
            this._participantIds = next;
            this.participants = e.participants;
            break;
          }
          case "activeSpeaker":
            this.activeSpeaker = e.identity;
            break;
          case "trackSubscribed":
            // No state to update here — `participants` events already cover the
            // track presence. Hook left for future per-track UI (e.g. attaching
            // a video track to an element).
            break;
          case "error":
            this.lastError = e.message;
            break;
        }
      });
    });
  }

  @action clear() {
    this.statesByGuild.clear();
    this.voiceServer = null;
    this.mySessionId = null;
    this.participants = [];
    this.activeSpeaker = null;
    this.connectionState = "disconnected";
    this.pendingChannelId = null;
    this.pendingGuildId = null;
    this.serverMuted = false;
    this.serverDeafened = false;
    this.lastError = null;
    // Disconnect the LiveKit room synchronously (best-effort) — `disconnect`
    // is async but we don't need to await it on logout.
    if (this.room) {
      this.room.disconnect().catch(() => {});
    }
    this.room = null;
  }
}

// ---------------------------------------------------------------------------
// Settings store — user settings synced via USER_SETTINGS_UPDATE gateway
// events. The full settings object is large; we only track fields the UI
// renders (status, custom status, theme, locale).
// ---------------------------------------------------------------------------

export class SettingsStore {
  settings: UserSettings = {};

  constructor() {
    makeAutoObservable(this);
  }

  @action applyUpdate(patch: Partial<UserSettings>) {
    // Deep-merge custom_status so a partial update doesn't blow away the
    // emoji when only the text changes (and vice versa).
    const next = { ...this.settings, ...patch };
    if (patch.custom_status && this.settings.custom_status) {
      next.custom_status = { ...this.settings.custom_status, ...patch.custom_status };
    }
    this.settings = next;
  }

  @action clear() {
    this.settings = {};
  }
}

// ---------------------------------------------------------------------------
// Toast store — transient notifications surfaced from store actions instead
// of `console.error`. Each toast has a kind (info/success/warn/error), a
// title, an optional body, and an auto-dismiss deadline. The ToastContainer
// component renders the stack and dismisses expired entries.
// ---------------------------------------------------------------------------

export type ToastKind = "info" | "success" | "warn" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  /// Epoch millis at which the toast should auto-dismiss. The container
  /// checks this on a timer; manual dismiss clears it immediately.
  expiresAt: number;
}

class ToastStore {
  toasts: Toast[] = [];
  private nextId = 1;
  /// Default auto-dismiss delay per kind. Errors stick around longer so the
  /// user has time to read them.
  private ttlMs: Record<ToastKind, number> = {
    info: 4000,
    success: 3000,
    warn: 6000,
    error: 8000,
  };

  constructor() {
    makeAutoObservable(this);
  }

  @action push(kind: ToastKind, title: string, body?: string): number {
    const id = this.nextId++;
    const toast: Toast = {
      id,
      kind,
      title,
      body,
      expiresAt: Date.now() + this.ttlMs[kind],
    };
    this.toasts = [...this.toasts, toast];
    // Cap the stack so a flood of errors doesn't fill the screen.
    if (this.toasts.length > 6) {
      this.toasts = this.toasts.slice(this.toasts.length - 6);
    }
    return id;
  }

  /// Convenience helpers mirroring the old `console.error`/`console.warn`
  /// call sites so the migration is a 1:1 swap.
  info(title: string, body?: string) { this.push("info", title, body); }
  success(title: string, body?: string) { this.push("success", title, body); }
  warn(title: string, body?: string) { this.push("warn", title, body); }
  error(title: string, body?: string) { this.push("error", title, body); }

  @action dismiss(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  /// Drop any toasts past their deadline. Called by the container on a timer.
  @action purgeExpired() {
    const now = Date.now();
    this.toasts = this.toasts.filter((t) => t.expiresAt > now);
  }

  @action clear() {
    this.toasts = [];
  }
}

export const toasts = new ToastStore();

// ---------------------------------------------------------------------------
// Read-state store (D.18) — per-channel mention counts + last-read message
// ids, fetched from `GET /users/@me/read-state`. Drives mention badges and the
// inbox view. The server-side state is the source of truth; local unread
// tracking in `messages.unread` is a fallback for channels without a server
// entry.
// ---------------------------------------------------------------------------

class ReadStateStore {
  /// Read-state entries keyed by channel id.
  byChannel = observable.map<Snowflake, ReadState>();
  /// Whether the initial fetch has completed.
  loaded = false;

  constructor() {
    makeAutoObservable(this);
  }

  /// Fetch the current user's read state from the server. Called once after
  /// login. Subsequent updates arrive via gateway events (MESSAGE_ACK etc.),
  /// which patch `byChannel` directly.
  @action
  async load() {
    try {
      const list = await api.listReadState();
      runInAction(() => {
        this.byChannel.clear();
        for (const rs of list) this.byChannel.set(rs.id, rs);
        this.loaded = true;
      });
    } catch (e) {
      toasts.warn("Failed to load read state", String(e));
    }
  }

  /// Mention count for a channel (0 when no entry exists).
  mentionsFor(channelId: Snowflake): number {
    return this.byChannel.get(channelId)?.mention_count ?? 0;
  }

  /// Total unread mentions across all channels — the inbox badge count.
  get totalMentions(): number {
    let n = 0;
    for (const rs of this.byChannel.values()) n += rs.mention_count ?? 0;
    return n;
  }

  /// Channels with unread mentions, newest-first by last_message_id (best
  /// effort; falls back to channel id ordering).
  get mentionedChannels(): Snowflake[] {
    return [...this.byChannel.values()]
      .filter((rs) => (rs.mention_count ?? 0) > 0)
      .sort((a, b) => (b.last_message_id ?? "").localeCompare(a.last_message_id ?? ""))
      .map((rs) => rs.id);
  }

  /// Patch a single channel's read state (e.g. after a MESSAGE_ACK gateway
  /// event or a local ack).
  @action
  apply(channelId: Snowflake, patch: Partial<ReadState>) {
    const existing = this.byChannel.get(channelId);
    this.byChannel.set(channelId, { id: channelId, ...existing, ...patch });
  }

  /// Clear mentions for a channel (e.g. when the user opens it).
  @action
  clearMentions(channelId: Snowflake) {
    const rs = this.byChannel.get(channelId);
    if (rs) this.byChannel.set(channelId, { ...rs, mention_count: 0 });
  }

  @action clear() {
    this.byChannel.clear();
    this.loaded = false;
  }
}

export const readState = new ReadStateStore();

/// Per-channel message drafts. The composer's unsent text is persisted per
/// channel so switching channels (or restarting the app) doesn't lose what the
/// user was typing — reference-parity with the reference client's
/// MessagingDrafts. Backed by localStorage so drafts survive a restart.
const DRAFTS_KEY = "ruxer.drafts.v1";
class DraftsStore {
  byChannel = new Map<Snowflake, string>();

  constructor() {
    makeAutoObservable(this);
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, string>;
        for (const [k, v] of Object.entries(obj)) this.byChannel.set(k, v);
      }
    } catch {
      /* corrupt/blocked storage — start empty */
    }
  }

  get(channelId: Snowflake): string {
    return this.byChannel.get(channelId) ?? "";
  }

  set(channelId: Snowflake, text: string) {
    if (text) this.byChannel.set(channelId, text);
    else this.byChannel.delete(channelId);
    this.persist();
  }

  clear(channelId: Snowflake) {
    this.byChannel.delete(channelId);
    this.persist();
  }

  private persist() {
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(Object.fromEntries(this.byChannel)));
    } catch {
      /* best effort */
    }
  }
}

export const drafts = new DraftsStore();

// ---------------------------------------------------------------------------
// UI store (navigation + popups)
// ---------------------------------------------------------------------------

export type SideView = "dm" | "friends" | "guild" | "discovery";

// Discriminated target for the abuse-report modal.
export type ReportTarget =
  | { kind: "message"; channelId: Snowflake; messageId: Snowflake }
  | { kind: "user"; userId: Snowflake; guildId?: Snowflake }
  | { kind: "guild"; guildId: Snowflake };

export class UiStore {
  // The active side view.
  side: SideView = "dm";
  // The selected guild index (when side === "guild").
  selectedGuildIndex: number | null = null;
  // The selected channel id (DM or guild channel).
  selectedChannelId: Snowflake | null = null;
  // Right pane: "none" | "members" | "pins".
  rightPane: "none" | "members" | "pins" = "none";
  // Profile popup: user id being viewed (null when closed).
  profileUserId: Snowflake | null = null;
  profilePos: { x: number; y: number } | null = null;
  // Emoji picker open?
  emojiPickerOpen = false;
  // When the emoji picker is opened for a reaction, this holds the target
  // message id + channel id. Null when the picker is for the composer.
  reactionTarget: { channelId: Snowflake; messageId: Snowflake } | null = null;
  // The message id being edited (null = not editing).
  editingMessageId: Snowflake | null = null;
  // Reply target: the message the composer is replying to (null = no reply).
  replyTarget: {
    channelId: Snowflake;
    messageId: Snowflake;
    authorName: string;
    content: string;
  } | null = null;
  // Loaded user profiles cache.
  knownUsers = observable.map<Snowflake, User>();
  // Context menu: the items to show + anchor position (null when closed).
  contextMenu: { items: ContextMenuItem[]; pos: { x: number; y: number } } | null = null;
  // Settings modal open?
  settingsOpen = false;
  // Gateway connection status, driven by `gateway_status` Tauri events.
  // One of: "connecting" | "connected" | "reconnecting" | "disconnected".
  // Defaults to "disconnected" (no banner) until the first real
  // `gateway_status` event arrives — otherwise the banner would permanently
  // show "Connecting…" if the gateway's initial "connecting" event was
  // emitted before the listener attached (a race after login).
  gatewayStatus: "connecting" | "connected" | "reconnecting" | "disconnected" =
    "disconnected";

  // Streamer mode: when on, the app blurs/hides sensitive info (emails, invite
  // codes, MFA secrets, connection details) via a `data-streamer` attribute on
  // <html>. Client-local, persisted to localStorage.
  streamerMode = false;

  constructor() {
    makeAutoObservable(this);
    try {
      this.streamerMode = localStorage.getItem("ui.streamerMode") === "1";
    } catch {
      // localStorage unavailable; default off.
    }
    this.loadFavorites();
    this.loadAccessibility();
  }

  // Favorite channel ids (client-local, persisted). Favorited channels surface
  // in a pinned "Favorites" section at the top of the channel sidebar.
  favoriteChannels = observable.set<Snowflake>();

  @action loadFavorites() {
    try {
      const raw = localStorage.getItem("ui.favoriteChannels");
      if (raw) {
        const ids: Snowflake[] = JSON.parse(raw);
        this.favoriteChannels.replace(ids);
      }
    } catch {
      // ignore parse/storage errors
    }
  }

  isFavorite(channelId: Snowflake): boolean {
    return this.favoriteChannels.has(channelId);
  }

  @action toggleFavorite(channelId: Snowflake) {
    if (this.favoriteChannels.has(channelId)) this.favoriteChannels.delete(channelId);
    else this.favoriteChannels.add(channelId);
    try {
      localStorage.setItem(
        "ui.favoriteChannels",
        JSON.stringify([...this.favoriteChannels]),
      );
    } catch {}
  }

  @action setStreamerMode(on: boolean) {
    this.streamerMode = on;
    try {
      localStorage.setItem("ui.streamerMode", on ? "1" : "0");
    } catch {}
    if (typeof document !== "undefined") {
      if (on) document.documentElement.setAttribute("data-streamer", "");
      else document.documentElement.removeAttribute("data-streamer");
    }
  }

  @action selectDm() {
    this.side = "dm";
    this.selectedGuildIndex = null;
    this.rightPane = "none";
    this.selectedChannelId = null;
  }

  @action selectFriends() {
    this.side = "friends";
    this.selectedGuildIndex = null;
    this.rightPane = "none";
    this.selectedChannelId = null;
    if (relationships.relationships.length === 0) {
      relationships.load();
    }
  }

  @action selectGuild(index: number) {
    this.side = "guild";
    this.selectedGuildIndex = index;
    // Guild channels show the member list by default (matches Fluxer); the user
    // can still toggle it off via the channel header.
    this.rightPane = "members";
    const g = guilds.guilds[index];
    if (g) {
      // Subscribe to this guild's gateway events (messages, typing, members).
      // Fluxer uses per-guild LAZY_REQUEST instead of Discord-style intents, so
      // we must subscribe to receive real-time MESSAGE_CREATE for guild channels.
      api.subscribeGuild(g.id).catch(() => {});
      guilds.loadChannels(g.id);
      guilds.loadMembers(g.id);
      guilds.loadEmojis(g.id);
      // Auto-open first text channel.
      const chs = guilds.channelsByGuild.get(g.id);
      if (chs) {
        const first = chs
          .filter((c) => c.type === channelType.GUILD_TEXT)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
        if (first) this.openChannel(first.id);
        else this.selectedChannelId = null;
      }
    }
  }

  @action openChannel(channelId: Snowflake) {
    this.selectedChannelId = channelId;
    // If we're on the home/friends view, switch to the DM view so the main
    // content shows the message stream instead of the friends page.
    if (this.side === "friends") this.side = "dm";
    // Keep the member list open in guilds; DMs have no member list.
    this.rightPane = this.side === "guild" ? "members" : "none";
    messages.markRead(channelId);
    // D.18: clear server-side mention count for this channel so the inbox
    // badge decrements immediately (the ACK confirms it server-side).
    readState.clearMentions(channelId);
    messages.typingByChannel.delete(channelId);
    if (!messages.loaded.has(channelId)) {
      messages.load(channelId);
    }
    // B.8: ACK the channel so the server-side read state (and unread/mention
    // badges across devices) clears. We ACK the newest loaded message if any,
    // otherwise let the first MESSAGE_CREATE in this channel trigger the ACK.
    const list = messages.getMessages(channelId);
    const newest = list[list.length - 1];
    if (newest) messages.ack(channelId, newest.id);
  }

  @action toggleRightPane(pane: "members" | "pins") {
    this.rightPane = this.rightPane === pane ? "none" : pane;
  }

  // The guild the profile was opened in (so roles resolve against the right
  // guild even when opened from a DM/message/voice row, not the last-selected
  // guild). Null = no guild context.
  profileGuildId: Snowflake | null = null;

  @action openProfile(userId: Snowflake, pos: { x: number; y: number }, guildId?: Snowflake) {
    this.profileUserId = userId;
    this.profilePos = pos;
    this.profileGuildId = guildId ?? this.currentGuild?.id ?? null;
    if (!this.knownUsers.has(userId)) {
      api.getUser(userId).then((u) =>
        runInAction(() => this.knownUsers.set(userId, u))
      );
    }
    // Ensure the member (and thus roles) is loaded for the profile's guild.
    if (this.profileGuildId) {
      guilds.ensureMember(this.profileGuildId, userId).catch(() => {});
    }
  }

  @action closeProfile() {
    this.profileUserId = null;
    this.profilePos = null;
    this.profileGuildId = null;
  }

  @action toggleEmojiPicker(open?: boolean) {
    this.emojiPickerOpen = open ?? !this.emojiPickerOpen;
    if (!this.emojiPickerOpen) this.reactionTarget = null;
  }

  @action openReactionPicker(channelId: Snowflake, messageId: Snowflake) {
    this.reactionTarget = { channelId, messageId };
    this.emojiPickerOpen = true;
  }

  @action openContextMenu(items: ContextMenuItem[], pos: { x: number; y: number }) {
    this.contextMenu = { items, pos };
  }

  @action closeContextMenu() {
    this.contextMenu = null;
  }

  @action openSettings() {
    this.settingsOpen = true;
  }

  @action closeSettings() {
    this.settingsOpen = false;
  }

  // In-app image viewer (lightbox). Holds the source URL of the image to show
  // full-screen, or null when closed.
  imageViewerUrl: string | null = null;
  @action openImageViewer(url: string) {
    this.imageViewerUrl = url;
  }
  @action closeImageViewer() {
    this.imageViewerUrl = null;
  }

  // Quick switcher (Cmd-K) open state.
  quickSwitcherOpen = false;

  @action openQuickSwitcher() {
    this.quickSwitcherOpen = true;
  }

  @action closeQuickSwitcher() {
    this.quickSwitcherOpen = false;
  }

  @action toggleQuickSwitcher() {
    this.quickSwitcherOpen = !this.quickSwitcherOpen;
  }

  // Create/Join guild modal open state.
  createGuildOpen = false;

  @action openCreateGuild() {
    this.createGuildOpen = true;
  }

  @action closeCreateGuild() {
    this.createGuildOpen = false;
  }

  // Search modal open state (D.16).
  searchOpen = false;

  @action openSearch() {
    this.searchOpen = true;
  }

  @action closeSearch() {
    this.searchOpen = false;
  }

  // Guild settings modal (D.20): the guild id being configured.
  guildSettingsOpen = false;
  guildSettingsGuildId: Snowflake | null = null;

  @action openGuildSettings(guildId: Snowflake) {
    this.guildSettingsGuildId = guildId;
    this.guildSettingsOpen = true;
  }

  @action closeGuildSettings() {
    this.guildSettingsOpen = false;
    this.guildSettingsGuildId = null;
  }

  // Abuse-report modal target (null = closed).
  reportTarget: ReportTarget | null = null;

  @action openReport(target: ReportTarget) {
    this.reportTarget = target;
  }

  @action closeReport() {
    this.reportTarget = null;
  }

  // Accessibility prefs (client-local, persisted). Applied to <html> via a CSS
  // var (--saturation-factor, --font-scale) + a data attribute (reduced motion).
  saturation = 1; // 0..1
  fontScale = 1; // 0.85..1.3
  reducedMotion = false;

  @action loadAccessibility() {
    try {
      const s = localStorage.getItem("a11y.saturation");
      if (s != null) this.saturation = clamp01(parseFloat(s));
      const f = localStorage.getItem("a11y.fontScale");
      if (f != null) this.fontScale = Math.min(Math.max(parseFloat(f) || 1, 0.85), 1.3);
      this.reducedMotion = localStorage.getItem("a11y.reducedMotion") === "1";
    } catch {
      // ignore
    }
    this.applyAccessibility();
  }

  applyAccessibility() {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--saturation-factor", String(this.saturation));
    root.style.setProperty("--font-scale", String(this.fontScale));
    if (this.reducedMotion) root.setAttribute("data-reduced-motion", "");
    else root.removeAttribute("data-reduced-motion");
  }

  @action setSaturation(v: number) {
    this.saturation = clamp01(v);
    try { localStorage.setItem("a11y.saturation", String(this.saturation)); } catch {}
    this.applyAccessibility();
  }
  @action setFontScale(v: number) {
    this.fontScale = Math.min(Math.max(v, 0.85), 1.3);
    try { localStorage.setItem("a11y.fontScale", String(this.fontScale)); } catch {}
    this.applyAccessibility();
  }
  @action setReducedMotion(on: boolean) {
    this.reducedMotion = on;
    try { localStorage.setItem("a11y.reducedMotion", on ? "1" : "0"); } catch {}
    this.applyAccessibility();
  }

  // Theme Studio modal.
  themeStudioOpen = false;

  @action openThemeStudio() {
    this.themeStudioOpen = true;
  }

  @action closeThemeStudio() {
    this.themeStudioOpen = false;
  }

  @action setGatewayStatus(status: "connecting" | "connected" | "reconnecting" | "disconnected") {
    this.gatewayStatus = status;
  }

  /// Set the reply target on the composer for the current channel. The
  /// composer renders a preview above the input and clears itself on send.
  @action setReplyTarget(message: { channelId: Snowflake; messageId: Snowflake; authorName: string; content: string }) {
    this.replyTarget = message;
  }

  @action clearReplyTarget() {
    this.replyTarget = null;
  }

  get currentGuild(): Guild | undefined {
    return this.selectedGuildIndex != null
      ? guilds.guilds[this.selectedGuildIndex]
      : undefined;
  }

  get currentChannel(): Channel | undefined {
    if (!this.selectedChannelId) return undefined;
    // Search DMs first.
    const dm = dms.getDm(this.selectedChannelId);
    if (dm) return dm;
    // Then guild channels.
    for (const chs of guilds.channelsByGuild.values()) {
      const c = chs.find((c) => c.id === this.selectedChannelId);
      if (c) return c;
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Singleton stores
// ---------------------------------------------------------------------------

export const session = new SessionStore();
export const guilds = new GuildsStore();
export const messages = new MessagesStore();
export const dms = new DmsStore();
export const relationships = new RelationshipsStore();
export const presence = new PresenceStore();
export const voice = new VoiceStore();
export const settings = new SettingsStore();
export const ui = new UiStore();

// Cross-store references (used inside stores above). These are assigned after
// all singletons exist.
// (MobX tracks these via closures; the `session`/`ui`/etc. references resolve at
// call-time.)

// Bootstrap login result into all stores.
export async function applyLoginResult(result: LoginResult) {
  session.me = result.me;
  session.meId = result.me.id;
  session.endpoints = result.endpoints ?? null;
  guilds.setGuilds(result.guilds);
  dms.set(result.dms);
  relationships.set(result.relationships);
  presence.clear();
  // D.18: fetch the server-side read state so mention badges are accurate
  // from the start (instead of showing everything as unread until a
  // MESSAGE_CREATE arrives).
  readState.load();
  // Subscribe to all guilds so we receive real-time message events. Fluxer
  // uses per-guild LAZY_REQUEST (op 14) instead of Discord-style intents.
  for (const g of result.guilds) {
    api.subscribeGuild(g.id).catch(() => {});
  }
}

/// Pre-cache identity media (avatars, guild icons, custom emoji) so the app
/// renders without avatar/icon pop-in after login. Channel attachments + image
/// embeds are intentionally NOT preloaded — those load lazily when the user
/// opens a channel/DM. Returns once all fetches resolve OR after `timeoutMs`
/// (whichever is first), so a slow/missing asset never blocks the UI.
export async function preloadIdentityMedia(timeoutMs = 5000): Promise<void> {
  const media = session.endpoints?.media ?? "";
  const staticCdn = session.endpoints?.static_cdn ?? "";
  if (!media && !staticCdn) return;
  const urls = new Set<string>();
  // My avatar (default-avatar fallback uses staticCdn).
  if (session.me) {
    const a = session.me.avatar
      ? `${media}/avatars/${session.me.id}/${session.me.avatar}.webp?size=128`
      : `${staticCdn}/avatars/${bigMod(session.me.id, 6)}.png`;
    if (a) urls.add(a);
  }
  // DM recipients' avatars.
  for (const c of dms.channels) {
    for (const u of c.recipients) {
      if (u.avatar) urls.add(`${media}/avatars/${u.id}/${u.avatar}.webp?size=128`);
      else if (staticCdn) urls.add(`${staticCdn}/avatars/${bigMod(u.id, 6)}.png`);
    }
  }
  // Relationships' avatars (friends list).
  for (const r of relationships.relationships) {
    if (r.user.avatar) urls.add(`${media}/avatars/${r.user.id}/${r.user.avatar}.webp?size=128`);
    else if (staticCdn) urls.add(`${staticCdn}/avatars/${bigMod(r.user.id, 6)}.png`);
  }
  // Guild icons.
  for (const g of guilds.guilds) {
    if (g.icon) {
      const ext = g.icon.startsWith("a_") ? "gif" : "webp";
      urls.add(`${media}/icons/${g.id}/${g.icon}.${ext}?size=128`);
    }
  }
  // Custom emoji across guilds.
  for (const g of guilds.guilds) {
    for (const e of g.emojis) {
      urls.add(`${media}/emojis/${e.id}.${e.animated ? "gif" : "webp"}`);
    }
  }
  if (urls.size === 0) return;
  // Race all fetches against a timeout so one stuck asset doesn't block.
  const fetches = Array.from(urls).map((u) => resolveAssetUrl(u).catch(() => null));
  const all = Promise.all(fetches);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([all.then(() => {}), timeout]);
}

/// Clear all stores on logout.
export function clearStores() {
  presence.clear();
  voice.clear();
  settings.clear();
  toasts.clear();
  readState.clear();
  guilds.guilds = [];
  guilds.channelsByGuild.clear();
  guilds.membersByGuild.clear();
  guilds.emojisByGuild.clear();
  guilds.stickersByGuild.clear();
  guilds.voiceChannelByGuild.clear();
  guilds.threadsById.clear();
  guilds.bansByGuild.clear();
  guilds.subscribedRangesByGuild.clear();
  messages.byChannel.clear();
  messages.loaded.clear();
  messages.pinsByChannel.clear();
  messages.typingByChannel.clear();
  messages.unread.clear();
  dms.channels = [];
  relationships.relationships = [];
  ui.knownUsers.clear();
  gatewayStarted = false;
}

// ---------------------------------------------------------------------------
// Gateway event wiring
// ---------------------------------------------------------------------------

let gatewayStarted = false;

export async function startGatewayListener() {
  if (gatewayStarted) return;
  gatewayStarted = true;
  // Attach both listeners and await their registration so the `gateway` +
  // `gateway_status` event channels are guaranteed to be subscribed before
  // the `login` Tauri command spawns the gateway task and starts emitting.
  // Without awaiting, a race could cause the initial "connecting"/"connected"
  // events to be missed and the banner would stick on its default.
  await Promise.all([
    onGatewayEvent((name, data) => {
      handleGatewayEvent(name, data);
    }),
    listen<{ status: string }>("gateway_status", (e) => {
      const status = e.payload.status as
        | "connecting"
        | "connected"
        | "reconnecting"
        | "disconnected";
      runInAction(() => ui.setGatewayStatus(status));
    }).then(() => {}, (e) => toasts.error("Gateway status listener failed", String(e))),
  ]);
  // Typing expiry loop.
  setInterval(() => messages.purgeExpiredTyping(), 2000);
}

let logStarted = false;

/// Mirror backend tracing records into the webview devtools console so the
/// Rust logs show up next to the frontend logs. Forwarded regardless of login
/// state, since backend init happens before login.
export function startLogListener() {
  if (logStarted) return;
  logStarted = true;
  onBackendLog((entry) => {
    const label = `[backend:${entry.target}]`;
    const args: [string, ...unknown[]] = [`${label} ${entry.message}`];
    switch (entry.level) {
      case "ERROR":
        console.error(...args);
        break;
      case "WARN":
        console.warn(...args);
        break;
      case "INFO":
        console.info(...args);
        break;
      case "DEBUG":
        console.debug(...args);
        break;
      default:
        console.log(...args);
    }
  }).then(undefined, (e) =>
    console.error("Backend log listener failed", e),
  );
}

function handleGatewayEvent(name: string, data: any) {
  switch (name) {
    case "READY": {
      if (Array.isArray(data?.private_channels)) {
        dms.set(data.private_channels as Channel[]);
      }
      // Seed presence from the READY payload.
      if (Array.isArray(data?.presences)) {
        presence.setFromReady(data.presences);
      }
      // Update guilds from READY if present.
      if (Array.isArray(data?.guilds)) {
        runInAction(() => {
          for (const g of data.guilds) {
            const existing = guilds.guilds.find((gg) => gg.id === g.id);
            if (!existing) {
              guilds.guilds = [...guilds.guilds, g];
            }
            // Seed voice states from READY's guild payload.
            if (Array.isArray(g.voice_states)) {
              for (const vs of g.voice_states) {
                voice.applyVoiceStateUpdate(vs);
              }
            }
            // Seed stickers from READY's guild payload.
            if (Array.isArray(g.stickers)) {
              guilds.stickersByGuild.set(g.id, g.stickers);
            }
          }
        });
      }
      // Seed user settings from READY if present.
      if (data?.user_settings && typeof data.user_settings === "object") {
        settings.applyUpdate(data.user_settings as Partial<UserSettings>);
      }
      break;
    }
    case "RESUMED":
      break;

    // --- Messages ---
    case "MESSAGE_CREATE": {
      messages.applyMessageCreate(data as Message);
      break;
    }
    case "MESSAGE_UPDATE": {
      const msg = data as Message;
      if (msg?.channel_id && msg?.id) {
        messages.applyMessageUpdate(msg);
      }
      break;
    }
    case "MESSAGE_DELETE": {
      const cid = data?.channel_id;
      const mid = data?.id;
      if (cid && mid) messages.applyMessageDelete(cid, mid);
      break;
    }
    case "MESSAGE_DELETE_BULK": {
      const cid = data?.channel_id;
      const ids: Snowflake[] = data?.ids ?? [];
      if (cid) {
        runInAction(() => {
          const list = messages.byChannel.get(cid);
          if (list) {
            const idSet = new Set(ids);
            messages.byChannel.set(cid, list.filter((m) => !idSet.has(m.id)));
          }
        });
      }
      break;
    }
    case "MESSAGE_REACTION_ADD": {
      const cid = data?.channel_id;
      const mid = data?.message_id;
      const uid = data?.user_id;
      const emoji = data?.emoji;
      if (cid && mid && uid && emoji) {
        messages.applyReactionAdd(cid, mid, { id: emoji.id ?? null, name: emoji.name ?? "" }, uid);
      }
      break;
    }
    case "MESSAGE_REACTION_REMOVE": {
      const cid = data?.channel_id;
      const mid = data?.message_id;
      const uid = data?.user_id;
      const emoji = data?.emoji;
      if (cid && mid && uid && emoji) {
        messages.applyReactionRemove(cid, mid, { id: emoji.id ?? null, name: emoji.name ?? "" }, uid);
      }
      break;
    }
    case "MESSAGE_REACTION_REMOVE_ALL": {
      const cid = data?.channel_id;
      const mid = data?.message_id;
      if (cid && mid) {
        runInAction(() => {
          const list = messages.byChannel.get(cid);
          if (list) {
            const m = list.find((m) => m.id === mid);
            if (m) m.reactions = [];
            messages.byChannel.set(cid, [...list]);
          }
        });
      }
      break;
    }
    case "MESSAGE_REACTION_REMOVE_EMOJI": {
      const cid = data?.channel_id;
      const mid = data?.message_id;
      const emoji = data?.emoji;
      if (cid && mid && emoji) {
        runInAction(() => {
          const list = messages.byChannel.get(cid);
          if (list) {
            const m = list.find((m) => m.id === mid);
            if (m) {
              m.reactions = m.reactions.filter(
                (r) => !(emoji.id ? r.emoji.id === emoji.id : r.emoji.id == null && r.emoji.name === emoji.name)
              );
              messages.byChannel.set(cid, [...list]);
            }
          }
        });
      }
      break;
    }

    // --- Channels ---
    case "CHANNEL_CREATE": {
      const ch = data as Channel;
      if (ch?.guild_id) {
        const gid = ch.guild_id;
        runInAction(() => {
          const chs = guilds.channelsByGuild.get(gid) ?? [];
          if (!chs.some((c) => c.id === ch.id)) {
            guilds.channelsByGuild.set(gid, [...chs, ch]);
          }
        });
      } else if (ch) {
        dms.add(ch);
      }
      break;
    }
    case "CHANNEL_UPDATE": {
      const ch = data as Channel;
      if (ch?.id && ch?.guild_id) {
        runInAction(() => {
          const chs = guilds.channelsByGuild.get(ch.guild_id!);
          if (chs) {
            const idx = chs.findIndex((c) => c.id === ch.id);
            if (idx >= 0) {
              chs[idx] = { ...chs[idx], ...ch };
              guilds.channelsByGuild.set(ch.guild_id!, [...chs]);
            }
          }
        });
      } else if (ch?.id) {
        runInAction(() => {
          const idx = dms.channels.findIndex((c) => c.id === ch.id);
          if (idx >= 0) {
            dms.channels[idx] = { ...dms.channels[idx], ...ch };
            dms.sort();
          }
        });
      }
      break;
    }
    case "CHANNEL_DELETE": {
      const id = data?.id;
      if (id) {
        dms.remove(id);
        if (data?.guild_id) {
          runInAction(() => {
            const chs = guilds.channelsByGuild.get(data.guild_id);
            if (chs) {
              guilds.channelsByGuild.set(data.guild_id, chs.filter((c) => c.id !== id));
            }
          });
        }
        if (ui.selectedChannelId === id) ui.selectedChannelId = null;
      }
      break;
    }
    case "CHANNEL_PINS_UPDATE": {
      const cid = data?.channel_id;
      if (cid) messages.applyPinsChanged(cid);
      break;
    }
    case "CHANNEL_RECIPIENT_ADD": {
      const cid = data?.channel_id;
      const user = data?.user;
      if (cid && user) {
        runInAction(() => {
          const idx = dms.channels.findIndex((c) => c.id === cid);
          if (idx >= 0 && !dms.channels[idx].recipients.some((u) => u.id === user.id)) {
            dms.channels[idx].recipients = [...dms.channels[idx].recipients, user];
          }
        });
      }
      break;
    }
    case "CHANNEL_RECIPIENT_REMOVE": {
      const cid = data?.channel_id;
      const uid = data?.user?.id;
      if (cid && uid) {
        runInAction(() => {
          const idx = dms.channels.findIndex((c) => c.id === cid);
          if (idx >= 0) {
            dms.channels[idx].recipients = dms.channels[idx].recipients.filter((u) => u.id !== uid);
          }
        });
      }
      break;
    }

    // --- Typing ---
    case "TYPING_START": {
      const cid = data?.channel_id;
      const uid = data?.user_id;
      if (cid && uid) messages.addTyping(cid, uid);
      break;
    }

    // --- Presence ---
    case "PRESENCE_UPDATE": {
      presence.handlePresenceUpdate(data);
      break;
    }
    case "PRESENCE_UPDATE_BULK": {
      if (Array.isArray(data?.presences)) {
        presence.handlePresenceBulk(data.presences);
      }
      break;
    }

    // --- Guilds ---
    case "GUILD_CREATE": {
      if (data?.id) {
        runInAction(() => {
          if (!guilds.guilds.some((g) => g.id === data.id)) {
            guilds.guilds = [...guilds.guilds, data as Guild];
          }
          if (data.channels) guilds.channelsByGuild.set(data.id, data.channels);
          if (data.emojis) guilds.emojisByGuild.set(data.id, data.emojis);
          if (data.members) guilds.membersByGuild.set(data.id, data.members);
        });
        api.subscribeGuild(data.id).catch(() => {});
      }
      break;
    }
    case "GUILD_UPDATE": {
      if (data?.id) {
        runInAction(() => {
          const idx = guilds.guilds.findIndex((g) => g.id === data.id);
          if (idx >= 0) {
            guilds.guilds[idx] = { ...guilds.guilds[idx], ...data };
            guilds.guilds = [...guilds.guilds];
          }
        });
      }
      break;
    }
    case "GUILD_DELETE": {
      if (data?.id) {
        runInAction(() => {
          guilds.guilds = guilds.guilds.filter((g) => g.id !== data.id);
          guilds.channelsByGuild.delete(data.id);
          guilds.membersByGuild.delete(data.id);
          guilds.emojisByGuild.delete(data.id);
        });
        if (ui.selectedGuildIndex != null) {
          const g = guilds.guilds[ui.selectedGuildIndex];
          if (!g || g.id === data.id) ui.selectDm();
        }
      }
      break;
    }
    case "GUILD_EMOJIS_UPDATE": {
      const gid = data?.guild_id;
      const emojis = data?.emojis;
      if (gid && Array.isArray(emojis)) {
        runInAction(() => guilds.emojisByGuild.set(gid, emojis));
      }
      break;
    }

    // --- Guild Members ---
    case "GUILD_MEMBER_ADD": {
      const gid = data?.guild_id;
      const member = data as Member;
      if (gid && member?.user?.id) {
        runInAction(() => {
          const members = guilds.membersByGuild.get(gid) ?? [];
          if (!members.some((m) => m.user.id === member.user.id)) {
            guilds.membersByGuild.set(gid, [...members, member]);
          }
        });
      }
      break;
    }
    case "GUILD_MEMBER_UPDATE": {
      const gid = data?.guild_id;
      if (gid && data?.user?.id) {
        runInAction(() => {
          const members = guilds.membersByGuild.get(gid);
          if (members) {
            const idx = members.findIndex((m) => m.user.id === data.user.id);
            if (idx >= 0) {
              members[idx] = { ...members[idx], ...data };
              guilds.membersByGuild.set(gid, [...members]);
            }
          }
        });
      }
      break;
    }
    case "GUILD_MEMBER_REMOVE": {
      const gid = data?.guild_id;
      const uid = data?.user?.id;
      if (gid && uid) {
        runInAction(() => {
          const members = guilds.membersByGuild.get(gid);
          if (members) {
            guilds.membersByGuild.set(gid, members.filter((m) => m.user.id !== uid));
          }
        });
      }
      break;
    }

    // --- Guild Roles ---
    case "GUILD_ROLE_CREATE": {
      const gid = data?.guild_id;
      const role = data?.role;
      if (gid && role) {
        runInAction(() => {
          const g = guilds.guilds.find((g) => g.id === gid);
          if (g && !g.roles.some((r) => r.id === role.id)) {
            g.roles = [...g.roles, role];
            guilds.guilds = [...guilds.guilds];
          }
        });
      }
      break;
    }
    case "GUILD_ROLE_UPDATE": {
      const gid = data?.guild_id;
      const role = data?.role;
      if (gid && role) {
        runInAction(() => {
          const g = guilds.guilds.find((g) => g.id === gid);
          if (g) {
            const idx = g.roles.findIndex((r) => r.id === role.id);
            if (idx >= 0) {
              g.roles[idx] = role;
              guilds.guilds = [...guilds.guilds];
            }
          }
        });
      }
      break;
    }
    case "GUILD_ROLE_DELETE": {
      const gid = data?.guild_id;
      const rid = data?.role_id;
      if (gid && rid) {
        runInAction(() => {
          const g = guilds.guilds.find((g) => g.id === gid);
          if (g) {
            g.roles = g.roles.filter((r) => r.id !== rid);
            guilds.guilds = [...guilds.guilds];
          }
        });
      }
      break;
    }

    // --- User ---
    case "USER_UPDATE": {
      if (data?.id === session.meId && data?.id) {
        runInAction(() => {
          if (session.me) {
            session.me = { ...session.me, ...data };
          }
        });
      }
      // Update cached user in knownUsers.
      if (data?.id) {
        runInAction(() => {
          const cached = ui.knownUsers.get(data.id);
          if (cached) {
            ui.knownUsers.set(data.id, { ...cached, ...data });
          }
        });
      }
      break;
    }

    // --- Relationships ---
    case "RELATIONSHIP_ADD":
    case "RELATIONSHIP_UPDATE": {
      if (data?.id && data?.user) {
        runInAction(() => {
          const idx = relationships.relationships.findIndex((r) => r.id === data.id);
          if (idx >= 0) {
            relationships.relationships[idx] = data as Relationship;
          } else {
            relationships.relationships.push(data as Relationship);
          }
          relationships.relationships = [...relationships.relationships];
        });
      }
      break;
    }
    case "RELATIONSHIP_REMOVE": {
      const id = data?.id;
      if (id) {
        runInAction(() => {
          relationships.relationships = relationships.relationships.filter((r) => r.id !== id);
        });
      }
      break;
    }

    // --- Voice ---
    case "VOICE_STATE_UPDATE": {
      const vs = data as VoiceState;
      if (vs?.user_id) {
        runInAction(() => voice.applyVoiceStateUpdate(vs));
        // If it's us and we joined a channel, remember the active voice channel
        // for the guild so the sidebar can highlight it.
        if (vs.user_id === session.meId && vs.guild_id) {
          runInAction(() =>
            guilds.voiceChannelByGuild.set(vs.guild_id!, vs.channel_id ?? null),
          );
        }
      }
      break;
    }
    case "VOICE_SERVER_UPDATE": {
      const vs = data as VoiceServerUpdate;
      // DM/group voice uses guild_id: null — gate only on endpoint + token so
      // DM VOICE_SERVER_UPDATEs are applied (the server sends guild_id null for
      // DM calls per the Fluxer protocol).
      if (vs?.endpoint && vs?.token) {
        runInAction(() => voice.applyVoiceServerUpdate(vs));
      }
      break;
    }

    // --- Threads ---
    case "THREAD_CREATE": {
      const t = data as ThreadChannel;
      if (t?.id && t?.guild_id) {
        runInAction(() => {
          guilds.threadsById.set(t.id, t);
          const chs = guilds.channelsByGuild.get(t.guild_id!);
          if (chs && !chs.some((c) => c.id === t.id)) {
            guilds.channelsByGuild.set(t.guild_id!, [...chs, t]);
          }
        });
      }
      break;
    }
    case "THREAD_UPDATE": {
      const t = data as ThreadChannel;
      if (t?.id) {
        runInAction(() => {
          const existing = guilds.threadsById.get(t.id);
          guilds.threadsById.set(t.id, existing ? { ...existing, ...t } : t);
          // Also patch the entry inside the guild's channel list if present.
          if (t.guild_id) {
            const chs = guilds.channelsByGuild.get(t.guild_id);
            if (chs) {
              const idx = chs.findIndex((c) => c.id === t.id);
              if (idx >= 0) {
                const updated = [...chs];
                updated[idx] = { ...updated[idx], ...t };
                guilds.channelsByGuild.set(t.guild_id, updated);
              }
            }
          }
        });
      }
      break;
    }
    case "THREAD_DELETE": {
      const id = data?.id;
      const gid = data?.guild_id;
      if (id) {
        runInAction(() => {
          guilds.threadsById.delete(id);
          if (gid) {
            const chs = guilds.channelsByGuild.get(gid);
            if (chs) {
              guilds.channelsByGuild.set(gid, chs.filter((c) => c.id !== id));
            }
          }
          if (ui.selectedChannelId === id) ui.selectedChannelId = null;
        });
      }
      break;
    }
    case "THREAD_LIST_SYNC": {
      // Batch thread + member sync for a guild. We just merge the threads.
      const gid = data?.guild_id;
      const threads: ThreadChannel[] = data?.threads ?? [];
      if (gid) {
        runInAction(() => {
          for (const t of threads) {
            guilds.threadsById.set(t.id, t);
          }
          const chs = guilds.channelsByGuild.get(gid) ?? [];
          const seen = new Set(chs.map((c) => c.id));
          const merged = [...chs];
          for (const t of threads) {
            if (!seen.has(t.id)) merged.push(t);
          }
          guilds.channelsByGuild.set(gid, merged);
        });
      }
      break;
    }
    case "THREAD_MEMBER_UPDATE":
    case "THREAD_MEMBERS_UPDATE": {
      // D.17: track thread membership so the UI can show "joined" state and
      // the thread list stays in sync. The payload includes `id` (thread id)
      // + `guild_id` + optionally `member_count`. We bump the cached thread's
      // member_count when present.
      const tid = data?.id;
      if (tid) {
        runInAction(() => {
          const t = guilds.threadsById.get(tid);
          if (t) {
            guilds.threadsById.set(tid, {
              ...t,
              member_count: data?.member_count ?? t.member_count,
            });
          }
        });
      }
      break;
    }

    // --- Guild bans ---
    case "GUILD_BAN_ADD": {
      const gid = data?.guild_id;
      const user = data?.user;
      if (gid && user) {
        runInAction(() => {
          const bans = guilds.bansByGuild.get(gid) ?? [];
          if (!bans.some((b) => b.user.id === user.id)) {
            guilds.bansByGuild.set(gid, [...bans, { user, reason: data?.reason ?? null }]);
          }
          // Remove the banned user from the member list.
          const members = guilds.membersByGuild.get(gid);
          if (members) {
            guilds.membersByGuild.set(gid, members.filter((m) => m.user.id !== user.id));
          }
        });
      }
      break;
    }
    case "GUILD_BAN_REMOVE": {
      const gid = data?.guild_id;
      const user = data?.user;
      if (gid && user) {
        runInAction(() => {
          const bans = guilds.bansByGuild.get(gid) ?? [];
          guilds.bansByGuild.set(gid, bans.filter((b) => b.user.id !== user.id));
        });
      }
      break;
    }

    // --- Guild stickers ---
    case "GUILD_STICKERS_UPDATE": {
      const gid = data?.guild_id;
      const stickers: Sticker[] = data?.stickers ?? [];
      if (gid) {
        runInAction(() => guilds.stickersByGuild.set(gid, stickers));
      }
      break;
    }

    // --- Guild member chunks (lazy member list) ---
    case "GUILD_MEMBERS_CHUNK": {
      const chunk = data as GuildMembersChunk;
      if (chunk?.guild_id && Array.isArray(chunk.members)) {
        runInAction(() => {
          const existing = guilds.membersByGuild.get(chunk.guild_id) ?? [];
          const byId = new Map(existing.map((m) => [m.user.id, m]));
          for (const m of chunk.members) {
            byId.set(m.user.id, m);
          }
          guilds.membersByGuild.set(chunk.guild_id, [...byId.values()]);
        });
        // Apply any presences shipped alongside the chunk.
        if (Array.isArray(chunk.presences)) {
          presence.handlePresenceBulk(chunk.presences);
        }
      }
      break;
    }

    // --- Webhooks ---
    case "WEBHOOKS_UPDATE": {
      // We don't render webhooks yet; noted so it doesn't fall through.
      break;
    }

    // --- User settings ---
    case "USER_SETTINGS_UPDATE": {
      if (data && typeof data === "object") {
        settings.applyUpdate(data as Partial<UserSettings>);
      }
      break;
    }
    case "USER_GUILD_SETTINGS_UPDATE": {
      // Per-guild notification/override settings. Noted for future use; we
      // don't currently render guild-level notification overrides.
      break;
    }

    default:
      break;
  }
}

// Resolve a user id to a display name across all loaded stores. Used for typing
// indicators and mention rendering.
export function resolveUserName(id: Snowflake): string | undefined {
  // Current user.
  if (session.me?.id === id) return session.me.global_name ?? session.me.username;
  // Guild members of current guild.
  if (ui.currentGuild) {
    const members = guilds.membersByGuild.get(ui.currentGuild.id);
    if (members) {
      const m = members.find((m) => m.user.id === id);
      if (m) return m.nick ?? m.user.global_name ?? m.user.username;
    }
  }
  // DM recipients.
  for (const c of dms.channels) {
    const u = c.recipients.find((u) => u.id === id);
    if (u) return u.global_name ?? u.username;
  }
  // Known users (profile popups).
  return ui.knownUsers.get(id)?.global_name ?? ui.knownUsers.get(id)?.username;
}

/// Resolve a user id to a `User` object across all loaded stores (current user,
/// guild members, DM recipients, known users, relationships). Used by voice UI
/// to render avatars. Returns a minimal stub `{ id }` when the user isn't
/// loaded anywhere so `<Avatar>` can still render a fallback.
export function resolveUser(id: Snowflake): User {
  if (session.me?.id === id) return session.me;
  if (ui.currentGuild) {
    const members = guilds.membersByGuild.get(ui.currentGuild.id);
    const m = members?.find((m) => m.user.id === id);
    if (m) return m.user;
  }
  for (const c of dms.channels) {
    const u = c.recipients.find((u) => u.id === id);
    if (u) return u;
  }
  const known = ui.knownUsers.get(id);
  if (known) return known;
  const rel = relationships.relationships.find((r) => r.user.id === id);
  if (rel) return rel.user;
  return { id, username: "", discriminator: "0" };
}

/// Build the standard user context-menu items (Profile, Message, friend
/// relationship actions, Copy ID) shared by the DM list, member list, and
/// message author menu. The caller may prepend channel-specific items
/// (e.g. Mark as Read / Close DM) before calling this. Mirrors the official
/// Fluxer/Discord user context menu.
export function buildUserContextMenu(
  user: User,
  x: number,
  y: number,
): ContextMenuItem[] {
  const uid = user.id;
  const items: ContextMenuItem[] = [
    { kind: "action", label: "Profile", onClick: () => ui.openProfile(uid, { x, y }) },
  ];
  if (uid !== session.meId) {
    items.push({ kind: "action", label: "Message", onClick: () => openDmWithUser(uid).then((ch) => ui.openChannel(ch.id)) });
  }
  // Relationship actions (skip for bots + self).
  const rel = relationships.getRelationship(uid);
  if (!user.bot && uid !== session.meId) {
    items.push({ kind: "separator" });
    if (!rel) {
      items.push({ kind: "action", label: "Add Friend", onClick: () => relationships.sendFriendRequest(uid).catch(() => {}) });
    } else if (rel.type === 1) {
      items.push({ kind: "action", label: "Remove Friend", danger: true, onClick: () => relationships.remove(uid).catch(() => {}) });
    } else if (rel.type === 3) {
      // Incoming friend request.
      items.push({ kind: "action", label: "Accept Friend Request", onClick: () => relationships.sendFriendRequest(uid).catch(() => {}) });
      items.push({ kind: "action", label: "Ignore Friend Request", danger: true, onClick: () => relationships.remove(uid).catch(() => {}) });
    } else if (rel.type === 4) {
      // Outgoing friend request.
      items.push({ kind: "action", label: "Cancel Friend Request", danger: true, onClick: () => relationships.remove(uid).catch(() => {}) });
    } else if (rel.type === 2) {
      items.push({ kind: "action", label: "Unblock User", onClick: () => relationships.remove(uid).catch(() => {}) });
    } else {
      items.push({ kind: "action", label: "Block User", danger: true, onClick: () => relationships.remove(uid).catch(() => {}) });
    }
  }
  if (!user.bot && uid !== session.meId) {
    items.push({ kind: "separator" });
    items.push({ kind: "action", label: "Report User", danger: true, onClick: () => ui.openReport({ kind: "user", userId: uid }) });
  }
  items.push({ kind: "separator" });
  items.push({ kind: "action", label: "Copy User ID", onClick: () => navigator.clipboard?.writeText(uid).catch(() => {}) });
  return items;
}

/// Build the right-click menu for a voice-channel participant. Includes the
/// always-available local controls (profile / message / local mute / per-user
/// volume / relationship / copy id) plus moderation actions gated on the
/// current user's permissions + role hierarchy.
export function buildVoiceParticipantContextMenu(
  userId: Snowflake,
  guildId: Snowflake,
  channelId: Snowflake,
  x: number,
  y: number,
): ContextMenuItem[] {
  const isSelf = userId === session.meId;
  const user = resolveUser(userId);
  const items: ContextMenuItem[] = [
    { kind: "action", label: "Profile", onClick: () => ui.openProfile(userId, { x, y }, guildId) },
  ];

  if (isSelf) {
    // Self: quick voice self-controls.
    items.push({ kind: "separator" });
    items.push({ kind: "checkbox", label: "Mute", checked: !voice.room?.micEnabled, onToggle: () => voice.toggleMic().catch(() => {}) });
    items.push({ kind: "checkbox", label: "Deafen", checked: voice.serverDeafened, onToggle: () => voice.toggleDeafen().catch(() => {}) });
    items.push({ kind: "separator" });
    items.push({ kind: "action", label: "Disconnect", danger: true, onClick: () => voice.leaveChannel().catch(() => {}) });
    items.push({ kind: "separator" });
    items.push({ kind: "action", label: "Copy User ID", onClick: () => navigator.clipboard?.writeText(userId).catch(() => {}) });
    return items;
  }

  // Other user: message + local audio controls.
  items.push({ kind: "action", label: "Message", onClick: () => openDmWithUser(userId).then((ch) => ui.openChannel(ch.id)) });
  items.push({ kind: "separator" });
  items.push({
    kind: "checkbox",
    label: "Mute",
    checked: voice.isLocalMuted(userId),
    onToggle: (c) => voice.setLocalMute(userId, c),
  });
  items.push({
    kind: "slider",
    label: "User Volume",
    value: voice.getVolume(userId),
    min: 0,
    max: 200,
    defaultValue: 100,
    format: (v) => `${Math.round(v)}%`,
    onChange: (v) => voice.setVolume(userId, v),
  });

  // Relationship actions (skip bots).
  const rel = relationships.getRelationship(userId);
  if (!user.bot) {
    items.push({ kind: "separator" });
    if (!rel) items.push({ kind: "action", label: "Add Friend", onClick: () => relationships.sendFriendRequest(userId).catch(() => {}) });
    else if (rel.type === 1) items.push({ kind: "action", label: "Remove Friend", danger: true, onClick: () => relationships.remove(userId).catch(() => {}) });
    else if (rel.type === 2) items.push({ kind: "action", label: "Unblock User", onClick: () => relationships.remove(userId).catch(() => {}) });
    else items.push({ kind: "action", label: "Block User", danger: true, onClick: () => relationships.remove(userId).catch(() => {}) });
  }

  // Moderation actions — only when permitted + outranking the target.
  const MUTE = 1n << 22n, MOVE = 1n << 24n, KICK = 1n << 1n, BAN = 1n << 2n;
  const member = guilds.getMember(guildId, userId);
  const canManage = guilds.canManageTarget(guildId, userId);
  const modItems: ContextMenuItem[] = [];
  if (canManage && guilds.canModerateGuild(guildId, MUTE)) {
    modItems.push({
      kind: "checkbox",
      label: "Server Mute",
      danger: true,
      checked: !!member?.mute,
      onToggle: (c) => api.updateGuildMember(guildId, userId, { mute: c }).catch((e) => toasts.error("Failed to server-mute", String(e))),
    });
    modItems.push({
      kind: "checkbox",
      label: "Server Deafen",
      danger: true,
      checked: !!member?.deaf,
      onToggle: (c) => api.updateGuildMember(guildId, userId, { deaf: c }).catch((e) => toasts.error("Failed to server-deafen", String(e))),
    });
  }
  if (canManage && guilds.canModerateGuild(guildId, MOVE)) {
    modItems.push({ kind: "action", label: "Disconnect", danger: true, onClick: () => api.updateGuildMember(guildId, userId, { channel_id: null }).catch((e) => toasts.error("Failed to disconnect", String(e))) });
    // Move to another voice channel in this guild.
    const voiceChannels = (guilds.channelsByGuild.get(guildId) ?? []).filter(
      (c) => c.type === channelType.GUILD_VOICE && c.id !== channelId,
    );
    for (const vc of voiceChannels) {
      modItems.push({ kind: "action", label: `Move to: ${vc.name}`, onClick: () => api.updateGuildMember(guildId, userId, { channel_id: vc.id }).catch((e) => toasts.error("Failed to move", String(e))) });
    }
  }
  if (canManage && guilds.canModerateGuild(guildId, KICK)) {
    modItems.push({ kind: "action", label: "Kick", danger: true, onClick: () => api.kickMember(guildId, userId).catch((e) => toasts.error("Failed to kick", String(e))) });
  }
  if (canManage && guilds.canModerateGuild(guildId, BAN)) {
    modItems.push({ kind: "action", label: "Ban", danger: true, onClick: () => api.banUser(guildId, userId, undefined, 0).catch((e) => toasts.error("Failed to ban", String(e))) });
  }
  if (modItems.length > 0) {
    items.push({ kind: "separator" }, ...modItems);
  }

  items.push({ kind: "separator" });
  items.push({ kind: "action", label: "Report User", danger: true, onClick: () => ui.openReport({ kind: "user", userId }) });
  items.push({ kind: "action", label: "Copy User ID", onClick: () => navigator.clipboard?.writeText(userId).catch(() => {}) });
  return items;
}

export function resolveChannelName(id: Snowflake): string | undefined {
  for (const chs of guilds.channelsByGuild.values()) {
    const c = chs.find((c) => c.id === id);
    if (c?.name) return `#${c.name}`;
  }
  const dm = dms.getDm(id);
  if (dm) return dmLabel(dm);
  return undefined;
}

/// Build a display label for a DM channel (group name or recipient names).
export function dmLabel(c: Channel): string {
  if (c.name) return c.name;
  return c.recipients
    .map((u) => u.global_name ?? u.username)
    .join(", ");
}

/// Open a DM channel with a user, reusing an existing one if present instead of
/// always creating a new one (which the server turns into a group DM on duplicate).
export async function openDmWithUser(userId: Snowflake): Promise<Channel> {
  const existing = dms.findDmWithUser(userId);
  if (existing) return existing;
  const ch = await api.openDm(userId);
  runInAction(() => dms.add(ch));
  return ch;
}

/// Fire a desktop notification for a mention (D.22). Uses the Tauri
/// notification plugin when available; falls back to the Web Notifications
/// API when the plugin isn't loaded (e.g. in a plain browser). Best-effort:
/// permission denials and failures are swallowed.
async function fireDesktopNotification(msg: Message): Promise<void> {
  const authorName = resolveUserName(msg.author.id) ?? msg.author.global_name ?? msg.author.username;
  const channelName = resolveChannelName(msg.channel_id) ?? "Unknown channel";
  const body = msg.content || "(attachment)";
  // Try the Tauri plugin first (works in the desktop app).
  try {
    const mod = await import("@tauri-apps/plugin-notification");
    const { isPermissionGranted, requestPermission, sendNotification } = mod;
    if (!(await isPermissionGranted())) {
      const perm = await requestPermission();
      if (perm !== "granted") return;
    }
    sendNotification({
      title: `${authorName} in ${channelName}`,
      body: body.length > 200 ? body.slice(0, 200) + "…" : body,
    });
    return;
  } catch {
    // Plugin not available — fall through to the Web Notifications API.
  }
  // Web Notifications fallback (browser/dev mode).
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(`${authorName} in ${channelName}`, {
        body: body.length > 200 ? body.slice(0, 200) + "…" : body,
      });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((p) => {
        if (p === "granted") {
          new Notification(`${authorName} in ${channelName}`, {
            body: body.length > 200 ? body.slice(0, 200) + "…" : body,
          });
        }
      });
    }
  }
}

/// Merge overlapping/adjacent [start, end] ranges into a minimal set. Used by
/// the lazy member list so we don't re-subscribe to ranges we already cover.
/// Ranges are inclusive on both ends.
function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [sorted[0]];
  for (const [start, end] of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}