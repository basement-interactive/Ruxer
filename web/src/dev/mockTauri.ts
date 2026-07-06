// Dev-only fake Tauri backend — lets the frontend run standalone in a plain
// browser (`npm run dev` on :5173) with NO Rust/Tauri backend, so UI work
// iterates instantly.
//
// How it works: Tauri's `@tauri-apps/api` (invoke, listen, …) is a thin shim
// over `window.__TAURI_INTERNALS__`. Real Tauri injects that object before our
// JS runs. When it's ABSENT (browser dev), we install a fake one here. The real
// `invoke`/`listen` then route through our fake — so `api.ts` and `stores.ts`
// need ZERO changes and behave exactly as in production, just against mock data.
//
// Guards:
//   - `import.meta.env.DEV` → never present in a production build (dead-code
//     eliminated by Vite), so this file ships nothing to users.
//   - `!("__TAURI_INTERNALS__" in window)` → inert under `cargo tauri dev`
//     (real backend wins).
//
// The mock world is intentionally tiny — one guild, a few channels, a couple
// DMs/friends, some messages — enough to render a populated, clickable UI.
// Mutations resolve optimistically. Unknown commands warn once and return null,
// so nothing throws.

// The internals contract, verified against @tauri-apps/api@2 dist
// (core.js: invoke/transformCallback/unregisterCallback/convertFileSrc;
//  event.js: plugin:event|listen / |unlisten / |emit).

interface TauriInternals {
  invoke(cmd: string, args?: Record<string, unknown>, options?: unknown): Promise<unknown>;
  transformCallback(cb: (payload: unknown) => void, once?: boolean): number;
  unregisterCallback(id: number): void;
  convertFileSrc(filePath: string, protocol?: string): string;
  // Read by getCurrentWindow()/getCurrentWebview(). Because installing this
  // object makes `"__TAURI_INTERNALS__" in window` true, code paths guarded by
  // that check (e.g. TitleBar) WILL call getCurrentWindow() — so metadata must
  // exist or they throw "Cannot read properties of undefined (reading ...)".
  metadata: {
    currentWindow: { label: string };
    currentWebview: { windowLabel: string; label: string };
  };
}

function shouldInstall(): boolean {
  return (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    !("__TAURI_INTERNALS__" in window)
  );
}

if (shouldInstall()) {
  installMockTauri();
}

function installMockTauri(): void {
  // --- Event system plumbing -------------------------------------------------
  const callbacks = new Map<number, (payload: unknown) => void>();
  const listenersByEvent = new Map<string, Set<number>>();
  let nextCallbackId = 1;

  // Deliver an event to every listener registered for it, using the envelope
  // shape the real Tauri event layer produces: { event, id, payload }.
  function emit(event: string, payload: unknown): void {
    const ids = listenersByEvent.get(event);
    if (!ids) return;
    for (const id of ids) {
      let eventId = 0;
      callbacks.get(id)?.({ event, id: eventId++, payload });
    }
  }

  // --- Mock data -------------------------------------------------------------
  const T0 = "2026-07-06T12:00:00.000Z";
  const endpoints = { api: "", api_public: "", gateway: "", media: "", admin: "", static_cdn: "", features: [] };

  const me = {
    id: "1",
    username: "you",
    discriminator: "0001",
    global_name: "You (dev)",
    avatar: null,
    email: "you@dev.local",
    verified: true,
    mfa_enabled: false,
    bio: "Local dev session — no backend.",
    flags: 0,
  };

  const userAda = { id: "2", username: "ada", discriminator: "0002", global_name: "Ada", avatar: null };
  const userLin = { id: "3", username: "linus", discriminator: "0003", global_name: "Linus", avatar: null };

  const GUILD_ID = "100";
  const channels = [
    { id: "200", type: 4, name: "TEXT CHANNELS", guild_id: GUILD_ID, position: 0, recipients: [], permission_overwrites: [] },
    { id: "201", type: 0, name: "general", guild_id: GUILD_ID, parent_id: "200", position: 1, topic: "Dev harness channel", recipients: [], permission_overwrites: [] },
    { id: "202", type: 0, name: "random", guild_id: GUILD_ID, parent_id: "200", position: 2, recipients: [], permission_overwrites: [] },
    { id: "210", type: 4, name: "VOICE", guild_id: GUILD_ID, position: 3, recipients: [], permission_overwrites: [] },
    { id: "211", type: 2, name: "General Voice", guild_id: GUILD_ID, parent_id: "210", position: 4, recipients: [], permission_overwrites: [] },
  ];

  const guild = {
    id: GUILD_ID,
    name: "Ruxer Dev",
    icon: null,
    owner_id: me.id,
    features: [],
    member_count: 3,
    online_count: 2,
    roles: [],
    emojis: [],
    channels,
  };

  const dms = [
    { id: "300", type: 1, name: null, last_message_id: "402", recipients: [userAda], permission_overwrites: [] },
    { id: "301", type: 1, name: null, recipients: [userLin], permission_overwrites: [] },
  ];

  const relationships = [
    { id: userAda.id, type: 1, user: userAda },
    { id: userLin.id, type: 1, user: userLin },
  ];

  const msg = (id: string, channelId: string, author: typeof me | typeof userAda, content: string, ts: string) => ({
    id,
    channel_id: channelId,
    author,
    type: 0,
    content,
    timestamp: ts,
    mentions: [],
    mention_roles: [],
    reactions: [],
    attachments: [],
    embeds: [],
  });

  const messagesByChannel: Record<string, unknown[]> = {
    "201": [
      msg("400", "201", userAda, "welcome to the **dev harness** — no backend running", "2026-07-06T11:58:00.000Z"),
      msg("401", "201", me, "nice, the UI renders with fake data :rocket:", "2026-07-06T11:59:00.000Z"),
    ],
    "202": [msg("410", "202", userLin, "random channel", T0)],
    "300": [msg("402", "300", userAda, "hey! this is a mock DM", T0)],
    "301": [],
  };

  const loginResult = { me, guilds: [guild], dms, relationships, endpoints };

  // --- Command dispatch ------------------------------------------------------
  const warned = new Set<string>();

  function handleCommand(cmd: string, args: Record<string, unknown>): unknown {
    switch (cmd) {
      case "has_stored_session":
        return true;
      case "restore_session":
        return { token: "mock-token", kind: "session", instance: "", endpoints };
      case "login":
      case "login_credentials":
        // After login, the gateway_status listener is attached — flip to
        // "connected" shortly so the connection nagbar doesn't stick.
        setTimeout(() => emit("gateway_status", { status: "connected" }), 300);
        return loginResult;
      case "logout":
        return null;
      case "current_user":
        return me;
      case "resolve_endpoints":
        return endpoints;
      case "list_guilds":
        return [guild];
      case "list_channels":
        return args.guildId === GUILD_ID ? channels : [];
      case "list_dms":
        return dms;
      case "list_relationships":
        return relationships;
      case "list_read_state":
        return [];
      case "list_messages":
        return messagesByChannel[String(args.channelId)] ?? [];
      case "list_members":
        return String(args.guildId) === GUILD_ID
          ? [
              { user: me, roles: [], joined_at: T0 },
              { user: userAda, roles: [], joined_at: T0 },
              { user: userLin, roles: [], joined_at: T0 },
            ]
          : [];
      case "list_pins":
      case "request_members":
      case "list_saved_messages":
      case "list_scheduled_messages":
      case "list_active_threads":
      case "list_guild_roles":
      case "list_guild_emojis":
      case "list_guild_stickers":
      case "list_guild_bans":
      case "list_channel_webhooks":
        return String(args.channelId) === "201" ? [{ id: "500", name: "Announcements Bot", channel_id: "201", guild_id: GUILD_ID, type: 1 }] : [];
      case "list_channel_invites":
      case "discovery_categories":
      case "discovery_guilds":
        return [];
      case "gif_trending":
      case "gif_search":
        return [];
      case "send_message": {
        // Echo the sent text back as a confirmed message so it reconciles the
        // optimistic placeholder (matched by nonce).
        return {
          ...msg(
            "sent-" + (args.nonce ?? nextCallbackId++),
            String(args.channelId ?? args.channel_id ?? "201"),
            me,
            String(args.content ?? ""),
            T0,
          ),
          nonce: args.nonce ?? null,
        };
      }
      case "image_proxy":
      case "image_proxy_asset":
        return "";
      case "guild_audit_log":
        return { audit_log_entries: [ { id: "600", user_id: "1", action_type: 22, reason: "spam" }, { id: "601", user_id: "1", action_type: 10 }, { id: "602", user_id: "1", action_type: 20 } ], users: [me] };
      case "list_auth_sessions":
        return [ { id_hash: "h1", client_info: { os: "Linux", browser: "Ruxer Desktop" }, masked_ip: "192.168.•.•", approx_last_used_at: T0, current: true }, { id_hash: "h2", client_info: { os: "Android", device: "Pixel" }, masked_ip: "10.0.•.•", approx_last_used_at: T0, current: false } ];
      case "get_guild_vanity":
        return { code: "ruxer-dev", uses: 12 };
      case "premium_state":
        return null;
      default:
        // Mutations / subscriptions / anything else: succeed silently.
        if (
          cmd.startsWith("subscribe_") ||
          cmd.startsWith("ack_") ||
          cmd.startsWith("update_") ||
          cmd.startsWith("mark_") ||
          cmd.startsWith("trigger_") ||
          cmd.startsWith("add_") ||
          cmd.startsWith("remove_") ||
          cmd.startsWith("delete_") ||
          cmd.startsWith("create_") ||
          cmd.startsWith("edit_") ||
          cmd.startsWith("save_") ||
          cmd.startsWith("unsave_") ||
          cmd.startsWith("pin_") ||
          cmd.startsWith("unpin_")
        ) {
          return null;
        }
        if (!warned.has(cmd)) {
          warned.add(cmd);
          // eslint-disable-next-line no-console
          console.warn(`[mockTauri] unhandled command "${cmd}" → null`, args);
        }
        return null;
    }
  }

  // --- Internals object ------------------------------------------------------
  const internals: TauriInternals = {
    async invoke(cmd, args = {}, _options) {
      // Tauri event plugin protocol (used by listen/emit under the hood).
      if (cmd === "plugin:event|listen") {
        const event = String((args as any).event);
        const handlerId = Number((args as any).handler);
        let set = listenersByEvent.get(event);
        if (!set) listenersByEvent.set(event, (set = new Set()));
        set.add(handlerId);
        return handlerId; // used as the eventId for unlisten
      }
      if (cmd === "plugin:event|unlisten") {
        const event = String((args as any).event);
        const eventId = Number((args as any).eventId);
        listenersByEvent.get(event)?.delete(eventId);
        callbacks.delete(eventId);
        return null;
      }
      if (cmd === "plugin:event|emit" || cmd === "plugin:event|emit_to") {
        return null;
      }
      // Window / opener / notification / autostart / deep-link plugins: no-op.
      if (cmd.startsWith("plugin:")) {
        return null;
      }
      return handleCommand(cmd, args as Record<string, unknown>);
    },
    transformCallback(cb, once) {
      const id = nextCallbackId++;
      callbacks.set(id, (payload) => {
        cb(payload);
        if (once) callbacks.delete(id);
      });
      return id;
    },
    unregisterCallback(id) {
      callbacks.delete(id);
    },
    convertFileSrc(filePath) {
      return filePath;
    },
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
  };

  const w = window as unknown as {
    __TAURI_INTERNALS__: TauriInternals;
    __MOCK_TAURI__: boolean;
  };
  w.__TAURI_INTERNALS__ = internals;
  // Marker so dev tooling (devScenes) can tell the mock from a real backend.
  w.__MOCK_TAURI__ = true;

  // eslint-disable-next-line no-console
  console.info(
    "%c[mockTauri] fake backend installed — browser dev mode, no Rust backend. Mutations are no-ops.",
    "color:#888",
  );
}
