//! Fluxer desktop client — Tauri backend library.
//!
//! Owns the authenticated [`FluxerClient`], runs the gateway in a background
//! task, and exposes Tauri commands the React frontend invokes. Gateway events
//! are forwarded to the frontend via Tauri events so MobX stores can react.

use fluxer::gateway::{GatewayCommand, MemberRange, PresenceStatus, VoiceStateUpdate};
use fluxer::models::Snowflake;
use fluxer::{AuthToken, FluxerClient, ReactionTarget};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Mutex;
#[allow(unused_imports)]
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Notify;

mod capture;
mod desktop_bridge;
mod gateway;
mod image;
mod log_forward;
mod media_cache;
mod models;
mod proxy;
mod screen_sources;
mod sound;
mod telemetry;
mod ui_editor;
mod voice_engine;
mod voice_engine_events;
#[cfg(feature = "secure-storage")]
mod secure_storage;

pub use models::*;

/// The single piece of shared backend state held by Tauri.
pub struct AppState {
    /// The authenticated client. `None` until login succeeds.
    client: tokio::sync::Mutex<Option<FluxerClient>>,
    /// Cached current-user id (so commands can use it without re-fetching).
    me_id: tokio::sync::Mutex<Option<Snowflake>>,
    /// Image cache: URL -> bytes + content type. Used by the image proxy command.
    images: Mutex<std::collections::HashMap<String, image::CachedImage>>,
    /// Set of channels we have already loaded messages for (avoids reloading on
    /// every navigation; the frontend can request an explicit reload).
    loaded_channels: Mutex<HashSet<Snowflake>>,
    /// Notifier used to shut down the gateway task on logout/exit.
    gateway_shutdown: tokio::sync::Mutex<Option<std::sync::Arc<Notify>>>,
    /// Sender for gateway commands (e.g. guild subscriptions). Set on login.
    gateway_cmds: tokio::sync::Mutex<Option<tokio::sync::mpsc::Sender<GatewayCommand>>>,
    /// Cached instance endpoints (api/gateway/media/admin/static_cdn/features)
    /// resolved at login. Used by `upload_attachment` to route file uploads to
    /// the media endpoint when the instance advertises one.
    endpoints: tokio::sync::Mutex<Option<Endpoints>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            client: tokio::sync::Mutex::new(None),
            me_id: tokio::sync::Mutex::new(None),
            images: Mutex::new(std::collections::HashMap::new()),
            loaded_channels: Mutex::new(HashSet::new()),
            gateway_shutdown: tokio::sync::Mutex::new(None),
            gateway_cmds: tokio::sync::Mutex::new(None),
            endpoints: tokio::sync::Mutex::new(None),
        }
    }

    /// Take the client out (used on logout). Returns the shutdown notifier so
    /// the caller can stop the gateway task.
    async fn take_client(&self) -> (Option<FluxerClient>, Option<std::sync::Arc<Notify>>) {
        let client = self.client.lock().await.take();
        let gw = self.gateway_shutdown.lock().await.take();
        {
            let mut cmds = self.gateway_cmds.lock().await;
            *cmds = None;
        }
        (client, gw)
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct ApiError {
    pub message: String,
    pub code: String,
    pub status: u16,
}

impl From<fluxer::Error> for ApiError {
    fn from(e: fluxer::Error) -> Self {
        match e {
            fluxer::Error::Api {
                code,
                message,
                status,
                body: _,
            } => {
                // Phase 1.2: a 401 means the token is no longer valid (revoked
                // or expired). Clear the stored session so the next app start
                // prompts for login instead of trying to restore a dead token.
                #[cfg(feature = "secure-storage")]
                if status == reqwest::StatusCode::UNAUTHORIZED {
                    crate::secure_storage::clear_session();
                }
                ApiError {
                    message,
                    code,
                    status: status.as_u16(),
                }
            }
            other => ApiError {
                message: other.to_string(),
                code: "UNKNOWN".into(),
                status: 0,
            },
        }
    }
}

/// Convert any Result into a Result<T, String> for Tauri commands (we serialize
/// the structured error on the frontend side by emitting error events).
pub type CmdResult<T> = std::result::Result<T, ApiError>;

/// The app entry point: builds the Tauri app, registers state and commands,
/// and wires the native plugins (D.22): single-instance, window-state,
/// autostart, notifications, global shortcut (PTT/mute/deafen), and deep
/// links (`fluxer://invite/...`).
pub fn run() {
    // Install the rustls crypto provider before anything else. The gateway's
    // WebSocket (tokio-tungstenite + rustls-tls-webpki-roots) panics at
    // handshake time without a process-default CryptoProvider ("Could not
    // automatically determine the process-level CryptoProvider"). Doing this
    // first ensures both the REST client and the gateway can do TLS.
    fluxer::init_crypto();

    let _ = dotenvy::dotenv();

    // Configure the underlying Chromium (WebView2) before the webview is built.
    // These switches drive screen-share quality + efficiency:
    //
    //   * --auto-accept-camera-and-microphone-capture: getUserMedia resolves
    //     without a permission popup (this is a native app, not a website).
    //   * AcceleratedVideoEncoder: enable GPU video ENCODE. On Windows this
    //     routes WebRTC/screen-share encoding to the platform encoder
    //     (D3D11/MediaFoundation), which uses NVIDIA NVENC or AMD AMF
    //     automatically based on the active GPU — cutting CPU usage and
    //     improving quality/bitrate at high resolutions.
    //   * --enable-gpu-rasterization + --enable-zero-copy: keep frame buffers on
    //     the GPU (less CPU copy, lower memory bandwidth).
    //   * --autoplay-policy=no-user-gesture-required: remote video/voice tiles
    //     start without a synthetic gesture.
    //
    // Env var is read by WebView2 at boot. We MERGE our flags with any value the
    // user pre-set instead of skipping ours entirely — previously, if the
    // variable already existed (e.g. from a prior run, a launcher, or the
    // system), the `is_err()` guard dropped ALL of our flags, including
    // --auto-accept-camera-and-microphone-capture. That single omission caused
    // BOTH reported bugs: getUserMedia then showed a mic PERMISSION PROMPT
    // (should be silent in a native app), and if it wasn't granted, device
    // enumeration returned no labels so the settings pickers only showed
    // "Default". Merging guarantees the media flags always apply while still
    // letting the user append their own (a later occurrence of a switch wins in
    // Chromium, and duplicate flags are harmless).
    #[cfg(target_os = "windows")]
    {
        let user_extra = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
        let flags = [
            "--auto-accept-camera-and-microphone-capture",
            // Enable Chromium's desktop capture backend so getDisplayMedia can
            // capture screens/windows in WebView2.
            //
            // NOTE: we deliberately do NOT set --auto-select-desktop-capture-source
            // here. That flag makes getDisplayMedia auto-pick the FIRST screen and
            // SUPPRESS the picker — so the user could never share a specific window
            // or a second monitor, and "sharing an app" silently grabbed screen 1
            // instead (the reported "clicking doesn't start it"). Without the flag,
            // getDisplayMedia shows WebView2's native source picker (screens +
            // windows), which is the only way to target an arbitrary source in
            // WebView2 (a raw chromeMediaSourceId is rejected). The picker IS the
            // in-app source chooser.
            "--enable-usermedia-screen-capturing",
            // GPU hardware video ENCODE (NVENC/AMF via D3D11/MediaFoundation).
            // Kept ON — HW encode is a hard requirement and worth the GPU
            // process's memory. The consolidated --enable-features switch is set
            // below (Chromium only honors the last occurrence of the switch).
            "--enable-gpu-rasterization",
            "--enable-zero-copy",
            "--ignore-gpu-blocklist",
            "--autoplay-policy=no-user-gesture-required",
            // --- Screen-capture BLACK/DISTORTED FRAME fix ---
            // Chromium composites video (and some GPU surfaces) into
            // DirectComposition OVERLAY planes on Windows. Those planes live
            // outside the window's normal render target, so the desktop / window
            // capturer reads them back as BLACK or checkerboard-distorted — the
            // exact symptom on the screen-share preview. Disabling DComp video
            // overlays forces Chromium to composite into the readable surface.
            // This does NOT affect HARDWARE ENCODE (NVENC/AMF), which is a
            // separate MediaFoundation path — HW encode stays on.
            // Sources: guru3d/techpowerup/chromium-issues all confirm this flag
            // fixes black/checkerboard capture on Chromium-based apps.
            "--disable-direct-composition-video-overlays",
            // --- Memory reduction ---
            // Cap the V8 old-space heap: the renderer is the single largest
            // consumer (~200MB) and the SPA does not need a multi-GB heap at
            // idle. 384MB old-space + young gen keeps it well under control
            // while leaving headroom for message history / media decode.
            "--js-flags=--max-old-space-size=384",
            // One renderer only (single first-party app, no site isolation).
            "--renderer-process-limit=1",
            "--disable-site-isolation-trials",
            // Trim Edge/WebView2 bloat we never use. (The screen-capture
            // black-frame fix is carried entirely by
            // --disable-direct-composition-video-overlays above — no extra
            // feature token is needed here.)
            "--disable-features=msEdgeFluentOverlayScrollbar,EdgeCollections,msWebOOUI,msSmartScreenProtection,Translate,msWebAssistant,msEdgeSidebarV2,EdgeDiscoverErrorPageEnabled",
            // Crash reporting: WebView2 always spawns a ~19MB crashpad-handler
            // (can't be disabled via flags), but we stop it uploading.
            "--disable-crash-reporter",
            "--disable-breakpad",
            // No background network chatter (component updates, variations).
            "--disable-background-networking",
            "--disable-component-update",
            "--disable-domain-reliability",
            // Large on-DISK HTTP/media cache (not RAM — costs no idle memory).
            // Avatars, attachments, embeds, and video from the Fluxer CDN are
            // cached persistently so repeat loads are instant. 512MB.
            "--disk-cache-size=536870912",
            // Decode images off the main thread; keep decoded image cache lean
            // so scrolling media doesn't balloon renderer memory.
            "--enable-features=AcceleratedVideoEncoder,CanvasOopRasterization,ParallelDownloading",
            // The Web Speech API (speech-to-text / TTS) is never used by the
            // Fluxer client — confirmed no `SpeechRecognition`/`webkitSpeechRecognition`
            // usage in reference/fluxer/fluxer_app/src. Disabling it skips
            // loading the speech recognition service machinery entirely. This
            // is a distinct Chromium subsystem from getUserMedia/getDisplayMedia
            // (WebRTC media capture), so voice/video/screenshare are unaffected.
            "--disable-speech-api",
        ]
        .join(" ");
        // Append any user-provided extras AFTER ours so they can override
        // (Chromium honors the last occurrence of a repeated switch).
        let merged = if user_extra.trim().is_empty() {
            flags
        } else {
            format!("{flags} {user_extra}")
        };
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", merged);
    }

    // Linux uses WebKitGTK (not Chromium). getDisplayMedia flows through
    // xdg-desktop-portal + PipeWire (`pipewiresrc`), which carries both video
    // and audio when the portal grants it. Hardware encode is provided by the
    // modern GStreamer `va` plugins: NVIDIA via NVENC, AMD/Intel via VA-API —
    // these are enabled by default, so we do NOT force the deprecated
    // WEBKIT_GST_ENABLE_VAAPI legacy path (it causes rendering glitches).
    //
    // We only nudge WebKit to use the DMA-BUF renderer (zero-copy GPU frames,
    // lower CPU/memory) when the user hasn't overridden it.
    #[cfg(target_os = "linux")]
    {
        // Ensure the DMA-BUF renderer is not force-disabled by the environment
        // (some distros export this): keeping it enabled gives zero-copy GPU
        // frames for lower CPU/memory during screen share and video.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some() {
            std::env::remove_var("WEBKIT_DISABLE_DMABUF_RENDERER");
        }
    }

    // Build the tracing subscriber as a layered stack: a compact fmt layer
    // for stderr (always on) plus a `log_forward` layer that re-emits each
    // record as a `backend-log` Tauri event so the frontend devtools console
    // mirrors backend logs. The AppHandle isn't available before the Tauri
    // builder runs, so `log_forward::set_app` is called from `setup()`.
    use tracing_subscriber::layer::SubscriberExt;
    use tracing_subscriber::util::SubscriberInitExt;
    log_forward::set_level(log_forward::level_from_env());
    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(false)
        .compact();
    let log_layer = log_forward::LogLayer::new();
    // Default to `info` when RUST_LOG is unset. `EnvFilter::from_default_env()`
    // otherwise defaults to ERROR-only, which silently suppresses the gateway's
    // close-code/reconnect logs (all INFO/WARN) — making a connection failure
    // look like "no error logs" while the client retries indefinitely.
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::registry()
        .with(filter)
        .with(fmt_layer)
        .with(log_layer)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // D.22: single-instance — focus the existing window when a second
        // instance launches instead of starting a duplicate.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        // D.22: window-state — remember window position/size across restarts.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // D.22: autostart — let the user toggle launch-on-login (frontend
        // calls the plugin's commands directly).
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--flag1"]),
        ))
        // D.22: notifications — used for mention/desktop notifications from
        // the frontend via the plugin's JS API.
        .plugin(tauri_plugin_notification::init())
        // D.22: global shortcut — push-to-talk / mute / deafen hotkeys. Must
        // be registered before `.setup()` runs `setup_global_shortcuts`,
        // which calls `app.global_shortcut()`; otherwise the plugin's
        // managed state is absent and Tauri panics at startup.
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // D.22: deep links — register `fluxer://` so invite links open the
        // app. The handler emits a `deep-link` event the frontend listens for.
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // Auto-updates: checks the GitHub-releases-hosted latest.json (see
        // plugins.updater in tauri.conf.json) and applies signed MSI/AppImage
        // updates. Driven from the frontend via the shim's updater bridge.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::new())
        .manage(sound::SoundPlayer::new())
        .setup(|app| {
            // Hand the AppHandle to the log-forwarding layer so it can emit
            // `backend-log` events to the frontend. Done in setup (not run)
            // because the handle isn't available earlier.
            log_forward::set_app(app.handle().clone());

            // Start the local reverse proxy (loopback HTTP + gateway WS bridge)
            // and build the `window.__FLUXER_BOOTSTRAP__` object pointing at it,
            // then create the main webview with that object injected as an
            // initialization script so it runs before any app module script.
            //
            // The reference web client hard-requires `__FLUXER_BOOTSTRAP__` and
            // cannot reach the Fluxer API cross-origin from `tauri://localhost`
            // (CORS), so the proxy presents an allowed identity server-side.
            let proxy_port = tauri::async_runtime::block_on(proxy::start())
                .map_err(|e| format!("failed to start API proxy: {e}"))?;
            const BOOTSTRAP_TEMPLATE: &str = include_str!("../bootstrap-template.json");
            let init_script = proxy::build_init_script(BOOTSTRAP_TEMPLATE, proxy_port);

            let entry = std::env::var("FLUXER_ENTRY").unwrap_or_else(|_| "index.html".to_string());
            let win = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App(entry.into()),
            )
            .title("Ruxer")
            .inner_size(1280.0, 800.0)
            .min_inner_size(760.0, 480.0)
            .resizable(true)
            // Frameless: the reference client draws its own titlebar
            // (NativeTitlebar) with the Ruxer wordmark + window controls, so the
            // native OS title bar is removed to avoid a double bar. Dragging +
            // double-click-maximize are handled by `data-tauri-drag-region` in
            // the custom titlebar (WebView2 ignores -webkit-app-region).
            .decorations(false)
            .initialization_script(&init_script)
            .build()
            .map_err(|e| format!("failed to build main window: {e}"))?;

            // The reference titlebar's maximize/restore icon tracks window state
            // via the `window-maximize-change` event (bridged by the desktop
            // shim's onWindowMaximizeChange). Emit it on resize so the icon
            // flips between "maximize" and "restore".
            {
                let win_evt = win.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::Resized(_) = event {
                        let maximized = win_evt.is_maximized().unwrap_or(false);
                        let _ = win_evt.emit("window-maximize-change", maximized);
                    }
                });
            }

            // Belt-and-suspenders: force the native OS frame off at runtime too
            // (in case the builder flag is overridden by a restored window state
            // from tauri-plugin-window-state). The reference client draws its own
            // titlebar, so the native Windows title bar must not appear.
            let _ = win.set_decorations(false);

            // Linux (WebKitGTK): WebRTC + media-stream support are OFF by
            // default in WebKitGTK — without flipping these on, joining a
            // voice call silently does nothing (RTCPeerConnection/getUserMedia
            // are unavailable to the page). Requires the user's system to have
            // GStreamer's WebRTC plugins (gst-plugins-good/bad) installed,
            // which desktop distros ship by default.
            //
            // Also shrink WebKit's cache model: the default WEB_BROWSER model
            // keeps large page/back-forward/resource caches sized for general
            // browsing that this single-page app never revisits, which
            // inflated resident memory well past the Electron-based client.
            // DOCUMENT_VIEWER is the model WebKit documents for exactly this
            // "embedded single document" case.
            #[cfg(target_os = "linux")]
            {
                use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};
                let _ = win.with_webview(|webview| {
                    let wv = webview.inner();
                    if let Some(settings) = WebViewExt::settings(&wv) {
                        settings.set_enable_webrtc(true);
                        settings.set_enable_media_stream(true);
                        settings.set_enable_mediasource(true);
                        settings.set_enable_encrypted_media(true);
                        settings.set_enable_page_cache(false);
                        // Inspector access (right-click → Inspect / the
                        // desktop_toggle_devtools command). Off by default in
                        // WebKitGTK even when tauri's devtools feature is on.
                        settings.set_enable_developer_extras(true);
                    }
                    if let Some(context) = wv.context() {
                        use webkit2gtk::WebContextExt;
                        context.set_cache_model(webkit2gtk::CacheModel::DocumentViewer);
                    }
                    // WebKitGTK DENIES getUserMedia by default unless the
                    // embedder explicitly handles permission-request — with no
                    // handler, mic/cam prompts auto-reject and joining a voice
                    // call fails after the WebRTC flags above made the API
                    // exist at all. This is the Linux counterpart of the
                    // `--auto-accept-camera-and-microphone-capture` WebView2
                    // flag the Windows build already passes.
                    wv.connect_permission_request(|_wv, request| {
                        use webkit2gtk::glib::object::ObjectExt as _;
                        use webkit2gtk::{DeviceInfoPermissionRequest, UserMediaPermissionRequest};
                        if request.is::<UserMediaPermissionRequest>()
                            || request.is::<DeviceInfoPermissionRequest>()
                        {
                            request.allow();
                            true
                        } else {
                            false // default handling for anything else
                        }
                    });
                    // These settings land AFTER the initial navigation already
                    // started (with_webview runs post-build), and WebKit only
                    // installs the WebRTC globals (RTCPeerConnection & co) into
                    // pages whose load began with enable-webrtc already on —
                    // without this reload, LiveKit fails with "doesn't seem to
                    // be supported on this browser" even though the distro
                    // webkit has WebRTC compiled in. One reload at startup,
                    // before the user can meaningfully interact.
                    wv.reload();
                });
            }

            // Windows (WebView2): suppress the native "Do you want <origin> to
            // share your screen?" permission dialog. The native voice engine's
            // screen-share path calls getUserMedia({chromeMediaSource:'desktop'})
            // (for the sharer's own preview), which WebView2 gates with that
            // dialog — there is no --auto-accept flag for screen capture, only
            // for camera/mic. Handling the ScreenCaptureStarting event and
            // marking it Handled tells WebView2 the embedder approves, so the
            // dialog never appears. Requires a recent WebView2 runtime
            // (ICoreWebView2_20); if the cast fails on an older runtime we no-op
            // and the pre-existing dialog behaviour is unchanged.
            #[cfg(target_os = "windows")]
            {
                use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_27;
                use webview2_com::ScreenCaptureStartingEventHandler;
                use windows::core::Interface;
                let _ = win.with_webview(|webview| {
                    // SAFETY: controller() hands back the live ICoreWebView2Controller
                    // pointer for this webview; we only query interfaces + register
                    // an event handler, all on the UI thread inside with_webview.
                    let controller = webview.controller();
                    unsafe {
                        if let Ok(core) = controller.CoreWebView2() {
                            // add_ScreenCaptureStarting lives on ICoreWebView2_27
                            // (newer WebView2 runtime). Cast fails gracefully on
                            // older runtimes → we no-op and the dialog behaviour
                            // is unchanged.
                            if let Ok(core27) = core.cast::<ICoreWebView2_27>() {
                                let handler = ScreenCaptureStartingEventHandler::create(Box::new(
                                    |_sender, args| {
                                        if let Some(args) = args {
                                            // ALLOW the capture (Cancel=false) AND
                                            // suppress the default permission UI
                                            // (Handled=true). Both are required —
                                            // Handled alone still leaves the dialog
                                            // to arbitrate; Cancel=false is the
                                            // explicit grant.
                                            let _ = args.SetCancel(false);
                                            let _ = args.SetHandled(true);
                                        }
                                        Ok(())
                                    },
                                ));
                                let mut token = 0i64;
                                let _ = core27.add_ScreenCaptureStarting(&handler, &mut token);
                            }
                        }
                    }
                });
            }

            // Auto-open DevTools only when explicitly requested (it spawns a
            // whole extra renderer that skews memory measurements). Works in
            // release builds too now (tauri's `devtools` feature); at runtime
            // use F12 / Ctrl+Shift+I (bridged by the shim to
            // desktop_toggle_devtools) or set FLUXER_DEVTOOLS=1 to open at
            // launch.
            if std::env::var("FLUXER_DEVTOOLS").as_deref() == Ok("1") {
                win.open_devtools();
            }

            // D.22: global shortcut — register a push-to-talk hotkey (Ctrl+`/
            // Cmd+`) plus mute/deafen shortcuts. The shortcuts toggle voice
            // state via a Tauri event the frontend reacts to. We register
            // these in setup so they're active immediately on launch.
            setup_global_shortcuts(&app.handle())?;

            // D.22: deep-link — emit the URL to the frontend when the app is
            // opened via `fluxer://...`. The frontend parses invite URLs.
            setup_deep_link_handler(&app.handle());

            // First-launch telemetry consent prompt (no-op once answered).
            telemetry::prompt_if_unasked(&app.handle());

            // Media cache: prune stale/oversized entries in the background so
            // the on-disk temp cache stays bounded. Entries older than 7 days
            // or beyond a 256 MiB total are dropped. Never blocks startup.
            media_cache::prune_async(
                std::time::Duration::from_secs(60 * 60 * 24 * 7),
                256 * 1024 * 1024,
            );

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            login,
            login_credentials,
            verify_totp,
            logout,
            current_user,
            has_stored_session,
            #[cfg(feature = "secure-storage")]
            restore_session,
            list_guilds,
            create_guild,
            fetch_invite,
            accept_invite,
            leave_guild,
            list_guild_bans,
            ban_user,
            unban_user,
            kick_member,
            delete_guild,
            create_channel,
            edit_channel,
            create_channel_invite,
            list_channel_invites,
            revoke_invite,
            subscribe_guild,
            subscribe_ranges,
            request_members,
            update_presence,
            voice_state_update,
            list_dms,
            list_channels,
            list_members,
            get_guild_member,
            update_guild_member,
            list_guild_emojis,
            list_guild_stickers,
            list_guild_roles,
            create_guild_role,
            update_guild_role,
            delete_guild_role,
            add_member_role,
            remove_member_role,
            guild_audit_log,
            list_channel_webhooks,
            create_guild_emoji,
            update_guild_emoji,
            delete_guild_emoji,
            create_guild_sticker,
            update_guild_sticker,
            delete_guild_sticker,
            premium_state,
            save_theme,
            report_message,
            report_user,
            report_guild,
            create_channel_webhook,
            update_webhook,
            delete_webhook,
            list_messages,
            send_message,
            edit_message,
            delete_message,
            bulk_delete_messages,
            trigger_typing,
            ack_message,
            ack_channel,
            start_thread,
            start_thread_on_message,
            list_active_threads,
            join_thread,
            leave_thread,
            search_messages,
            gif_search,
            gif_trending,
            discovery_guilds,
            discovery_categories,
            discovery_join,
            list_read_state,
            list_pins,
            pin_message,
            unpin_message,
            add_reaction,
            remove_own_reaction,
            remove_reaction_for,
            open_dm,
            create_group_dm,
            list_relationships,
            send_friend_request,
            remove_relationship,
            get_user,
            get_channel,
            delete_channel,
            add_recipient,
            remove_recipient,
            mark_channel_loaded,
            image_proxy,
            image_proxy_asset,
            upload_attachment,
            resolve_endpoints,
            desktop_bridge::desktop_info,
            desktop_bridge::desktop_download_file,
            desktop_bridge::desktop_initial_deep_link,
            desktop_bridge::desktop_global_hook_start,
            desktop_bridge::desktop_global_hook_stop,
            desktop_bridge::desktop_get_sources,
            desktop_bridge::desktop_select_capture_source,
            desktop_bridge::native_capture_start,
            desktop_bridge::native_capture_stop,
            desktop_bridge::desktop_get_gpu_info,
            desktop_bridge::desktop_toggle_devtools,
            desktop_bridge::desktop_relaunch,
            telemetry::telemetry_get_enabled,
            telemetry::telemetry_set_enabled,
            telemetry::telemetry_report,
            voice_engine::voice_engine_is_supported,
            voice_engine::voice_engine_get_capabilities,
            voice_engine::voice_engine_prewarm,
            voice_engine::voice_engine_get_readiness,
            voice_engine::voice_engine_connect,
            voice_engine::voice_engine_disconnect,
            voice_engine::voice_engine_is_connected,
            voice_engine::voice_engine_set_mic_enabled,
            voice_engine::voice_engine_publish_data,
            voice_engine::voice_engine_list_audio_input_devices,
            voice_engine::voice_engine_list_audio_output_devices,
            voice_engine::voice_engine_set_audio_output_device,
            voice_engine::voice_engine_set_audio_input_device,
            voice_engine::voice_engine_set_remote_track_subscription,
            voice_engine::voice_engine_set_participant_volume,
            voice_engine::voice_engine_set_speaking_detection,
            voice_engine::voice_engine_get_connection_stats,
            voice_engine::voice_engine_set_audio_processing,
            voice_engine::voice_engine_list_screen_sources,
            voice_engine::voice_engine_publish_screen,
            voice_engine::voice_engine_unpublish_screen,
            voice_engine::voice_engine_list_camera_devices,
            voice_engine::voice_engine_publish_camera,
            voice_engine::voice_engine_unpublish_camera,
            voice_engine::voice_engine_start_video,
            voice_engine::voice_engine_stop_video,
            sound::play_ui_sound,
            ui_editor::ui_editor_run_lua,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Get a clone of the current client, or return an auth error.
async fn client(state: &State<'_, AppState>) -> CmdResult<FluxerClient> {
    state
        .client
        .lock()
        .await
        .clone()
        .ok_or_else(|| ApiError {
            message: "Not logged in.".into(),
            code: "NOT_AUTHENTICATED".into(),
            status: 401,
        })
}

/// Build an [`AuthToken`] from the login form inputs.
fn auth_token(token: String, kind: &str) -> AuthToken {
    match kind {
        "bot" => AuthToken::bot(token),
        "bearer" => AuthToken::bearer(token),
        _ => AuthToken::session(token),
    }
}

// ---------------------------------------------------------------------------
// Auth + session commands
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct LoginResult {
    pub me: fluxer::models::UserPrivate,
    pub guilds: Vec<fluxer::models::Guild>,
    pub dms: Vec<fluxer::models::Channel>,
    pub relationships: Vec<fluxer::models::Relationship>,
    pub endpoints: Option<Endpoints>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Endpoints {
    pub api: Option<String>,
    /// Public REST API base (no `Origin` check). Preferred for non-browser
    /// clients (the Tauri backend) over `api`, which is origin-checked.
    #[serde(default)]
    pub api_public: Option<String>,
    pub gateway: Option<String>,
    pub media: Option<String>,
    pub admin: Option<String>,
    pub static_cdn: Option<String>,
    pub features: Vec<String>,
}

/// Login: build a client, fetch the current user + guilds + DMs + relationships,
/// start the gateway, and return everything the frontend needs to bootstrap.
///
/// Endpoint resolution order (drives URLs via discovery):
///   1. Resolve `/.well-known/fluxer` from `instance` (default `fluxer.app`).
///   2. API base: explicit `api_base` override → discovered `endpoints.api` →
///      `DEFAULT_API_BASE`.
///   3. Gateway URL: explicit `gateway_url` override → discovered
///      `endpoints.gateway` → `GET /gateway/bot` → `DEFAULT_GATEWAY_URL`.
#[tauri::command]
async fn login(
    app: AppHandle,
    state: State<'_, AppState>,
    token: String,
    kind: String,
    instance: Option<String>,
    api_base: Option<String>,
    gateway_url: Option<String>,
    cdn_base: Option<String>,
) -> CmdResult<LoginResult> {
    // Phase 1.1: discovery drives URLs. Resolve the instance's well-known
    // document first so the REST + gateway bases come from discovery.
    let instance = instance
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fluxer.app".to_string());
    let discovered = fluxer::discovery::resolve(&instance).await;

    let auth = auth_token(token.clone(), &kind);
    let mut builder = FluxerClient::builder(auth);
    // API base: explicit override → discovered `api_public` (no origin check —
    // the web-client `api` endpoint rejects non-browser origins with
    // `INVALID_API_ORIGIN`) → discovered `api` → default.
    let api_base = api_base
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            discovered
                .as_ref()
                .and_then(|d| d.api_base_for_backend().map(|s| s.to_string()))
        });
    if let Some(base) = api_base {
        builder = builder.base_url(base);
    }
    let client = builder.build().map_err(|e| ApiError {
        message: e.to_string(),
        code: "BUILD".into(),
        status: 0,
    })?;

    // Fetch everything in parallel so login feels instant.
    let users = client.users();
    let (me_res, guilds_res, dms_res, rels_res) = tokio::join!(
        users.current(),
        users.guilds(),
        users.private_channels(),
        users.relationships(),
    );
    let me = me_res?;
    let guilds = guilds_res?;
    let dms = dms_res?;
    let relationships = rels_res.unwrap_or_default();

    {
        let mut slot = state.me_id.lock().await;
        *slot = Some(me.user.id.clone());
    }

    // Resolve endpoints for images + to expose api/gateway to the frontend.
    // Prefer the discovered doc; fall back to re-resolving from the client's
    // base URL (handles explicit api_base overrides that point elsewhere).
    let endpoints = match discovered {
        Some(d) => Some(Endpoints {
            api: d.api,
            api_public: d.api_public,
            gateway: d.gateway,
            media: d.media,
            admin: d.admin,
            static_cdn: d.static_cdn,
            features: d.features,
        }),
        None => image::resolve_endpoints(&client).await,
    };
    if let Some(ref ep) = endpoints {
        if let Some(ref media) = ep.media {
            tracing::info!(%media, "media base");
        }
        if let Some(ref s) = ep.static_cdn {
            tracing::info!(%s, "static cdn");
        }
    }
    let _ = cdn_base; // manual override applied client-side via image_proxy base

    // Store the client.
    {
        let mut slot = state.client.lock().await;
        *slot = Some(client.clone());
    }
    // Cache the resolved endpoints so `upload_attachment` can route to the
    // media endpoint without re-running discovery on every upload.
    {
        let mut slot = state.endpoints.lock().await;
        *slot = endpoints.clone();
    }

    // Gateway URL: explicit override → discovered → /gateway/bot → default.
    let url = match gateway_url
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        Some(u) => u,
        None => match endpoints.as_ref().and_then(|e| e.gateway.clone()) {
            Some(u) => u,
            None => match client.gateway_url().await {
                Ok(u) => u,
                Err(_) => fluxer::client::DEFAULT_GATEWAY_URL.to_string(),
            },
        },
    };
    let shutdown = std::sync::Arc::new(Notify::new());
    {
        let mut slot = state.gateway_shutdown.lock().await;
        *slot = Some(shutdown.clone());
    }
    let cmd_tx = gateway::spawn(app.clone(), client.clone(), url, shutdown);
    {
        let mut cmds = state.gateway_cmds.lock().await;
        *cmds = Some(cmd_tx);
    }

    // Phase 1.2: persist credentials + instance to OS keychain so a later app
    // start can silently restore the session.
    #[cfg(feature = "secure-storage")]
    {
        let _ = crate::secure_storage::save_session(
            &state,
            &token,
            &kind,
            &instance,
            endpoints.as_ref(),
        );
    }

    Ok(LoginResult {
        me,
        guilds,
        dms,
        relationships,
        endpoints: endpoints,
    })
}

/// Logout: stop the gateway and drop the client. Clears the stored session
/// from the OS keychain so the next app start prompts for login.
#[tauri::command]
async fn logout(state: State<'_, AppState>) -> CmdResult<()> {
    let (_client, gw) = state.take_client().await;
    if let Some(notify) = gw {
        notify.notify_waiters();
    }
    {
        let mut slot = state.me_id.lock().await;
        *slot = None;
    }
    {
        let mut slot = state.endpoints.lock().await;
        *slot = None;
    }
    state.loaded_channels.lock().unwrap().clear();
    #[cfg(feature = "secure-storage")]
    {
        crate::secure_storage::clear_session();
    }
    Ok(())
}

/// Check whether a stored session exists in the OS keychain, without
/// revealing the token to the frontend. Used by the app on start to decide
/// whether to attempt a silent restore (`restore_session`) or show the login
/// view.
#[tauri::command]
fn has_stored_session() -> bool {
    #[cfg(feature = "secure-storage")]
    {
        return crate::secure_storage::load_session().is_some();
    }
    #[cfg(not(feature = "secure-storage"))]
    {
        return false;
    }
}

/// Restore a previously saved session from the OS keychain. Returns the
/// stored `{ token, kind, instance, endpoints }` so the frontend can call
/// `login` with them (re-running discovery + bootstrap). The token never
/// touches disk; the keychain is the only persistent copy.
#[cfg(feature = "secure-storage")]
#[derive(Serialize)]
struct StoredSessionOut {
    token: String,
    kind: String,
    instance: String,
    endpoints: Option<Endpoints>,
}

#[cfg(feature = "secure-storage")]
#[tauri::command]
fn restore_session() -> CmdResult<Option<StoredSessionOut>> {
    Ok(crate::secure_storage::load_session().map(|s| StoredSessionOut {
        token: s.token,
        kind: s.kind,
        instance: s.instance,
        endpoints: s.endpoints,
    }))
}

/// Return the cached current user id (fast; avoids a round-trip).
#[tauri::command]
async fn current_user(state: State<'_, AppState>) -> CmdResult<Option<Snowflake>> {
    Ok(state.me_id.lock().await.clone())
}

// ---------------------------------------------------------------------------
// Email/password + MFA login (E.23)
// ---------------------------------------------------------------------------

/// The result of `POST /auth/login`: either a completed login (session token
/// ready to feed to the `login` command) or an MFA challenge the frontend
/// must resolve via `verify_totp`. Tagged with `kind` so the frontend can
/// discriminate without inspecting field presence.
#[derive(Debug, Serialize)]
#[serde(tag = "kind")]
enum LoginCredentialsResult {
    /// Login completed — `token` is a session token; pass it to `login` with
    /// `kind = "session"` to bootstrap the full client + gateway.
    Token { token: String, user_id: Snowflake },
    /// MFA is required. Show the MFA challenge UI and call `verify_totp` with
    /// the ticket + the user's TOTP code.
    Mfa {
        ticket: String,
        allowed_methods: Vec<String>,
        totp: bool,
        webauthn: bool,
    },
}

/// `POST /auth/login` — authenticate with email + password. This is the
/// first leg of the email/password login flow (E.23); it does NOT bootstrap
/// the [`FluxerClient`] or gateway. When it returns a token, the frontend
/// feeds that token to the existing `login` command with `kind = "session"`
/// to complete the bootstrap. When it returns an MFA challenge, the frontend
/// collects a TOTP code and calls [`verify_totp`] to obtain the token.
///
/// Endpoint resolution matches `login`: explicit `api_base` → discovered
/// `endpoints.api` → `DEFAULT_API_BASE`.
#[tauri::command]
async fn login_credentials(
    instance: Option<String>,
    api_base: Option<String>,
    email: String,
    password: String,
) -> CmdResult<LoginCredentialsResult> {
    let instance = instance
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fluxer.app".to_string());
    let discovered = fluxer::discovery::resolve(&instance).await;
    let base = api_base
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| discovered.as_ref().and_then(|d| d.api_base_for_backend().map(|s| s.to_string())))
        .unwrap_or_else(|| fluxer::http::DEFAULT_API_BASE.to_string());

    let login = fluxer::Login::new(base);
    let outcome = login.login(&email, &password).await?;
    Ok(match outcome {
        fluxer::LoginOutcome::Token { token, user_id } => {
            LoginCredentialsResult::Token { token, user_id }
        }
        fluxer::LoginOutcome::MfaChallenge(ch) => LoginCredentialsResult::Mfa {
            ticket: ch.ticket,
            allowed_methods: ch.allowed_methods,
            totp: ch.totp,
            webauthn: ch.webauthn,
        },
    })
}

/// `POST /auth/login/mfa/totp` — complete the MFA leg of email/password
/// login by verifying the TOTP code from the user's authenticator app.
/// Returns a session token the frontend feeds into the `login` command with
/// `kind = "session"`.
#[tauri::command]
async fn verify_totp(
    instance: Option<String>,
    api_base: Option<String>,
    ticket: String,
    code: String,
) -> CmdResult<LoginCredentialsResult> {
    let instance = instance
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fluxer.app".to_string());
    let discovered = fluxer::discovery::resolve(&instance).await;
    let base = api_base
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| discovered.as_ref().and_then(|d| d.api_base_for_backend().map(|s| s.to_string())))
        .unwrap_or_else(|| fluxer::http::DEFAULT_API_BASE.to_string());

    let login = fluxer::Login::new(base);
    let res = login.verify_totp(&ticket, &code).await?;
    Ok(LoginCredentialsResult::Token {
        token: res.token,
        user_id: res.user_id,
    })
}

// ---------------------------------------------------------------------------
// Guild / channel / member commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn list_guilds(state: State<'_, AppState>) -> CmdResult<Vec<fluxer::models::Guild>> {
    let c = client(&state).await?;
    c.users().guilds().await.map_err(Into::into)
}

/// `POST /guilds` — create a new guild. The current user becomes the owner.
/// `icon` is an optional base64 data URI.
#[tauri::command]
async fn create_guild(
    state: State<'_, AppState>,
    name: String,
    icon: Option<String>,
) -> CmdResult<fluxer::models::Guild> {
    let c = client(&state).await?;
    c.guilds()
        .create(&name, icon.as_deref())
        .await
        .map_err(Into::into)
}

/// `GET /invites/{code}` — fetch an invite preview (guild + channel metadata,
/// approximate member counts). Used by the join-by-invite modal.
#[tauri::command]
async fn fetch_invite(
    state: State<'_, AppState>,
    code: String,
) -> CmdResult<fluxer::models::Invite> {
    let c = client(&state).await?;
    c.invites().fetch(&code).await.map_err(Into::into)
}

/// The target returned by `accept_invite`: a guild (guild invites) or a
/// channel (group-DM invites). The frontend switches to whichever is present.
#[derive(Serialize)]
#[serde(tag = "kind")]
enum AcceptedInvite {
    Guild { guild: fluxer::models::Guild },
    Channel { channel: fluxer::models::Channel },
}

/// `POST /invites/{code}` — accept an invite. Returns the joined guild or
/// channel so the frontend can switch to it.
#[tauri::command]
async fn accept_invite(
    state: State<'_, AppState>,
    code: String,
) -> CmdResult<AcceptedInvite> {
    let c = client(&state).await?;
    let target = c.invites().accept(&code).await?;
    Ok(match target {
        fluxer::api::invites::JoinedTarget::Guild(g) => AcceptedInvite::Guild { guild: g },
        fluxer::api::invites::JoinedTarget::Channel(ch) => AcceptedInvite::Channel { channel: ch },
    })
}

/// `DELETE /users/@me/guilds/{guild_id}` — leave a guild.
#[tauri::command]
async fn leave_guild(
    state: State<'_, AppState>,
    guild_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.users().leave_guild(&guild_id).await.map_err(Into::into)
}

// ---------------------------------------------------------------------------
// Guild admin (D.20)
// ---------------------------------------------------------------------------

#[tauri::command]
async fn list_guild_bans(
    state: State<'_, AppState>,
    guild_id: Snowflake,
) -> CmdResult<Vec<fluxer::models::GuildBan>> {
    let c = client(&state).await?;
    c.guilds().bans(&guild_id).await.map_err(Into::into)
}

#[tauri::command]
async fn ban_user(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    user_id: Snowflake,
    reason: Option<String>,
    delete_message_seconds: Option<i64>,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.guilds()
        .ban(
            &guild_id,
            &user_id,
            reason.as_deref(),
            delete_message_seconds,
        )
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn unban_user(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    user_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.guilds().unban(&guild_id, &user_id).await.map_err(Into::into)
}

#[tauri::command]
async fn kick_member(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    user_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.guilds().kick(&guild_id, &user_id).await.map_err(Into::into)
}

#[tauri::command]
async fn delete_guild(
    state: State<'_, AppState>,
    guild_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.guilds().delete(&guild_id).await.map_err(Into::into)
}

// ---------------------------------------------------------------------------
// Channel admin (D.20)
// ---------------------------------------------------------------------------

#[tauri::command]
async fn create_channel(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    name: String,
    kind: i32,
    parent_id: Option<Snowflake>,
    topic: Option<String>,
) -> CmdResult<fluxer::models::Channel> {
    let c = client(&state).await?;
    c.channels()
        .create(&guild_id, &name, kind, parent_id.as_ref(), topic.as_deref())
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn edit_channel(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    name: Option<String>,
    topic: Option<String>,
    parent_id: Option<Snowflake>,
) -> CmdResult<fluxer::models::Channel> {
    let c = client(&state).await?;
    c.channels()
        .edit(&channel_id, name.as_deref(), topic.as_deref(), parent_id.as_ref())
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn create_channel_invite(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    max_age: Option<i32>,
    max_uses: Option<i32>,
) -> CmdResult<fluxer::models::Invite> {
    let c = client(&state).await?;
    c.invites()
        .create_for_channel(&channel_id, max_age, max_uses)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn list_channel_invites(
    state: State<'_, AppState>,
    channel_id: Snowflake,
) -> CmdResult<Vec<fluxer::models::Invite>> {
    let c = client(&state).await?;
    c.invites().list_for_channel(&channel_id).await.map_err(Into::into)
}

#[tauri::command]
async fn revoke_invite(
    state: State<'_, AppState>,
    code: String,
) -> CmdResult<fluxer::models::Invite> {
    let c = client(&state).await?;
    c.invites().revoke(&code).await.map_err(Into::into)
}

/// Subscribe to a guild's gateway events (messages, typing, members) via a
/// LAZY_REQUEST (op 14). Fluxer uses per-guild subscriptions instead of intents.
#[tauri::command]
async fn subscribe_guild(
    state: State<'_, AppState>,
    guild_id: Snowflake,
) -> CmdResult<()> {
    let cmds = state.gateway_cmds.lock().await;
    if let Some(tx) = cmds.as_ref() {
        let _ = tx
            .send(GatewayCommand::SubscribeGuild { guild_id })
            .await;
    }
    Ok(())
}

/// Subscribe to specific member-list index ranges for a guild. Used for the
/// lazy member list on big guilds: instead of pulling every member, the
/// client subscribes to the ranges the user is actually viewing and the
/// server pushes `GUILD_MEMBERS_CHUNK` events covering only those indices.
/// Each range is inclusive on both ends.
#[tauri::command]
async fn subscribe_ranges(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    ranges: Vec<(u32, u32)>,
) -> CmdResult<()> {
    let cmds = state.gateway_cmds.lock().await;
    if let Some(tx) = cmds.as_ref() {
        let ranges = ranges
            .into_iter()
            .map(|(start, end)| MemberRange { start, end })
            .collect();
        let _ = tx
            .send(GatewayCommand::SubscribeRanges { guild_id, ranges })
            .await;
    }
    Ok(())
}

/// Request a member list chunk for a guild (op 8 REQUEST_GUILD_MEMBERS). Used
/// when the lazy list isn't enough — e.g. to enumerate members by name prefix
/// (`query`) or to page through up to `limit` members.
#[tauri::command]
async fn request_members(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    query: Option<String>,
    limit: Option<u32>,
) -> CmdResult<()> {
    let cmds = state.gateway_cmds.lock().await;
    if let Some(tx) = cmds.as_ref() {
        let _ = tx
            .send(GatewayCommand::RequestMembers { guild_id, query, limit })
            .await;
    }
    Ok(())
}

/// Update the current user's presence (op 3 PRESENCE_UPDATE). `status` is one
/// of "online" | "dnd" | "idle" | "invisible" | "offline". `activities` is a
/// JSON array passed through to the gateway (custom status, game activity,
/// etc.). `afk` and `since` are optional.
#[tauri::command]
async fn update_presence(
    state: State<'_, AppState>,
    status: String,
    activities: serde_json::Value,
    afk: Option<bool>,
    since: Option<u64>,
) -> CmdResult<()> {
    let status = match status.as_str() {
        "online" => PresenceStatus::Online,
        "dnd" => PresenceStatus::Dnd,
        "idle" => PresenceStatus::Idle,
        "invisible" => PresenceStatus::Invisible,
        "offline" => PresenceStatus::Offline,
        _ => PresenceStatus::Online,
    };
    let activities = match activities {
        serde_json::Value::Array(a) => a,
        _ => Vec::new(),
    };
    let cmds = state.gateway_cmds.lock().await;
    if let Some(tx) = cmds.as_ref() {
        let _ = tx
            .send(GatewayCommand::UpdatePresence {
                status,
                activities,
                afk: afk.unwrap_or(false),
                since,
            })
            .await;
    }
    Ok(())
}

/// Send a voice state update over the gateway (op 4). Pass `channel_id: null`
/// to disconnect from voice. The other fields are optional; `None` leaves
/// them unchanged on the server side. The server responds with a
/// VOICE_STATE_UPDATE dispatch (echoing the change to all listeners) and, if
/// a channel was joined, a VOICE_SERVER_UPDATE with the LiveKit connection
/// details the frontend needs to connect via livekit-client.
#[tauri::command]
async fn voice_state_update(
    state: State<'_, AppState>,
    guild_id: Option<Snowflake>,
    channel_id: Option<Snowflake>,
    self_mute: Option<bool>,
    self_deaf: Option<bool>,
    self_video: Option<bool>,
) -> CmdResult<()> {
    let cmds = state.gateway_cmds.lock().await;
    if let Some(tx) = cmds.as_ref() {
        let _ = tx
            .send(GatewayCommand::VoiceStateUpdate(VoiceStateUpdate {
                guild_id,
                channel_id,
                self_mute,
                self_deaf,
                self_video,
            }))
            .await;
    }
    Ok(())
}

#[tauri::command]
async fn list_dms(state: State<'_, AppState>) -> CmdResult<Vec<fluxer::models::Channel>> {
    let c = client(&state).await?;
    c.users().private_channels().await.map_err(Into::into)
}

#[tauri::command]
async fn list_channels(
    state: State<'_, AppState>,
    guild_id: Snowflake,
) -> CmdResult<Vec<fluxer::models::Channel>> {
    let c = client(&state).await?;
    c.guilds().channels(&guild_id).await.map_err(Into::into)
}

#[tauri::command]
async fn list_members(
    state: State<'_, AppState>,
    guild_id: Snowflake,
) -> CmdResult<Vec<fluxer::models::Member>> {
    let c = client(&state).await?;
    c.guilds().members(&guild_id, Some(200), None)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn get_guild_member(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    user_id: Snowflake,
) -> CmdResult<fluxer::models::Member> {
    let c = client(&state).await?;
    c.guilds().member(&guild_id, &user_id).await.map_err(Into::into)
}

#[tauri::command]
async fn update_guild_member(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    user_id: Snowflake,
    mute: Option<bool>,
    deaf: Option<bool>,
    // Move/disconnect: when `set_channel` is true, `channel_id` is applied
    // (Some = move there, None = disconnect). When false, the field is left
    // untouched. This avoids the JSON double-Option ambiguity across the IPC
    // boundary (Tauri command args don't support serde field attributes).
    set_channel: Option<bool>,
    channel_id: Option<Snowflake>,
    nick: Option<String>,
) -> CmdResult<fluxer::models::Member> {
    let c = client(&state).await?;
    let channel = if set_channel.unwrap_or(false) {
        Some(channel_id)
    } else {
        None
    };
    c.guilds()
        .update_member(&guild_id, &user_id, mute, deaf, channel, nick.as_deref())
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn list_guild_emojis(
    state: State<'_, AppState>,
    guild_id: Snowflake,
) -> CmdResult<Vec<fluxer::models::Emoji>> {
    let c = client(&state).await?;
    c.guilds().emojis(&guild_id).await.map_err(Into::into)
}

#[tauri::command]
async fn list_guild_stickers(
    state: State<'_, AppState>,
    guild_id: Snowflake,
) -> CmdResult<Vec<fluxer::models::Sticker>> {
    let c = client(&state).await?;
    c.guilds().stickers(&guild_id).await.map_err(Into::into)
}

// ---------------------------------------------------------------------------
// Message commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn list_messages(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    limit: Option<i32>,
    before: Option<Snowflake>,
) -> CmdResult<Vec<fluxer::models::Message>> {
    let c = client(&state).await?;
    let params = fluxer::models::ListParams {
        limit,
        before,
        ..Default::default()
    };
    c.messages().list(&channel_id, params).await.map_err(Into::into)
}

#[tauri::command]
async fn send_message(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    content: String,
    reply_to: Option<Snowflake>,
    attachments: Option<Vec<AttachmentInput>>,
    sticker_ids: Option<Vec<Snowflake>>,
    nonce: Option<String>,
) -> CmdResult<fluxer::models::Message> {
    let c = client(&state).await?;
    let mut create = fluxer::api::messages::CreateMessage::content(content);
    if let Some(reply_id) = reply_to {
        create = create.reply_to(&channel_id, &reply_id);
    }
    if let Some(ref ids) = sticker_ids {
        create.sticker_ids = ids.clone();
    }
    // Client-supplied nonce for optimistic-send reconciliation: the server
    // echoes it back on the message (and on the gateway MESSAGE_CREATE), so the
    // frontend can match the confirmed message to its pending placeholder.
    if let Some(n) = nonce {
        create.nonce = Some(n);
    }

    // Read each pending attachment's bytes and build a PendingAttachment vec.
    // We attach descriptors to `create` in the same order so the server can
    // match `files[N]` parts to metadata. Files that can't be read are skipped
    // with a logged warning rather than failing the whole send.
    let mut pending: Vec<fluxer::api::messages::PendingAttachment> = Vec::new();
    if let Some(items) = attachments.as_ref() {
        for item in items {
            let bytes = match tokio::fs::read(&item.path).await {
                Ok(b) => b,
                Err(e) => {
                    tracing::warn!(path = %item.path, error = %e, "failed to read attachment; skipping");
                    continue;
                }
            };
            let filename = item
                .filename
                .clone()
                .or_else(|| {
                    std::path::Path::new(&item.path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_else(|| "file".to_string());
            let content_type = infer_mime(&filename, &bytes);
            let file = fluxer::api::messages::PendingAttachment {
                filename: filename.clone(),
                content_type,
                data: bytes,
                description: None,
                spoiler: item.spoiler,
            };
            create = create.with_attachment(&file);
            pending.push(file);
        }
    }

    if pending.is_empty() {
        c.messages().send(&channel_id, &create).await.map_err(Into::into)
    } else {
        c.messages()
            .send_with_attachments(&channel_id, &create, pending)
            .await
            .map_err(Into::into)
    }
}

#[tauri::command]
async fn edit_message(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    message_id: Snowflake,
    content: String,
) -> CmdResult<fluxer::models::Message> {
    let c = client(&state).await?;
    let edit = fluxer::api::messages::EditMessage {
        content: Some(content),
        ..Default::default()
    };
    c.messages().edit(&channel_id, &message_id, &edit)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn delete_message(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    message_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.messages().delete(&channel_id, &message_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn bulk_delete_messages(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    message_ids: Vec<Snowflake>,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.messages().bulk_delete(&channel_id, &message_ids)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn trigger_typing(
    state: State<'_, AppState>,
    channel_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.channels().trigger_typing(&channel_id)
        .await
        .map_err(Into::into)
}

// ---------------------------------------------------------------------------
// Read-state ACK (B.8)
// ---------------------------------------------------------------------------

/// Acknowledge that the user has read up to `message_id` in `channel_id`. The
/// frontend calls this on channel view and on each `MESSAGE_CREATE` in the
/// active channel so the server-side read state (and thus unread/mention
/// badges across devices) stays in sync.
#[tauri::command]
async fn ack_message(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    message_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.channels().ack_message(&channel_id, &message_id)
        .await
        .map_err(Into::into)
}

/// Acknowledge every message in `channel_id` (mark-all-as-read). Used by
/// "mark all as read" flows; for incremental reads prefer `ack_message`.
#[tauri::command]
async fn ack_channel(
    state: State<'_, AppState>,
    channel_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.channels().ack_channel(&channel_id)
        .await
        .map_err(Into::into)
}

// ---------------------------------------------------------------------------
// Threads (D.17)
// ---------------------------------------------------------------------------

#[tauri::command]
async fn start_thread(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    name: String,
    message_id: Option<Snowflake>,
    auto_archive_duration: Option<i32>,
) -> CmdResult<fluxer::models::Channel> {
    let c = client(&state).await?;
    c.channels()
        .start_thread(&channel_id, &name, message_id.as_ref(), auto_archive_duration)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn start_thread_on_message(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    message_id: Snowflake,
    name: String,
    auto_archive_duration: Option<i32>,
) -> CmdResult<fluxer::models::Channel> {
    let c = client(&state).await?;
    c.channels()
        .start_thread_on_message(&channel_id, &message_id, &name, auto_archive_duration)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn list_active_threads(
    state: State<'_, AppState>,
    channel_id: Snowflake,
) -> CmdResult<Vec<fluxer::models::Channel>> {
    let c = client(&state).await?;
    c.channels()
        .list_active_threads(&channel_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn join_thread(
    state: State<'_, AppState>,
    channel_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.channels().join_thread(&channel_id).await.map_err(Into::into)
}

#[tauri::command]
async fn leave_thread(
    state: State<'_, AppState>,
    channel_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.channels().leave_thread(&channel_id).await.map_err(Into::into)
}

// ---------------------------------------------------------------------------
// Search (D.16)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct SearchHitOut {
    message: fluxer::models::Message,
}

#[derive(Serialize)]
struct SearchResponseOut {
    hits: Vec<SearchHitOut>,
    total: Option<i64>,
    /// `true` when the server is still indexing the relevant channels.
    indexing: bool,
}

/// Search messages via `POST /search/messages`. `author_id`/`channel_id`/
/// `guild_id` are snowflakes (or names the frontend resolves); `has` is the
/// content-flag enum (`image`/`video`/`sound`/`file`/`embed`/`link`/...).
#[tauri::command]
async fn search_messages(
    state: State<'_, AppState>,
    query: String,
    author_id: Option<Vec<Snowflake>>,
    channel_id: Option<Vec<Snowflake>>,
    guild_id: Option<Vec<Snowflake>>,
    has: Option<Vec<String>>,
    limit: Option<i32>,
    page: Option<i64>,
) -> CmdResult<SearchResponseOut> {
    let c = client(&state).await?;
    let filters = fluxer::api::search::SearchFilters {
        author_id: author_id.unwrap_or_default(),
        channel_id: channel_id.unwrap_or_default(),
        guild_id: guild_id.unwrap_or_default(),
        has: has.unwrap_or_default(),
        limit,
        page,
    };
    let resp = c.search().search(&query, filters).await?;
    Ok(SearchResponseOut {
        hits: resp
            .hits
            .into_iter()
            .map(|h| SearchHitOut { message: h.message })
            .collect(),
        total: resp.total,
        indexing: resp.indexing,
    })
}

// ---------------------------------------------------------------------------
// GIF search (Klipy provider, proxied via the Fluxer REST API)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct GifOut {
    id: String,
    title: String,
    url: String,
    src: String,
    proxy_src: String,
    width: u32,
    height: u32,
}

impl From<fluxer::api::gifs::Gif> for GifOut {
    fn from(g: fluxer::api::gifs::Gif) -> Self {
        GifOut {
            id: g.id,
            title: g.title,
            url: g.url,
            src: g.src,
            proxy_src: g.proxy_src,
            width: g.width,
            height: g.height,
        }
    }
}

#[tauri::command]
async fn gif_search(
    state: State<'_, AppState>,
    query: String,
    locale: String,
) -> CmdResult<Vec<GifOut>> {
    let c = client(&state).await?;
    let gifs = c.gifs().search(&query, &locale).await?;
    Ok(gifs.into_iter().map(GifOut::from).collect())
}

#[tauri::command]
async fn gif_trending(
    state: State<'_, AppState>,
    locale: String,
) -> CmdResult<Vec<GifOut>> {
    let c = client(&state).await?;
    let featured = c.gifs().trending(&locale).await?;
    Ok(featured.gifs.into_iter().map(GifOut::from).collect())
}

// ---------------------------------------------------------------------------
// Guild roles + audit log + webhooks
// ---------------------------------------------------------------------------

#[tauri::command]
async fn list_guild_roles(
    state: State<'_, AppState>,
    guild_id: Snowflake,
) -> CmdResult<Vec<fluxer::models::Role>> {
    let c = client(&state).await?;
    c.guilds().roles(&guild_id).await.map_err(Into::into)
}

#[tauri::command]
async fn create_guild_role(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    name: String,
    color: Option<i64>,
    permissions: Option<String>,
) -> CmdResult<fluxer::models::Role> {
    let c = client(&state).await?;
    c.guilds()
        .create_role(&guild_id, &name, color, permissions.as_deref())
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn update_guild_role(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    role_id: Snowflake,
    name: Option<String>,
    color: Option<i64>,
    permissions: Option<String>,
    hoist: Option<bool>,
    mentionable: Option<bool>,
) -> CmdResult<fluxer::models::Role> {
    let c = client(&state).await?;
    c.guilds()
        .update_role(
            &guild_id,
            &role_id,
            name.as_deref(),
            color,
            permissions.as_deref(),
            hoist,
            mentionable,
        )
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn delete_guild_role(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    role_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.guilds()
        .delete_role(&guild_id, &role_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn add_member_role(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    user_id: Snowflake,
    role_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.guilds()
        .add_member_role(&guild_id, &user_id, &role_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn remove_member_role(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    user_id: Snowflake,
    role_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.guilds()
        .remove_member_role(&guild_id, &user_id, &role_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn guild_audit_log(
    state: State<'_, AppState>,
    guild_id: Snowflake,
) -> CmdResult<serde_json::Value> {
    let c = client(&state).await?;
    c.guilds().audit_log(&guild_id).await.map_err(Into::into)
}

#[tauri::command]
async fn list_channel_webhooks(
    state: State<'_, AppState>,
    channel_id: Snowflake,
) -> CmdResult<Vec<serde_json::Value>> {
    let c = client(&state).await?;
    c.channels().webhooks(&channel_id).await.map_err(Into::into)
}

#[tauri::command]
async fn create_guild_emoji(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    name: String,
    image: String,
) -> CmdResult<fluxer::models::Emoji> {
    let c = client(&state).await?;
    c.guilds()
        .create_emoji(&guild_id, &name, &image)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn update_guild_emoji(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    emoji_id: Snowflake,
    name: String,
) -> CmdResult<fluxer::models::Emoji> {
    let c = client(&state).await?;
    c.guilds()
        .update_emoji(&guild_id, &emoji_id, &name)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn delete_guild_emoji(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    emoji_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.guilds()
        .delete_emoji(&guild_id, &emoji_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn premium_state(state: State<'_, AppState>) -> CmdResult<serde_json::Value> {
    let c = client(&state).await?;
    c.users().premium_state().await.map_err(Into::into)
}

#[tauri::command]
async fn save_theme(state: State<'_, AppState>, css: String) -> CmdResult<serde_json::Value> {
    let c = client(&state).await?;
    c.users().save_theme(&css).await.map_err(Into::into)
}

#[tauri::command]
async fn report_message(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    message_id: Snowflake,
    category: String,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.reports()
        .message(&channel_id, &message_id, &category)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn report_user(
    state: State<'_, AppState>,
    user_id: Snowflake,
    category: String,
    guild_id: Option<Snowflake>,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.reports()
        .user(&user_id, &category, guild_id.as_ref())
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn report_guild(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    category: String,
    invite_code: Option<String>,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.reports()
        .guild(&guild_id, &category, invite_code.as_deref())
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn create_guild_sticker(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    name: String,
    description: Option<String>,
    tags: Vec<String>,
    image: String,
) -> CmdResult<fluxer::models::Sticker> {
    let c = client(&state).await?;
    c.guilds()
        .create_sticker(&guild_id, &name, description.as_deref(), &tags, &image)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn update_guild_sticker(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    sticker_id: Snowflake,
    name: Option<String>,
    description: Option<String>,
    tags: Option<Vec<String>>,
) -> CmdResult<fluxer::models::Sticker> {
    let c = client(&state).await?;
    c.guilds()
        .update_sticker(
            &guild_id,
            &sticker_id,
            name.as_deref(),
            description.as_deref(),
            tags.as_deref(),
        )
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn delete_guild_sticker(
    state: State<'_, AppState>,
    guild_id: Snowflake,
    sticker_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.guilds()
        .delete_sticker(&guild_id, &sticker_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn create_channel_webhook(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    name: String,
    avatar: Option<String>,
) -> CmdResult<serde_json::Value> {
    let c = client(&state).await?;
    c.channels()
        .create_webhook(&channel_id, &name, avatar.as_deref())
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn update_webhook(
    state: State<'_, AppState>,
    webhook_id: Snowflake,
    name: Option<String>,
    avatar: Option<String>,
    channel_id: Option<Snowflake>,
) -> CmdResult<serde_json::Value> {
    let c = client(&state).await?;
    c.channels()
        .update_webhook(&webhook_id, name.as_deref(), avatar.as_deref(), channel_id.as_ref())
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn delete_webhook(
    state: State<'_, AppState>,
    webhook_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.channels()
        .delete_webhook(&webhook_id)
        .await
        .map_err(Into::into)
}

// ---------------------------------------------------------------------------
// Discovery (public community browser)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct DiscoveryGuildOut {
    id: String,
    name: String,
    description: Option<String>,
    icon: Option<String>,
    banner: Option<String>,
    approximate_member_count: Option<i64>,
    approximate_presence_count: Option<i64>,
}

impl From<fluxer::api::discovery::DiscoveryGuild> for DiscoveryGuildOut {
    fn from(g: fluxer::api::discovery::DiscoveryGuild) -> Self {
        DiscoveryGuildOut {
            id: g.id,
            name: g.name,
            description: g.description,
            icon: g.icon,
            banner: g.banner,
            approximate_member_count: g.approximate_member_count,
            approximate_presence_count: g.approximate_presence_count,
        }
    }
}

#[tauri::command]
async fn discovery_guilds(
    state: State<'_, AppState>,
    category: Option<String>,
    query: Option<String>,
) -> CmdResult<Vec<DiscoveryGuildOut>> {
    let c = client(&state).await?;
    let guilds = c.discovery().guilds(category.as_deref(), query.as_deref()).await?;
    Ok(guilds.into_iter().map(DiscoveryGuildOut::from).collect())
}

#[tauri::command]
async fn discovery_categories(
    state: State<'_, AppState>,
) -> CmdResult<Vec<fluxer::api::discovery::DiscoveryCategory>> {
    let c = client(&state).await?;
    c.discovery().categories().await.map_err(Into::into)
}

#[tauri::command]
async fn discovery_join(
    state: State<'_, AppState>,
    guild_id: String,
) -> CmdResult<serde_json::Value> {
    let c = client(&state).await?;
    c.discovery().join(&guild_id).await.map_err(Into::into)
}

// ---------------------------------------------------------------------------
// Read state (D.18)
// ---------------------------------------------------------------------------

#[tauri::command]
async fn list_read_state(
    state: State<'_, AppState>,
) -> CmdResult<Vec<fluxer::models::ReadState>> {
    let c = client(&state).await?;
    c.users().read_state().await.map_err(Into::into)
}

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

#[tauri::command]
async fn list_pins(
    state: State<'_, AppState>,
    channel_id: Snowflake,
) -> CmdResult<Vec<fluxer::models::Message>> {
    let c = client(&state).await?;
    c.channels().pinned_messages(&channel_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn pin_message(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    message_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.channels().pin(&channel_id, &message_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn unpin_message(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    message_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.channels().unpin(&channel_id, &message_id)
        .await
        .map_err(Into::into)
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

#[tauri::command]
async fn add_reaction(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    message_id: Snowflake,
    emoji: String,
    custom_emoji_id: Option<Snowflake>,
) -> CmdResult<()> {
    let c = client(&state).await?;
    let target = match custom_emoji_id {
        Some(id) => ReactionTarget::Custom {
            name: emoji.clone(),
            id,
        },
        None => ReactionTarget::Unicode(emoji),
    };
    c.reactions().add(&channel_id, &message_id, &target)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn remove_own_reaction(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    message_id: Snowflake,
    emoji: String,
    custom_emoji_id: Option<Snowflake>,
) -> CmdResult<()> {
    let c = client(&state).await?;
    let target = match custom_emoji_id {
        Some(id) => ReactionTarget::Custom {
            name: emoji.clone(),
            id,
        },
        None => ReactionTarget::Unicode(emoji),
    };
    c.reactions()
        .remove_own(&channel_id, &message_id, &target)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn remove_reaction_for(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    message_id: Snowflake,
    emoji: String,
    custom_emoji_id: Option<Snowflake>,
    target_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    let target = match custom_emoji_id {
        Some(id) => ReactionTarget::Custom {
            name: emoji.clone(),
            id,
        },
        None => ReactionTarget::Unicode(emoji),
    };
    c.reactions()
        .remove_for(&channel_id, &message_id, &target, &target_id)
        .await
        .map_err(Into::into)
}

// ---------------------------------------------------------------------------
// DM / relationship commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn open_dm(
    state: State<'_, AppState>,
    user_id: Snowflake,
) -> CmdResult<fluxer::models::Channel> {
    let c = client(&state).await?;
    c.users().create_dm(&user_id).await.map_err(Into::into)
}

#[tauri::command]
async fn create_group_dm(
    state: State<'_, AppState>,
    recipients: Vec<Snowflake>,
) -> CmdResult<fluxer::models::Channel> {
    let c = client(&state).await?;
    c.users().create_group_dm(&recipients)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn list_relationships(
    state: State<'_, AppState>,
) -> CmdResult<Vec<fluxer::models::Relationship>> {
    let c = client(&state).await?;
    c.users().relationships().await.map_err(Into::into)
}

#[tauri::command]
async fn send_friend_request(
    state: State<'_, AppState>,
    user_id: String,
) -> CmdResult<fluxer::models::Relationship> {
    let c = client(&state).await?;
    c.users().send_friend_request(&user_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn remove_relationship(
    state: State<'_, AppState>,
    user_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.users().remove_relationship(&user_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn get_user(
    state: State<'_, AppState>,
    user_id: Snowflake,
) -> CmdResult<fluxer::models::User> {
    let c = client(&state).await?;
    c.users().get(&user_id).await.map_err(Into::into)
}

#[tauri::command]
async fn get_channel(
    state: State<'_, AppState>,
    channel_id: Snowflake,
) -> CmdResult<fluxer::models::Channel> {
    let c = client(&state).await?;
    c.channels().get(&channel_id).await.map_err(Into::into)
}

#[tauri::command]
async fn delete_channel(
    state: State<'_, AppState>,
    channel_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.channels().delete(&channel_id).await.map_err(Into::into)
}

#[tauri::command]
async fn add_recipient(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    user_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.channels().add_recipient(&channel_id, &user_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
async fn remove_recipient(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    user_id: Snowflake,
) -> CmdResult<()> {
    let c = client(&state).await?;
    c.channels().remove_recipient(&channel_id, &user_id)
        .await
        .map_err(Into::into)
}

/// Mark that we've loaded messages for a channel (so we don't refetch on
/// navigation). The frontend calls this once per channel.
#[tauri::command]
fn mark_channel_loaded(state: State<'_, AppState>, channel_id: Snowflake) {
    state
        .loaded_channels
        .lock()
        .unwrap()
        .insert(channel_id);
}

// ---------------------------------------------------------------------------
// Image proxy + attachments
// ---------------------------------------------------------------------------

/// Proxy a remote image through Tauri so we can cache it and avoid CORS. The
/// frontend calls this via the `tauri://localhost/image_proxy` custom URI or
/// via an invoke; here we expose it as a command returning base64 data. For
/// `<img>` tags we instead use the `asset:` protocol registered in tauri.conf.
#[tauri::command]
async fn image_proxy(
    state: State<'_, AppState>,
    url: String,
) -> CmdResult<Option<String>> {
    image::proxy(&state, &url).await.map_err(Into::into)
}

/// Resolve a remote media URL to a cached `asset://` URL (preferred over
/// `image_proxy`'s base64 for `<img>`/`<video>`/`<a download>`). Backed by the
/// on-disk temp cache: a hit returns instantly, a miss fetches once + caches
/// for the session (and across restarts). Returns `None` when the cache dir is
/// unavailable or the upstream fetch fails.
#[tauri::command]
async fn image_proxy_asset(url: String) -> CmdResult<Option<String>> {
    image::proxy_asset(&url).await.map_err(Into::into)
}

/// Upload an attachment to the instance's media endpoint and return the raw
/// JSON descriptor the server produces (typically an attachment object with an
/// `id` + `url` that can later be referenced from a message's `attachments`
/// field). The frontend passes a local file path; we read the bytes, infer a
/// content type, and POST them as a single `files[0]` multipart part.
///
/// Endpoint resolution (drives the URL via discovery, matching A.2):
///   1. Use the cached `endpoints.media` base from `AppState` when present.
///   2. Otherwise fall back to the client's REST base (`Http::base_url`) —
///      i.e. `POST {api_base}/channels/{cid}/messages` with a `files[0]` part.
///      This is the legacy Discord-style "upload-then-send" path; if the
///      instance advertises a separate media endpoint, that is preferred.
///
/// Returns the raw JSON so the frontend can inspect the shape without us
/// guessing it.
#[tauri::command]
async fn upload_attachment(
    state: State<'_, AppState>,
    channel_id: Snowflake,
    file_path: String,
) -> CmdResult<serde_json::Value> {
    let c = client(&state).await?;
    // Read the file bytes. A missing/unreadable file is a user error, not a
    // transport error, so map it to an ApiError instead of bubbling up an io.
    let bytes = tokio::fs::read(&file_path).await.map_err(|e| ApiError {
        message: format!("failed to read attachment {}: {}", file_path, e),
        code: "FILE_READ".into(),
        status: 0,
    })?;
    let filename = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "file".to_string());
    let content_type = infer_mime(&filename, &bytes);

    // Build the multipart body: a single `files[0]` file part.
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.clone())
        .mime_str(&content_type)
        .map_err(|e| ApiError {
            message: e.to_string(),
            code: "MULTIPART".into(),
            status: 0,
        })?;
    let form = reqwest::multipart::Form::new().part("files[0]", part);

    // Route to the media endpoint when the instance advertises one; otherwise
    // fall back to the REST base. The media path is media-host-relative (no
    // `/v1` prefix); the REST fallback uses the full `/channels/{cid}/messages`
    // path against the API base.
    let media_base = state
        .endpoints
        .lock()
        .await
        .as_ref()
        .and_then(|e| e.media.clone())
        .map(|s| s.trim_end_matches('/').to_string());

    let builder = if let Some(base) = media_base {
        let url = format!("{}/channels/{}/messages", base, channel_id);
        // The Http transport's `request` helper composes against its own base
        // URL, so for an absolute URL we go straight to the reqwest client with
        // the auth headers attached.
        let auth = c.http().auth_token().header_value().to_string();
        c.http()
            .client()
            .request(reqwest::Method::POST, &url)
            .header("Authorization", auth)
            .header(
                "User-Agent",
                concat!("fluxer-rust/", env!("CARGO_PKG_VERSION")),
            )
            .multipart(form)
    } else {
        let path = format!("channels/{}/messages", channel_id);
        c.http().request(reqwest::Method::POST, &path).multipart(form)
    };

    let path_for_key = format!("channels/{}/messages", channel_id);
    c.http()
        .execute::<serde_json::Value>(reqwest::Method::POST, &path_for_key, builder)
        .await
        .map_err(Into::into)
}

/// Infer a MIME type for an attachment from its filename extension, with a
/// sniff on the leading bytes for common image types when the extension is
/// unknown. Falls back to `application/octet-stream`.
fn infer_mime(filename: &str, bytes: &[u8]) -> String {
    let ext = std::path::Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "png" => return "image/png".into(),
        "jpg" | "jpeg" => return "image/jpeg".into(),
        "gif" => return "image/gif".into(),
        "webp" => return "image/webp".into(),
        "svg" => return "image/svg+xml".into(),
        "bmp" => return "image/bmp".into(),
        "mp4" => return "video/mp4".into(),
        "webm" => return "video/webm".into(),
        "mov" => return "video/quicktime".into(),
        "mp3" => return "audio/mpeg".into(),
        "ogg" => return "audio/ogg".into(),
        "wav" => return "audio/wav".into(),
        "flac" => return "audio/flac".into(),
        "pdf" => return "application/pdf".into(),
        "txt" => return "text/plain".into(),
        "json" => return "application/json".into(),
        "zip" => return "application/zip".into(),
        "gz" | "gzip" => return "application/gzip".into(),
        "tar" => return "application/x-tar".into(),
        "html" | "htm" => return "text/html".into(),
        "css" => return "text/css".into(),
        "js" => return "text/javascript".into(),
        "ts" => return "text/typescript".into(),
        _ => {}
    }
    // Sniff magic bytes for common image formats when the extension didn't match.
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return "image/png".into();
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return "image/jpeg".into();
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return "image/gif".into();
    }
    if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return "image/webp".into();
    }
    if bytes.starts_with(b"%PDF") {
        return "application/pdf".into();
    }
    "application/octet-stream".into()
}

/// Resolve media/static CDN endpoints for the configured instance. Called once
/// after login so the frontend can build image URLs.
#[tauri::command]
async fn resolve_endpoints(state: State<'_, AppState>) -> CmdResult<Option<Endpoints>> {
    // Prefer the cached endpoints from login; re-resolve from the client's
    // base URL as a fallback (handles cases where login didn't run discovery).
    {
        let slot = state.endpoints.lock().await;
        if slot.is_some() {
            return Ok(slot.clone());
        }
    }
    let c = client(&state).await?;
    Ok(image::resolve_endpoints(&c).await)
}

/// Emit a gateway event to the frontend. Called by the gateway task.
pub fn emit_gateway_event(app: &AppHandle, name: &str, data: serde_json::Value) {
    let _ = app.emit("gateway", GatewayEventPayload { name: name.to_string(), data });
}

// ---------------------------------------------------------------------------
// Native plugin setup (D.22)
// ---------------------------------------------------------------------------

/// Register global shortcuts for push-to-talk + mute/deafen. The shortcuts
/// emit `global-shortcut` Tauri events the frontend voice store reacts to.
/// PTT uses Ctrl+` / Cmd+` (backtick); mute uses Ctrl+Shift+M; deafen uses
/// Ctrl+Shift+D. These are configurable in a future keybinds editor.
fn setup_global_shortcuts(app: &tauri::AppHandle) -> std::result::Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{
        Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
    };
    let manager = app.global_shortcut();
    let ptt = Shortcut::new(Some(Modifiers::CONTROL), Code::Backquote);
    let mute = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyM);
    let deafen = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyD);

    // Build the shortcut list with the handler. The handler inspects which
    // shortcut fired by comparing its string form.
    let shortcuts = vec![ptt.clone(), mute.clone(), deafen.clone()];
    let app_handle = app.clone();
    let handler = move |_app: &tauri::AppHandle, sc: &Shortcut, event: tauri_plugin_global_shortcut::ShortcutEvent| {
        let name = if sc == &ptt {
            "ptt"
        } else if sc == &mute {
            "mute"
        } else if sc == &deafen {
            "deafen"
        } else {
            return;
        };
        let state = match event.state {
            ShortcutState::Pressed => "pressed",
            ShortcutState::Released => "released",
        };
        let _ = app_handle.emit("global-shortcut", serde_json::json!({ "name": name, "state": state }));
    };

    if let Err(e) = manager.on_shortcuts(shortcuts, handler) {
        tracing::warn!(error = %e, "failed to register global shortcuts");
    }
    Ok(())
}

/// Wire the deep-link handler: when the app is opened via `fluxer://...`,
/// emit the URL to the frontend as a `deep-link` event. The frontend parses
/// invite URLs (`fluxer://invite/<code>`) and opens the join modal.
fn setup_deep_link_handler(app: &tauri::AppHandle) {
    use tauri_plugin_deep_link::DeepLinkExt;
    let app_handle = app.clone();
    // `on_open_url` fires when the OS hands us a URL while the app is running.
    // We re-emit it so the React layer can react (it has the join-flow UI).
    let _ = app.deep_link().on_open_url(move |event| {
        for u in event.urls() {
            let _ = app_handle.emit("deep-link", serde_json::json!({ "url": u.as_str() }));
        }
    });
}
