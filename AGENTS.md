# Fluxer Desktop (Tauri)

A Tauri 2 desktop client for the Fluxer chat API. The Rust backend lives in
this repo; **the shipped frontend is the built reference Fluxer web client**
(`reference/fluxer/fluxer_app`), bridged to Tauri via a `window.electron`
shim. See `CLAUDE.md` for the full picture — especially the "Which frontend
actually ships" section.

## Layout

- `core/` — async Rust client for the Fluxer REST + gateway API
  - `src/api/` — resource APIs: users, guilds, channels, messages, reactions,
    search, invites, gifs, discovery, reports
  - `src/gateway.rs` — WebSocket gateway (identify, heartbeat, reconnect, op-14)
  - `src/http.rs` + `ratelimit.rs` — rate-limited HTTP transport
  - `src/models.rs` — data models (User, Guild, Channel, Message, Embed, etc.)
  - `src/auth.rs` — email/password + MFA login flow
  - `src/discovery.rs` — /.well-known/fluxer endpoint resolution
  - `openapi.json` — Fluxer OpenAPI 3.1.0 spec (source of truth for types)
- `src-tauri/` — Tauri backend
  - `src/lib.rs` — all Tauri commands (~120), app entry point
  - `src/desktop_bridge.rs` — commands backing the `window.electron` shim
  - `src/screen_sources.rs` — screen-share source list + thumbnails
    (Windows.Graphics.Capture; GDI fallback)
  - `src/gateway.rs` — gateway task (connect → forward events to frontend)
  - `src/image.rs` + `src/media_cache.rs` — media proxy + on-disk cache
  - `src/proxy.rs` — local HTTP/WS proxy for the reference client
  - `src/log_forward.rs` — tracing → frontend devtools console mirror
  - `src/secure_storage.rs` — OS keychain session persistence
- `reference/fluxer/` — clone of fluxerapp/fluxer. **`fluxer_app/src` is the
  shipped frontend source — edit it to change the app.** The Tauri bridge is
  `fluxer_app/src/desktop-tauri-shim.ts`.
- `web/dist/` — **shipped frontend** = mirror of the reference build output
  (`tauri.conf.json` `frontendDist`)
- `web/src/` — UNSHIPPED legacy React+MobX reimplementation (editing it does
  nothing to the running app)
- `docs/` — design-system extraction + parity audit (from the `web/src` era)

## Dev

Frontend change workflow (the only one that affects the running app):

```bash
cd reference/fluxer/fluxer_app
# edit src/**, then:
node_modules/.bin/rspack build --mode production   # ~29s
node scripts/tauri-postbuild.mjs                    # REQUIRED: fonts/bootstrap/CSP/SW fixes
rm -rf ../../../web/dist && cp -r dist ../../../web/dist   # mirror, don't merge
```

Backend + app:

```bash
cargo tauri dev     # builds + opens the Tauri window (loads web/dist)
cargo tauri build   # production bundle
```

Checks:

```bash
cargo build -p fluxer-desktop
cargo test -p fluxer
cargo test -p fluxer-desktop
cargo test -p fluxer-desktop -- --ignored thumbnails   # interactive-desktop only
```

## Notes

- Screen share: in-app picker → WebView2 shows its own "Choose what to share"
  dialog (double-pick; WebView2 can't honor a pre-picked source id). The shim
  reports native capture unavailable on purpose — the JS/LiveKit
  `getDisplayMedia` path is what works without an Electron voice-engine bridge.
- Picker thumbnails come from `screen_sources.rs` via Windows.Graphics.Capture
  (GDI `PrintWindow`/`StretchBlt` reads GPU-composited surfaces as black and is
  fallback only).
- Gateway requires `wss://gateway.fluxer.app/?v=1&encoding=json` (trailing
  slash + query params — Caddy 400s without the path).
- The `image_proxy_asset` command serves cached media via `asset://` protocol
  (on-disk MD5-keyed cache).
- See `CLAUDE.md` for design decisions + remaining desktop-integration deltas;
  `PLAN.md` for the task tracker (Slices A–G + changelog).
