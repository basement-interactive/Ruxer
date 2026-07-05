# CLAUDE.md — Fluxer Desktop (Tauri)

Agent guidance for working on this codebase. Read this before making changes.

## Project Overview

A Tauri 2 desktop client for the Fluxer chat API. The Rust backend (`core/` +
`src-tauri/`) is written in this repo; **the shipped frontend is the real
Fluxer web client** (`reference/fluxer/fluxer_app`), built with rspack and
bridged to Tauri via a `window.electron` shim. This gives exact 1:1 feature +
visual parity by construction.

## ⚠️ Which frontend actually ships (read this first)

`src-tauri/tauri.conf.json` sets `frontendDist: "../web/dist"`, and
**`web/dist` is a mirror of the BUILT reference client**
(`reference/fluxer/fluxer_app/dist`) — it is NOT a build of `web/src`.

- `web/src/**` (React + MobX reimplementation: stores.ts, LiveKitRoom.ts,
  layout/, views/, components/) is a **parallel reimplementation that is not
  shipped**. Editing it does nothing to the running app. It is kept as
  reference/history only.
- `reference/fluxer/` is **NOT read-only**: its `fluxer_app/src` is exactly
  what you edit to change the shipped app's UI/behavior. The Tauri desktop
  bridge shim lives at `reference/fluxer/fluxer_app/src/desktop-tauri-shim.ts`
  (implements the `window.electron` API the client expects from Electron,
  mapped onto Tauri commands).

**To change the shipped frontend:**

```bash
cd reference/fluxer/fluxer_app
node_modules/.bin/rspack build --mode production   # ~29s
node scripts/tauri-postbuild.mjs                    # ALWAYS run after rspack:
                                                    # fills {{STATIC_CDN_ENDPOINT}} (fonts),
                                                    # injects __FLUXER_BOOTSTRAP__, strips CSP
                                                    # nonce placeholders, neutralizes the SW
# then mirror (rspack rehashes filenames — copy, don't merge):
rm -rf ../../../web/dist && cp -r dist ../../../web/dist
```

Skipping `tauri-postbuild.mjs` breaks fonts and bootstrap — it has happened
before; don't repeat it.

## Architecture

```
fluxer-rust/
├── core/              — Rust API client (REST + WebSocket gateway)
│   ├── src/
│   │   ├── api/       — Resource APIs: users, guilds, channels, messages,
│   │   │                reactions, search, invites, gifs, discovery, reports
│   │   ├── gateway.rs — WebSocket gateway (identify, heartbeat, reconnect)
│   │   ├── http.rs    — Rate-limited HTTP transport (429 auto-retry)
│   │   ├── models.rs  — Data models (User, Guild, Channel, Message, etc.)
│   │   ├── auth.rs    — Email/password + MFA login flow
│   │   └── discovery.rs — /.well-known/fluxer endpoint resolution
│   ├── openapi.json   — Fluxer OpenAPI 3.1.0 spec (types source-of-truth)
│   └── build.rs       — Generates Rust types from the OpenAPI spec (typify)
├── src-tauri/         — Tauri backend
│   ├── src/
│   │   ├── lib.rs     — App entry point + all Tauri commands (~120)
│   │   ├── desktop_bridge.rs — Commands backing the window.electron shim
│   │   ├── screen_sources.rs — Screen-share source enumeration + thumbnails
│   │   │                (Windows.Graphics.Capture, GDI fallback)
│   │   ├── gateway.rs — Gateway task (connect → forward events to frontend)
│   │   ├── image.rs   — Media proxy (on-disk cache + asset:// URLs)
│   │   ├── media_cache.rs — Filesystem media cache (MD5-keyed, pruned)
│   │   ├── proxy.rs   — Local HTTP/WS proxy for the reference client
│   │   ├── log_forward.rs — tracing → frontend devtools console mirror
│   │   └── secure_storage.rs — OS keychain session persistence
│   └── capabilities/  — Tauri permissions (notification, deep-link, etc.)
├── reference/fluxer/  — Clone of fluxerapp/fluxer. fluxer_app is the SHIPPED
│   │                    frontend source — EDITABLE (see above).
│   └── fluxer_app/
│       ├── src/desktop-tauri-shim.ts — window.electron bridge (Tauri side)
│       └── scripts/tauri-postbuild.mjs — dist → Tauri-loadable bundle
├── web/
│   ├── dist/          — SHIPPED frontend = mirror of reference build output
│   └── src/           — UNSHIPPED legacy React+MobX reimplementation
├── docs/              — Design system extraction + parity audit + open questions
├── AGENTS.md          — Dev setup instructions
└── PLAN.md            — Living task tracker (Slices A–G + changelog)
```

## Key Design Decisions

- **Frontend = reference build:** parity gaps are closed by shipping the real
  client, not reimplementing it. Anything the client expects from Electron
  (`window.electron`) is shimmed in `desktop-tauri-shim.ts` and backed by
  Tauri commands in `src-tauri/src/desktop_bridge.rs`. Missing shim calls
  degrade gracefully (the shim swallows missing-command errors).
- **Screen share:** the shim reports `nativeScreenCapture.getAvailability →
  available:false`, routing the client to the JS `getDisplayMedia` path
  (LiveKit). WebView2 cannot honor an arbitrary pre-picked source id, so after
  the in-app picker the WebView2 "Choose what to share" dialog appears — a
  known double-pick trade-off. Eliminating it requires implementing the full
  `window.electron.voiceEngine` v2 native bridge (large; not planned).
  Picker thumbnails are captured natively via Windows.Graphics.Capture
  (`screen_sources.rs`) — GDI reads GPU-composited surfaces back as black, so
  it's only the fallback. `--disable-direct-composition-video-overlays` in
  `lib.rs` keeps in-webview video readable.
- **Media cache:** On-disk temp cache (`<OS cache dir>/fluxer-media-cache/`)
  keyed by MD5(url). Files served via `asset://` protocol (Tauri) → no base64
  overhead, native browser caching.
- **Gateway:** WebSocket with exponential backoff reconnect. Supports IDENTIFY,
  RESUME, heartbeat, op-14 LAZY_REQUEST subscriptions.
- **Voice:** LiveKit via the reference client's own voice stack (JS path).
  Mic/camera permission auto-granted via WebView2 flags.

## Dev Commands

```bash
# Frontend (shipped): edit reference/fluxer/fluxer_app/src, then
cd reference/fluxer/fluxer_app
node_modules/.bin/rspack build --mode production && node scripts/tauri-postbuild.mjs
rm -rf ../../../web/dist && cp -r dist ../../../web/dist

# Tauri dev (builds + opens window, loads web/dist)
cargo tauri dev

# Rust build
cargo build -p fluxer-desktop
cargo build -p fluxer-desktop --features secure-storage

# Rust tests
cargo test -p fluxer
cargo test -p fluxer-desktop
# interactive-desktop test (screen-share thumbnails, run manually):
cargo test -p fluxer-desktop -- --ignored thumbnails

# Production build
cargo tauri build
```

Toolchain for the reference app: node 22 + pnpm 10; `node_modules` already
installed in `reference/fluxer/fluxer_app`. A bare rspack build is enough —
codegen inputs are already present, full `pnpm build` usually unneeded.

## Feature Parity Status

The shipped frontend is the real client, so UI feature parity is 1:1 by
construction. Remaining desktop-integration deltas:

- ⚠️ Screen share double-pick (in-app picker + WebView2 dialog) — see above.
- ❌ Native voice engine v2 bridge (`window.electron.voiceEngine`) — not
  implemented; JS/LiveKit path used instead.
- ❌ Auto-update — needs a signing key + hosted endpoint.
- System tray menu (unread badge / quick mute / deafen) — `tray-icon` feature
  enabled but menu UI not built.

(The old per-feature gap list in git history applied to the unshipped
`web/src` reimplementation and is obsolete.)

## Important Notes

- `PLAN.md` tracks completed work (Slices A–G + changelog).
- `docs/` (parity audit, design-system extraction) documents the `web/src`
  reimplementation era — useful background, not current build instructions.
- Gateway requires `wss://gateway.fluxer.app/?v=1&encoding=json` (trailing slash
  + query params — Caddy 400s without the path).
- Token rotation: the `.env` token was blanked. User handles rotation on
  fluxer.app.
