//! Local reverse proxy that lets the reference web client (running in the Tauri
//! webview at the `tauri://localhost` origin) reach the Fluxer backend.
//!
//! The Fluxer API only emits `Access-Control-Allow-Origin` for its own web
//! origin (`https://web.fluxer.app`), so a direct cross-origin fetch from the
//! webview is blocked by CORS. We sidestep this by serving a tiny HTTP server
//! on `127.0.0.1:<port>` that:
//!
//!   * forwards `*` REST requests to the public Fluxer API
//!     (`https://api.fluxer.app`, which performs no Origin allowlist check)
//!     server-side — no browser CORS involved — and returns a permissive
//!     `Access-Control-Allow-Origin: *` so the webview is satisfied;
//!   * bridges the `/__gateway` WebSocket to `wss://gateway.fluxer.app`.
//!
//! The bound port is returned to the caller so the bootstrap object injected
//! into the webview can point `api`/`gateway` at this local server.

use std::net::SocketAddr;

use axum::{
    body::Body,
    extract::{
        ws::{Message as AxumMessage, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{HeaderMap, HeaderName, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{any, get},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message as TungMessage;

/// Upstream Fluxer endpoints the proxy targets.
///
/// We forward to the official **web** API origin (`https://web.fluxer.app`) and
/// present `Origin: https://web.fluxer.app` so the request is accepted by the
/// origin-allowlisted web API exactly as the real web client would be. This
/// lets the reference client keep its official endpoint values (so the UI shows
/// `fluxer.app`, not a loopback address) while the bytes transparently flow
/// through this proxy — sidestepping the webview's cross-origin CORS block.
const UPSTREAM_ORIGIN: &str = "https://web.fluxer.app";
const UPSTREAM_GATEWAY: &str = "wss://gateway.fluxer.app";

#[derive(Clone)]
struct ProxyState {
    client: reqwest::Client,
}

/// Start the proxy on an ephemeral loopback port. Returns the chosen port.
pub async fn start() -> std::io::Result<u16> {
    let client = reqwest::Client::builder()
        // Don't follow redirects automatically — pass them through so the
        // client sees the same behavior as talking to the API directly.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let state = ProxyState { client };

    let app = Router::new()
        .route("/__gateway", get(gateway_ws))
        .route("/__cap/v", get(capture_video_ws))
        .route("/__cap/a", get(capture_audio_ws))
        .fallback(any(proxy_rest))
        .with_state(state);

    // Bind to an OS-assigned port on loopback.
    let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).await?;
    let port = listener.local_addr()?.port();

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!("proxy server exited: {e}");
        }
    });

    tracing::info!("local API proxy listening on 127.0.0.1:{port}");
    Ok(port)
}

/// Forward any non-gateway request to the public Fluxer API server-side.
async fn proxy_rest(
    State(state): State<ProxyState>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Body,
) -> Response {
    // Short-circuit CORS preflight: the webview will send OPTIONS for
    // non-simple requests. We answer locally with a permissive policy.
    if method == Method::OPTIONS {
        return cors_preflight_response();
    }

    let path_and_query = uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or(uri.path());
    // Determine the upstream target. Two routing modes:
    //
    //   * `/__up/<url-encoded-origin>/<path>?<query>` — an absolute off-origin
    //     request (e.g. a presigned upload to `uploads.fluxer.app`) that the
    //     client host-preserves so we forward to the ORIGINAL host, not the
    //     API. The origin also becomes the Origin/Referer we present so any
    //     host-bound presigned signature validates.
    //   * anything else — a plain API path (`/api/v1/...`); forward onto the
    //     official web origin, presenting the web origin as Origin/Referer.
    let (target, upstream_origin) = match parse_host_preserving_route(path_and_query) {
        Some((origin, rest)) => (format!("{origin}{rest}"), origin),
        None => (
            format!("{UPSTREAM_ORIGIN}{path_and_query}"),
            UPSTREAM_ORIGIN.to_string(),
        ),
    };

    let body_bytes = match axum::body::to_bytes(body, usize::MAX).await {
        Ok(b) => b,
        Err(e) => {
            tracing::warn!("failed to read proxied request body: {e}");
            return (StatusCode::BAD_REQUEST, "bad body").into_response();
        }
    };

    let mut req = state.client.request(method.clone(), &target);
    // Copy request headers except hop-by-hop / host / origin / referer (we set
    // our own Origin + Referer below to satisfy the web API's allowlist).
    for (name, value) in headers.iter() {
        if is_skipped_request_header(name) {
            continue;
        }
        req = req.header(name, value);
    }
    // Present the resolved upstream origin so the origin-allowlisted API (or a
    // host-bound presigned URL) accepts us exactly like the real web client.
    req = req.header("Origin", &upstream_origin);
    req = req.header("Referer", format!("{upstream_origin}/"));
    if !body_bytes.is_empty() {
        req = req.body(body_bytes.to_vec());
    }

    let upstream = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("upstream request failed ({target}): {e}");
            return (StatusCode::BAD_GATEWAY, "upstream error").into_response();
        }
    };

    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();

    // Copy the upstream response headers we're allowed to pass back, plus the
    // permissive CORS headers the webview needs. Built up-front so it's shared
    // by both the streaming (success) and buffered (error) paths below.
    let mut builder = Response::builder().status(status);
    for (name, value) in upstream_headers.iter() {
        if is_skipped_response_header(name) {
            continue;
        }
        builder = builder.header(name, value);
    }
    // Make the webview happy regardless of upstream CORS policy.
    builder = builder.header("Access-Control-Allow-Origin", "*");
    builder = builder.header("Access-Control-Expose-Headers", "*");

    // Error responses: buffer the body so we can log a diagnostic snippet — a
    // bare status in the devtools network tab hides the API's error payload
    // (which says WHY: missing permission, bad origin, WAF page, ...). These
    // are rare, so buffering them costs nothing on the hot path.
    if status.is_client_error() || status.is_server_error() {
        let resp_bytes = match upstream.bytes().await {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!("failed reading upstream body: {e}");
                return (StatusCode::BAD_GATEWAY, "upstream body error").into_response();
            }
        };
        let snippet: String = String::from_utf8_lossy(&resp_bytes).chars().take(400).collect();
        tracing::warn!("upstream {} {} -> {}: {}", method, target, status, snippet);
        return builder
            .body(Body::from(resp_bytes))
            .unwrap_or_else(|_| (StatusCode::INTERNAL_SERVER_ERROR, "build error").into_response());
    }

    // Success (2xx/3xx) — the hot path for all media/message loads. Stream the
    // upstream body straight through instead of buffering it: bytes flow to the
    // webview as they arrive (faster first paint) with memory bounded to the
    // in-flight chunks rather than the full file size. reqwest has already
    // transparently decompressed the body (gzip/brotli), which is why we strip
    // the now-inaccurate content-encoding/content-length upstream headers in
    // is_skipped_response_header.
    builder
        .body(Body::from_stream(upstream.bytes_stream()))
        .unwrap_or_else(|_| (StatusCode::INTERNAL_SERVER_ERROR, "build error").into_response())
}

/// Decode a host-preserving proxy route of the form
/// `/__up/<url-encoded-origin>/<path>?<query>`.
///
/// Returns `(origin, "<path>?<query>")` where `origin` is the decoded target
/// scheme+host (e.g. `https://uploads.fluxer.app`) and the remainder is the
/// original path + query with a leading slash, ready to append to the origin.
/// Returns `None` for any path that isn't a `/__up/` route.
///
/// Only `http`/`https` origins are accepted, so a crafted prefix can't redirect
/// the proxy at an arbitrary scheme.
fn parse_host_preserving_route(path_and_query: &str) -> Option<(String, String)> {
    const PREFIX: &str = "/__up/";
    let rest = path_and_query.strip_prefix(PREFIX)?;
    // Split the encoded origin (first path segment) from the remaining path.
    // The remainder keeps its leading slash; if the origin is the whole path
    // (no trailing slash) we treat the path as "/".
    let (encoded_origin, suffix) = match rest.find('/') {
        Some(idx) => (&rest[..idx], &rest[idx..]),
        None => (rest, "/"),
    };
    let origin = percent_decode(encoded_origin);
    if !(origin.starts_with("https://") || origin.starts_with("http://")) {
        return None;
    }
    // Reject a decoded origin that smuggles in a path/query of its own — it must
    // be scheme + authority only (no slash after the host, no `?`/`#`).
    let after_scheme = origin.split("://").nth(1).unwrap_or("");
    if after_scheme.is_empty() || after_scheme.contains(['/', '?', '#']) {
        return None;
    }
    Some((origin, suffix.to_string()))
}

/// Minimal percent-decoder for the single url-encoded origin segment. Decodes
/// `%XX` byte escapes; leaves other characters untouched.
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push((hi * 16 + lo) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn cors_preflight_response() -> Response {
    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header("Access-Control-Allow-Origin", "*")
        .header(
            "Access-Control-Allow-Methods",
            "GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS",
        )
        .header("Access-Control-Allow-Headers", "*")
        .header("Access-Control-Max-Age", "86400")
        .body(Body::empty())
        .unwrap()
}

/// Request headers we must not forward upstream.
fn is_skipped_request_header(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "host"
            | "origin"
            | "referer"
            | "connection"
            | "content-length"
            | "accept-encoding"
            | "sec-fetch-site"
            | "sec-fetch-mode"
            | "sec-fetch-dest"
    )
}

/// Response headers we must not pass back to the webview (hop-by-hop or ones we
/// override).
fn is_skipped_response_header(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "connection"
            | "transfer-encoding"
            | "content-encoding"
            | "content-length"
            | "access-control-allow-origin"
            | "access-control-allow-credentials"
            | "access-control-expose-headers"
    )
}

/// Bridge a webview WebSocket to the upstream Fluxer gateway. Query string
/// (e.g. `?v=1&encoding=json&compress=zstd-stream&stream=1`) is forwarded.
async fn gateway_ws(ws: WebSocketUpgrade, uri: Uri) -> Response {
    let query = uri.query().map(|q| format!("?{q}")).unwrap_or_default();
    let upstream_url = format!("{UPSTREAM_GATEWAY}/{query}");
    ws.on_upgrade(move |socket| bridge_gateway(socket, upstream_url))
}

async fn bridge_gateway(mut client_ws: WebSocket, upstream_url: String) {
    let (upstream, _resp) = match tokio_tungstenite::connect_async(&upstream_url).await {
        Ok(pair) => pair,
        Err(e) => {
            tracing::warn!("gateway upstream connect failed ({upstream_url}): {e}");
            let _ = client_ws.send(AxumMessage::Close(None)).await;
            return;
        }
    };
    let (mut up_tx, mut up_rx) = upstream.split();

    loop {
        tokio::select! {
            // webview -> upstream
            client_msg = client_ws.recv() => {
                match client_msg {
                    Some(Ok(msg)) => {
                        let forwarded = match msg {
                            AxumMessage::Text(t) => TungMessage::Text(t.into()),
                            AxumMessage::Binary(b) => TungMessage::Binary(b.into()),
                            AxumMessage::Ping(p) => TungMessage::Ping(p.into()),
                            AxumMessage::Pong(p) => TungMessage::Pong(p.into()),
                            AxumMessage::Close(_) => { let _ = up_tx.send(TungMessage::Close(None)).await; break; }
                        };
                        if up_tx.send(forwarded).await.is_err() { break; }
                    }
                    _ => break,
                }
            }
            // upstream -> webview
            up_msg = up_rx.next() => {
                match up_msg {
                    Some(Ok(msg)) => {
                        let forwarded = match msg {
                            TungMessage::Text(t) => AxumMessage::Text(t.to_string()),
                            TungMessage::Binary(b) => AxumMessage::Binary(b.to_vec()),
                            TungMessage::Ping(p) => AxumMessage::Ping(p.to_vec()),
                            TungMessage::Pong(p) => AxumMessage::Pong(p.to_vec()),
                            TungMessage::Close(_) => { let _ = client_ws.send(AxumMessage::Close(None)).await; break; }
                            TungMessage::Frame(_) => continue,
                        };
                        if client_ws.send(forwarded).await.is_err() { break; }
                    }
                    _ => break,
                }
            }
        }
    }
    tracing::debug!("gateway bridge closed");
}

/// Stream native-capture VIDEO frames (from `crate::capture`) to the webview.
/// Each binary message is one encoded frame (JPEG, or raw RGBA + 12-byte header
/// as a fallback) that the frontend draws to a canvas → captureStream().
async fn capture_video_ws(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(stream_capture_video)
}

async fn stream_capture_video(mut socket: WebSocket) {
    let mut rx = match crate::capture::subscribe_video() {
        Some(rx) => rx,
        None => {
            let _ = socket.send(AxumMessage::Close(None)).await;
            return;
        }
    };
    loop {
        let mut frame = match rx.recv().await {
            Ok(frame) => frame,
            // Fell behind — skip dropped frames and keep going (video is
            // latest-frame-wins, stale frames aren't worth resending).
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
        };
        // Latest-frame-wins: drain anything that queued while the previous
        // send was in flight and forward only the newest frame. Without this
        // a consumer that reads slower than capture produces builds an
        // unbounded TCP backlog — video arrives seconds late instead of
        // degrading to a lower fps.
        loop {
            match rx.try_recv() {
                Ok(newer) => frame = newer,
                Err(tokio::sync::broadcast::error::TryRecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
        if socket
            .send(AxumMessage::Binary(frame.as_ref().clone()))
            .await
            .is_err()
        {
            break;
        }
    }
}

/// Stream native-capture AUDIO to the webview. The first message is a JSON
/// header (`{"sampleRate":N,"channels":M}`); subsequent binary messages are
/// interleaved 32-bit-float LE PCM chunks the frontend feeds to an AudioWorklet.
async fn capture_audio_ws(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(stream_capture_audio)
}

async fn stream_capture_audio(mut socket: WebSocket) {
    let (format, mut rx) = match crate::capture::subscribe_audio() {
        Some(pair) => pair,
        None => {
            let _ = socket.send(AxumMessage::Close(None)).await;
            return;
        }
    };
    let header = format!(
        "{{\"sampleRate\":{},\"channels\":{}}}",
        format.sample_rate, format.channels
    );
    if socket.send(AxumMessage::Text(header)).await.is_err() {
        return;
    }
    loop {
        match rx.recv().await {
            Ok(chunk) => {
                if socket
                    .send(AxumMessage::Binary(chunk.as_ref().clone()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
        }
    }
}

/// The upstream well-known document URL that inlines the canonical
/// `window.__FLUXER_BOOTSTRAP__` object.
#[allow(dead_code)]
const WELL_KNOWN_URL: &str = "https://web.fluxer.app/.well-known/fluxer";

/// Fetch the canonical bootstrap object from the upstream well-known document
/// and return it as a JSON string. Extracts the `window.__FLUXER_BOOTSTRAP__`
/// assignment via brace-matching.
#[allow(dead_code)]
pub async fn fetch_bootstrap_template() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;
    let html = client
        .get(WELL_KNOWN_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    extract_bootstrap_object(&html).ok_or_else(|| "bootstrap object not found in well-known".into())
}

/// Brace-match the JSON object following `window.__FLUXER_BOOTSTRAP__=`.
#[allow(dead_code)]
fn extract_bootstrap_object(html: &str) -> Option<String> {
    let marker = "window.__FLUXER_BOOTSTRAP__";
    let start = html.find(marker)?;
    let brace_start = html[start..].find('{')? + start;
    let bytes = html.as_bytes();
    let mut depth = 0i32;
    let mut in_str = false;
    let mut esc = false;
    let mut end = None;
    for i in brace_start..bytes.len() {
        let c = bytes[i] as char;
        if in_str {
            if esc {
                esc = false;
            } else if c == '\\' {
                esc = true;
            } else if c == '"' {
                in_str = false;
            }
            continue;
        }
        match c {
            '"' => in_str = true,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    end = Some(i + 1);
                    break;
                }
            }
            _ => {}
        }
    }
    end.map(|e| html[brace_start..e].to_string())
}

/// Build the JS that the webview runs before any app script. It sets:
///
///   * `window.__FLUXER_PROXY__` — the loopback proxy base + gateway URL, read
///     by the (patched) reference transport to redirect its bytes through this
///     proxy while keeping official endpoint values in the UI;
///   * `window.__FLUXER_BOOTSTRAP__` — the canonical bootstrap object with its
///     **official** endpoints left intact.
///
/// `template` is the upstream bootstrap object (fetched from the well-known
/// doc). The official endpoints are preserved verbatim so the client behaves
/// exactly like the real web client (instance shows as `fluxer.app`).
pub fn build_init_script(template: &str, port: u16) -> String {
    let proxy_base = format!("http://127.0.0.1:{port}");
    let gateway = format!("ws://127.0.0.1:{port}/__gateway");
    let proxy_obj = serde_json::json!({
        "base": proxy_base,
        "gateway": gateway,
    });
    // Normalize the bootstrap JSON (or pass through if it doesn't parse), and
    // force the product branding to "Ruxer" so every UI surface that reads
    // PRODUCT_NAME (ProductConstants.getBootstrapProductName →
    // instance.app_public.branding.product_name) renders the rebranded name.
    let bootstrap = serde_json::from_str::<serde_json::Value>(template)
        .map(|mut v| {
            if let Some(branding) = v
                .get_mut("instance")
                .and_then(|i| i.get_mut("app_public"))
                .and_then(|a| a.get_mut("branding"))
                .and_then(|b| b.as_object_mut())
            {
                branding.insert(
                    "product_name".to_string(),
                    serde_json::Value::String("Ruxer".to_string()),
                );
            }
            v.to_string()
        })
        .unwrap_or_else(|_| template.to_string());
    format!(
        "window.__FLUXER_PROXY__={};window.__FLUXER_BOOTSTRAP__={};",
        proxy_obj, bootstrap
    )
}
