---
name: fluxer-ui-migration
description: How the reference Fluxer UI was migrated 1:1 onto the Tauri backend (build, proxy, wiring)
metadata:
  type: project
---

Goal: complete 1:1 migration of reference Fluxer UI (`reference/fluxer/fluxer_app`, ~593k lines, 3461 files) onto the existing Tauri/Rust backend. Started 2026-07-01.

**Chosen architecture** (after confirming the reference UI is inseparable from its 183 MobX stores + WASM + lingui + rspack): adopt the reference app's *own* build toolchain to produce `dist/`, load that in the Tauri webview, and route its REST+gateway transport through a **local loopback reverse proxy** in the Tauri Rust backend (the webview at `tauri://localhost` is CORS-blocked from the Fluxer API, which only allows `Origin: https://web.fluxer.app`).

**Build pipeline** (reference repo): pnpm@10.29.3 (install via `npm i -g pnpm`, no corepack on node 26). `pnpm install --filter fluxer_app...`. Then in order: `pnpm wasm:codegen` (cargo→wasm libfluxcore, needs `wasm32-unknown-unknown` target; emits `fluxer_app/pkgs/libfluxcore/`), generate:colors/message-layout/theme-variables/masks/css-types, lingui:compile, `pnpm rspack build --mode production`, build-sw. Output → `fluxer_app/dist/` (~308M with sourcemaps).
- WASM is REQUIRED: gateway zstd decompression uses it.
- Custom scripts added: `fluxer_app/scripts/tauri-postbuild.mjs` (fills `{{STATIC_CDN_ENDPOINT}}`, strips `{{CSP_NONCE_PLACEHOLDER}}`, neutralizes sw.js; does NOT inject bootstrap) and `tauri-stage.mjs` (copies dist → `web/dist`, the Tauri frontendDist).

**Tauri wiring** (`src-tauri`):
- `tauri.conf.json`: window list emptied, build block reduced to `frontendDist: ../web/dist` only (removing devUrl makes even debug builds load static dist instead of a dead Vite server).
- Window built in Rust in `.setup()` via `WebviewWindowBuilder` with `initialization_script` that sets `window.__FLUXER_PROXY__={base,gateway}` and `window.__FLUXER_BOOTSTRAP__=<official endpoints>` (app HARD-REQUIRES bootstrap or throws). Bootstrap template embedded via `include_str!("../bootstrap-template.json")` (captured from `https://web.fluxer.app/.well-known/fluxer`).
- New `src-tauri/src/proxy.rs`: axum 0.7 server on `127.0.0.1:<ephemeral>`. Forwards all REST to `https://web.fluxer.app` with spoofed `Origin: https://web.fluxer.app` + adds `Access-Control-Allow-Origin: *`; bridges `/__gateway` WS → `wss://gateway.fluxer.app`. Deps added: axum(ws), tokio-tungstenite(rustls-tls-webpki-roots), futures-util, http, bytes.

**Reference patches** (transparent proxy — keeps official URLs in UI, redirects only bytes):
- `RestTransport.ts resolveUrl()`: added `redirectThroughDesktopProxy()` — off-origin requests rewritten to `__FLUXER_PROXY__.base` preserving path+query.
- `RestTransport.ts isOffOrigin()`: **CRITICAL** — must treat the loopback proxy origin as same-origin (`return false` when target === `__FLUXER_PROXY__.base` origin). Without this, the redirect makes `sameOrigin=false` in `composePlan`, so `assembleHeaders` DROPS the `Authorization` token + `X-Fluxer-Features` header → every authenticated REST call 401s. Symptom: DMs/guilds/friends load (they come from gateway READY) but MESSAGES, BIOS, and user profiles "fail to load" (those are REST fetches). Fixed 2026-07-01.
- `GatewaySocket.ts buildGatewayUrl()`: uses `__FLUXER_PROXY__.gateway` when present.
- `env.d.ts`: added `__FLUXER_PROXY__` to Window.

**Status**: Login screen renders 1:1 (`web.fluxer.app`, green discovery check, hCaptcha modal, email/password/passkey) in BOTH web-mode and native-desktop mode. Verified by screenshotting the running window (move it on-screen first; it can spawn off-screen). Full authed flow needs user creds + captcha (token rotation is user-handled).

**Electron shim (native parity) — DONE**: `fluxer_app/src/desktop-tauri-shim.ts` synthesizes `window.electron` from `window.__TAURI__` (enabled via `withGlobalTauri:true` in tauri.conf). Imported in `index.tsx`.
- CRITICAL TREE-SHAKING GOTCHA: `fluxer_app/package.json` has `"sideEffects": ["*.css","**/*.css"]`, so rspack treats ALL .ts/.tsx as side-effect-free. A bare `import '@app/desktop-tauri-shim'` gets ELIMINATED — the shim never runs, `window.electron` stays undefined, and everything gated on it silently falls back to web/browser behavior. FIX: `import {installDesktopTauriShim} from '...'; installDesktopTauriShim();` (explicit call keeps the module). Verify via CDP: launch with `--remote-debugging-port=9223`, connect to the `tauri.localhost` page's webSocketDebuggerUrl, `Runtime.evaluate` `!!window.electron`. Detect Tauri via `window.__FLUXER_PROXY__` (set by Rust init script, always present early), NOT `window.__TAURI__` at import time (injection order varies). Maps real features (openExternal, notifications, autostart, deep links, window minimize/maximize/close, clipboard, PTT hook) to Tauri; safe-stubs the rest (`tryInvoke` swallows missing commands). Backend: `src-tauri/src/desktop_bridge.rs` adds `desktop_info`, `desktop_initial_deep_link`, `desktop_global_hook_start/stop`; added `tauri-plugin-clipboard-manager` + window/clipboard permissions in `capabilities/default.json`.
- CRITICAL gotcha: `isDesktop()=true` makes `isNativeVoiceEngineRequired()` true → fatal-crashes on missing native voice_engine_v2 bridge. Patched `NativeVoiceEngineSelection.ts isNativeVoiceEngineRequired()` to return false when `window.electron && !window.electron.voiceEngine` (keeps working web/LiveKit voice). Without this patch the app white-screens at boot.

App boots clean in native mode (verified ALIVE, no panic). See [[fluxer-build-commands]].

To rebuild: frontend `pnpm rspack build --mode production && node scripts/tauri-postbuild.mjs && node scripts/tauri-stage.mjs`, then `cargo build -p fluxer-desktop`. NEVER run frontend stage + backend cargo build concurrently — the stage swaps dist hashes mid-compile and cargo's `include_dir` of web/dist fails ("failed to read asset").
