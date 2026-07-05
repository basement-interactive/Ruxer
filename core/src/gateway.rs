//! A minimal Fluxer gateway (WebSocket) client.
//!
//! Fluxer's gateway follows the same opcode model as Discord's gateway: clients
//! receive opcode `10` HELLO with a heartbeat interval, send opcode `2` IDENTIFY
//! with their token, acknowledge opcode `1` HEARTBEAT requests with opcode `11`,
//! and receive opcode `0` DISPATCH events keyed by `t` (event name) and `d` (data).
//!
//! This implementation covers the basics: identify, heartbeat, reconnect on close,
//! and a channel of raw [`GatewayEvent`]s for the caller to consume. It deliberately
//! does **not** implement voice, sharding, or full cache state — that is out of scope
//! for this basic client.

use crate::auth::AuthToken;
use crate::error::{Error, Result};
use crate::http::Http;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message as WsMessage;

/// The gateway API version this client speaks. The Fluxer gateway expects
/// `?v=1` (unlike Discord's `v=10`); without it the server closes the
/// WebSocket with code 4012 "Invalid API version" right after the handshake.
const GATEWAY_VERSION: u8 = 1;

/// Build the final WebSocket URL with the required query params.
///
/// Merges `v=1` and `encoding=json` into whatever query string the base URL
/// already carries (e.g. if `GET /gateway/bot` returned a URL with params).
/// Existing values for `v` / `encoding` from the base URL take precedence so
/// an explicit override from the server isn't clobbered.
///
/// Also guarantees the URL has a path. The live gateway sits behind an
/// ingress (Caddy) that rejects *any* query string on a path-less URL with an
/// HTTP 400 — so `wss://gateway.fluxer.app?v=1&encoding=json` fails the WS
/// upgrade before it ever speaks the protocol. A trailing slash
/// (`wss://gateway.fluxer.app/?v=1&encoding=json`) upgrades cleanly and the
/// server sends HELLO. Discovery hands us a path-less host like
/// `wss://gateway.fluxer.app`, so we add `/` when there isn't already a path.
fn build_gateway_url(base: &str) -> String {
    let (mut path, mut query) = match base.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (base.to_string(), String::new()),
    };
    // Strip the scheme/host to inspect just the path. If the path is empty
    // (e.g. `wss://gateway.fluxer.app`), append `/` so the query string is
    // attached to a real path and the ingress doesn't 400 it.
    let path_part = path.splitn(2, "://").nth(1).unwrap_or(&path);
    let after_host = path_part.find('/');
    if after_host.is_none() {
        path.push('/');
    }
    let has_v = query
        .split('&')
        .any(|kv| kv.split('=').next().unwrap_or("") == "v");
    let has_encoding = query
        .split('&')
        .any(|kv| kv.split('=').next().unwrap_or("") == "encoding");
    let mut extras: Vec<String> = Vec::new();
    if !has_v {
        extras.push(format!("v={GATEWAY_VERSION}"));
    }
    if !has_encoding {
        extras.push("encoding=json".to_string());
    }
    if !extras.is_empty() {
        if query.is_empty() {
            query = extras.join("&");
        } else {
            query.push('&');
            query.push_str(&extras.join("&"));
        }
    }
    if query.is_empty() {
        path
    } else {
        format!("{path}?{query}")
    }
}

/// Gateway opcodes (mirrors Fluxer's gateway).
pub mod op {
    pub const DISPATCH: i32 = 0;
    pub const HEARTBEAT: i32 = 1;
    pub const IDENTIFY: i32 = 2;
    pub const PRESENCE_UPDATE: i32 = 3;
    pub const VOICE_STATE_UPDATE: i32 = 4;
    pub const RESUME: i32 = 6;
    pub const REQUEST_GUILD_MEMBERS: i32 = 8;
    pub const INVALID_SESSION: i32 = 9;
    pub const HELLO: i32 = 10;
    pub const HEARTBEAT_ACK: i32 = 11;
    pub const LAZY_REQUEST: i32 = 14;
}

/// A raw inbound gateway event: opcode 0 DISPATCH with its event name and payload.
#[derive(Debug, Clone)]
pub struct GatewayEvent {
    pub name: String,
    pub data: Value,
}

/// A presence status the client can broadcast via op 3 PRESENCE_UPDATE.
#[derive(Debug, Clone, Copy)]
pub enum PresenceStatus {
    Online,
    Dnd,
    Idle,
    Invisible,
    Offline,
}

impl PresenceStatus {
    fn as_str(self) -> &'static str {
        match self {
            PresenceStatus::Online => "online",
            PresenceStatus::Dnd => "dnd",
            PresenceStatus::Idle => "idle",
            PresenceStatus::Invisible => "invisible",
            PresenceStatus::Offline => "offline",
        }
    }
}

/// A range of member list indices to subscribe to via op 14 LAZY_REQUEST.
///
/// Fluxer's lazy member list sends members for the ranges the client is
/// actually viewing (e.g. `[0, 99]` for the top of the list) instead of
/// pushing every member on READY. The client re-subscribes as the user
/// scrolls. Each range is inclusive on both ends.
#[derive(Debug, Clone, Copy)]
pub struct MemberRange {
    pub start: u32,
    pub end: u32,
}

/// A voice state update sent over op 4. Fields mirror the gateway's
/// `VoiceState` object; `None` means "leave unchanged" for that field.
#[derive(Debug, Clone, Default)]
pub struct VoiceStateUpdate {
    pub guild_id: Option<String>,
    pub channel_id: Option<String>,
    pub self_mute: Option<bool>,
    pub self_deaf: Option<bool>,
    pub self_video: Option<bool>,
}

/// A command that can be sent to the gateway task to send outbound messages.
#[derive(Debug, Clone)]
pub enum GatewayCommand {
    /// Subscribe to a guild to receive message/member/typing events (op 14 LAZY_REQUEST).
    SubscribeGuild { guild_id: String },
    /// Subscribe to specific member-list ranges for a guild (op 14 LAZY_REQUEST
    /// with `ranges`). Used for the lazy member list on big guilds.
    SubscribeRanges {
        guild_id: String,
        ranges: Vec<MemberRange>,
    },
    /// Request a member list chunk for a guild (op 8 REQUEST_GUILD_MEMBERS).
    /// Used when the lazy list isn't enough and we need to enumerate members.
    RequestMembers {
        guild_id: String,
        query: Option<String>,
        limit: Option<u32>,
    },
    /// Update the current user's presence (op 3 PRESENCE_UPDATE).
    UpdatePresence {
        status: PresenceStatus,
        activities: Vec<Value>,
        afk: bool,
        since: Option<u64>,
    },
    /// Join/leave/move a voice channel (op 4 VOICE_STATE_UPDATE). Pass
    /// `channel_id: None` to disconnect.
    VoiceStateUpdate(VoiceStateUpdate),
}

/// A handle returned from [`Gateway::connect`] that lets the caller read events,
/// send commands (like guild subscriptions), and drive graceful shutdown. It
/// also exposes a [`Self::recv_status`] channel that reports the gateway's
/// real connection state (driven by the background task) so callers can show
/// accurate status without guessing from event flow.
pub struct GatewayHandle {
    events: mpsc::Receiver<GatewayEvent>,
    commands: mpsc::Sender<GatewayCommand>,
    shutdown: Arc<tokio::sync::Notify>,
    status: mpsc::Receiver<GatewayStatus>,
}

impl std::fmt::Debug for GatewayHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GatewayHandle").finish_non_exhaustive()
    }
}

/// The gateway's connection state, reported by the background task via
/// [`GatewayHandle::recv_status`]. Callers (e.g. the Tauri gateway loop)
/// forward these to the frontend so the reconnect banner reflects reality.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GatewayStatus {
    /// Attempting to establish the WebSocket connection / identify.
    Connecting,
    /// HELLO received + IDENTIFY/RESUME sent; events are flowing.
    Connected,
    /// The connection dropped; the task will reconnect after backoff.
    Reconnecting,
    /// The task exited (shutdown or unrecoverable error).
    Disconnected,
}

impl GatewayHandle {
    /// Wait for the next dispatch event. Returns `None` when the gateway task has
    /// exited (e.g. after shutdown or an unrecoverable error).
    pub async fn recv(&mut self) -> Option<GatewayEvent> {
        self.events.recv().await
    }

    /// Wait for the next connection-status update from the background task.
    /// Returns `None` when the task has exited (the channel closed). Callers
    /// should forward these to the UI so the reconnect banner is accurate.
    pub async fn recv_status(&mut self) -> Option<GatewayStatus> {
        self.status.recv().await
    }

    /// Take the status receiver out of the handle so a dedicated task can
    /// drain status updates without conflicting with [`Self::recv`] (which
    /// borrows the handle mutably). After this, [`Self::recv_status`] returns
    /// `None`. The main handle keeps working for events + commands.
    pub fn take_status(&mut self) -> mpsc::Receiver<GatewayStatus> {
        let (_dead_tx, dead_rx) = mpsc::channel::<GatewayStatus>(1);
        std::mem::replace(&mut self.status, dead_rx)
    }

    /// Send a command to the gateway task (e.g. subscribe to a guild for message
    /// events). Returns an error if the gateway task has exited.
    pub async fn send_command(&self, cmd: GatewayCommand) -> Result<()> {
        self.commands
            .send(cmd)
            .await
            .map_err(|_| Error::Gateway("gateway task closed".into()))
    }

    /// Request a graceful shutdown of the gateway loop. Already-in-flight events
    /// may still arrive briefly afterwards.
    pub fn shutdown(&self) {
        self.shutdown.notify_waiters();
    }
}

/// A gateway connection builder.
#[derive(Debug)]
pub struct Gateway {
    url: String,
    http: Http,
}

/// State shared across reconnects so we can RESUME instead of re-IDENTIFYing,
/// avoiding missed events during transient disconnects.
#[derive(Debug, Clone, Default)]
struct SessionState {
    session_id: Option<String>,
    seq: Option<i64>,
}

impl SessionState {
    fn reset(&mut self) {
        self.session_id = None;
        self.seq = None;
    }
}

/// Subscriptions we've made via op 14 LAZY_REQUEST, tracked so we can re-send
/// them on resume. Fluxer does not always restore op-14 subscriptions on
/// resume, so the client must replay them.
///
/// - `guilds`: guilds subscribed to the full set of message/typing/member
///   events (the simple `SubscribeGuild` command).
/// - `ranges`: per-guild member-list ranges subscribed via `SubscribeRanges`.
///   Big guilds (large member count) use this instead of the full `members:
///   true` subscription to avoid the server pushing every member.
#[derive(Debug, Default)]
struct Subscriptions {
    guilds: Vec<String>,
    ranges: std::collections::HashMap<String, Vec<MemberRange>>,
}

impl Gateway {
    /// Construct a new gateway client targeting the given WebSocket URL.
    pub fn new(url: impl Into<String>, http: Http) -> Self {
        Self {
            url: url.into(),
            http,
        }
    }

    /// Connect, identify, and start the heartbeat loop. Returns a handle to read
    /// events, send commands (like guild subscriptions), and shut down. The
    /// connection automatically reconnects on close or error with an exponential
    /// backoff so real-time updates keep flowing even after a network blip or a
    /// server-side restart. See module docs for the supported subset.
    pub async fn connect(self) -> Result<GatewayHandle> {
        let (tx, rx) = mpsc::channel::<GatewayEvent>(64);
        let (cmd_tx, cmd_rx) = mpsc::channel::<GatewayCommand>(64);
        let (status_tx, status_rx) = mpsc::channel::<GatewayStatus>(16);
        let shutdown = Arc::new(tokio::sync::Notify::new());

        let auth = self.http_auth_token();
        let url = self.url.clone();
        let shutdown_task = shutdown.clone();
        let mut cmd_rx = cmd_rx;

        tokio::spawn(async move {
            // Reconnect loop: keeps the gateway alive across transient failures.
            let mut backoff = Duration::from_secs(1);
            const MAX_BACKOFF: Duration = Duration::from_secs(30);
            let mut session = SessionState::default();
            // Track subscriptions so we can replay them on resume (the server
            // doesn't always restore op-14 subscriptions on resume).
            let mut subs = Subscriptions::default();
            loop {
                // Emit "connecting" when we begin a connection attempt so the
                // UI shows the banner while the handshake is in flight.
                let _ = status_tx.send(GatewayStatus::Connecting).await;
                match run_gateway(&url, auth.clone(), tx.clone(), shutdown_task.clone(), &mut session, &mut cmd_rx, &mut subs, status_tx.clone()).await {
                    Ok(()) => {
                        // Clean close; reconnect after a short delay in case the
                        // server is restarting.
                        backoff = Duration::from_secs(1);
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "gateway disconnected, reconnecting");
                    }
                }
                // The connection dropped — tell the caller we're reconnecting.
                let _ = status_tx.send(GatewayStatus::Reconnecting).await;
                // Check for shutdown before sleeping/reconnecting.
                let cancelled = tokio::select! {
                    _ = shutdown_task.notified() => true,
                    _ = tokio::time::sleep(backoff) => false,
                };
                if cancelled {
                    let _ = status_tx.send(GatewayStatus::Disconnected).await;
                    break;
                }
                backoff = (backoff * 2).min(MAX_BACKOFF);
            }
        });

        Ok(GatewayHandle {
            events: rx,
            commands: cmd_tx,
            shutdown,
            status: status_rx,
        })
    }

    fn http_auth_token(&self) -> AuthToken {
        self.http.auth_token().clone()
    }
}

async fn run_gateway(
    url: &str,
    auth: AuthToken,
    tx: mpsc::Sender<GatewayEvent>,
    shutdown: Arc<tokio::sync::Notify>,
    session: &mut SessionState,
    cmd_rx: &mut mpsc::Receiver<GatewayCommand>,
    subs: &mut Subscriptions,
    status_tx: mpsc::Sender<GatewayStatus>,
) -> Result<()> {
    // tokio-tungstenite 0.24's `WsMessage::Text` takes `Utf8Bytes`; `.into()` from
    // `String` is required, but clippy mis-flags it as a useless conversion.
    #![allow(clippy::useless_conversion)]
    tracing::info!(%url, "connecting");
    // The Fluxer gateway requires `?v=1&encoding=json` query params — without
    // them the server upgrades the WebSocket then immediately closes with code
    // 4012 "Invalid API version" (the protocol-version default differs from
    // Discord's v=10). `GET /gateway/bot` may already return a URL with a query
    // string, so merge rather than blindly appending.
    let url = build_gateway_url(url);
    // Cap the WS handshake + TLS negotiation at 15s so a wedged network (or a
    // server that accepts TCP but never completes the upgrade) surfaces as a
    // reconnectable error instead of sticking the UI on "connecting" forever.
    let connect = tokio::time::timeout(Duration::from_secs(15), tokio_tungstenite::connect_async(&url));
    let (ws, response) = match connect.await {
        Ok(Ok(ws_resp)) => ws_resp,
        Ok(Err(e)) => {
            tracing::warn!(error = %e, "WS connect error");
            return Err(Error::Gateway(e.to_string()));
        }
        Err(_) => {
            tracing::warn!("WS connect timed out after 15s");
            return Err(Error::Gateway("WS connect timed out".into()));
        }
    };
    tracing::info!(status = %response.status(), "WS connected");
    let (mut sink, mut stream) = ws.split();

    // Wait for HELLO to learn the heartbeat interval. Cap it at 10s so a
    // server that upgrades the socket then never sends HELLO (e.g. it's
    // about to close with an error code) doesn't hang the connection.
    tracing::debug!("waiting for HELLO (op 10)");
    let heartbeat_interval = match tokio::time::timeout(
        Duration::from_secs(10),
        wait_for_hello(&mut stream),
    )
    .await
    {
        Ok(Ok(Some(ms))) => {
            tracing::info!(heartbeat_interval_ms = ms, "HELLO received");
            ms
        }
        Ok(Ok(None)) => {
            tracing::warn!("connection closed before HELLO");
            return Err(Error::Gateway("connection closed before HELLO".into()));
        }
        Ok(Err(e)) => {
            tracing::warn!(error = %e, "error waiting for HELLO");
            return Err(e);
        }
        Err(_) => {
            tracing::warn!("timed out waiting for HELLO (10s)");
            return Err(Error::Gateway("timed out waiting for HELLO".into()));
        }
    };

    // If we have a session from a previous connection, try to RESUME so we
    // don't miss events sent while disconnected. Otherwise IDENTIFY fresh.
    let can_resume = session.session_id.is_some() && session.seq.is_some();
    if can_resume {
        let resume = resume_payload(&auth, session.session_id.as_deref().unwrap(), session.seq.unwrap());
        tracing::info!(session = session.session_id.as_deref().unwrap_or("?"), seq = session.seq.unwrap_or(0), "sending RESUME");
        if sink.send(WsMessage::Text(resume.into())).await.is_err() {
            tracing::warn!("failed to send RESUME");
            return Err(Error::Gateway("failed to send RESUME".into()));
        }
    } else {
        let identify = identify_payload(&auth);
        tracing::info!("sending IDENTIFY (op 2)");
        sink.send(WsMessage::Text(identify.into()))
            .await
            .map_err(|e| {
                tracing::warn!(error = %e, "failed to send IDENTIFY");
                Error::Gateway(e.to_string())
            })?;
        tracing::info!("IDENTIFY sent");
    }

    // Re-subscribe to all guilds and member ranges we were subscribed to
    // before the reconnect. The server does not always restore op-14
    // subscriptions on resume, so the client must replay them.
    for guild_id in subs.guilds.iter() {
        let lazy = lazy_request_payload(guild_id, None);
        if sink.send(WsMessage::Text(lazy.into())).await.is_err() {
            tracing::warn!("failed to re-subscribe to guild {guild_id}");
        }
    }
    for (guild_id, ranges) in subs.ranges.iter() {
        let lazy = lazy_request_payload(guild_id, Some(ranges));
        if sink.send(WsMessage::Text(lazy.into())).await.is_err() {
            tracing::warn!("failed to re-subscribe to ranges for guild {guild_id}");
        }
    }

    // HELLO received + IDENTIFY/RESUME sent + subscriptions replayed: the
    // gateway is now connected and events will start flowing. Tell the
    // caller so the UI can dismiss the "Connecting…" banner.
    tracing::info!("emitting Connected status");
    let _ = status_tx.send(GatewayStatus::Connected).await;

    // Spawn a heartbeat task.
    let (heartbeat_tx, mut heartbeat_rx) = mpsc::channel::<i32>(8);
    let hb_shutdown = shutdown.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(heartbeat_interval as u64));
        interval.tick().await; // skip first immediate tick
        loop {
            tokio::select! {
                _ = hb_shutdown.notified() => break,
                _ = interval.tick() => {
                    if heartbeat_tx.send(op::HEARTBEAT).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    // Main read loop.
    loop {
        tokio::select! {
            _ = shutdown.notified() => {
                let _ = sink.send(WsMessage::Close(None)).await;
                break;
            }
            op_to_send = heartbeat_rx.recv() => {
                if let Some(op_code) = op_to_send {
                    let payload = serde_json::json!({ "op": op_code, "d": Value::Null }).to_string();
                    if sink.send(WsMessage::Text(payload.into())).await.is_err() {
                        break;
                    }
                }
            }
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(GatewayCommand::SubscribeGuild { guild_id }) => {
                        // Track the subscription so we can re-subscribe on reconnect.
                        if !subs.guilds.contains(&guild_id) {
                            subs.guilds.push(guild_id.clone());
                        }
                        let lazy = lazy_request_payload(&guild_id, None);
                        if sink.send(WsMessage::Text(lazy.into())).await.is_err() {
                            tracing::warn!("failed to send LAZY_REQUEST for guild {guild_id}");
                        }
                        tracing::info!(guild_id, "subscribed to guild");
                    }
                    Some(GatewayCommand::SubscribeRanges { guild_id, ranges }) => {
                        // Track the ranges so we can replay on reconnect.
                        subs.ranges.insert(guild_id.clone(), ranges.clone());
                        let lazy = lazy_request_payload(&guild_id, Some(&ranges));
                        if sink.send(WsMessage::Text(lazy.into())).await.is_err() {
                            tracing::warn!("failed to send LAZY_REQUEST (ranges) for guild {guild_id}");
                        }
                        tracing::info!(guild_id, range_count = ranges.len(), "subscribed to member ranges");
                    }
                    Some(GatewayCommand::RequestMembers { guild_id, query, limit }) => {
                        let payload = request_members_payload(&guild_id, query, limit);
                        if sink.send(WsMessage::Text(payload.into())).await.is_err() {
                            tracing::warn!("failed to send REQUEST_GUILD_MEMBERS for guild {guild_id}");
                        }
                    }
                    Some(GatewayCommand::UpdatePresence { status, activities, afk, since }) => {
                        let payload = presence_update_payload(status, &activities, afk, since);
                        if sink.send(WsMessage::Text(payload.into())).await.is_err() {
                            tracing::warn!("failed to send PRESENCE_UPDATE");
                        }
                    }
                    Some(GatewayCommand::VoiceStateUpdate(voice)) => {
                        let payload = voice_state_update_payload(&voice);
                        if sink.send(WsMessage::Text(payload.into())).await.is_err() {
                            tracing::warn!("failed to send VOICE_STATE_UPDATE");
                        }
                    }
                    None => {}
                }
            }
            msg = stream.next() => {
                match msg {
                    Some(Ok(WsMessage::Text(text))) => {
                        // Log the opcode + event name for every dispatch so we
                        // can trace the handshake → READY flow.
                        if let Ok(v) = serde_json::from_str::<Value>(&text) {
                            let op = v.get("op").and_then(Value::as_i64).unwrap_or(-1);
                            let t = v.get("t").and_then(Value::as_str).unwrap_or("");
                            let s = v.get("s").and_then(Value::as_i64);
                            tracing::debug!(op, t = %t, s = ?s, "recv");
                            if op == op::INVALID_SESSION as i64 {
                                let d = v.pointer("/d").and_then(Value::as_bool);
                                tracing::warn!(resumable = ?d, "INVALID_SESSION — will re-IDENTIFY");
                            }
                        } else {
                            tracing::warn!(len = text.len(), "recv non-JSON text");
                        }
                        // Track session_id and seq for resume.
                        track_session(&text, session);
                        if let Err(e) = handle_text(&text, &tx, &mut sink).await {
                            tracing::warn!(error = %e, "message handling error");
                        }
                    }
                    Some(Ok(WsMessage::Ping(payload))) => {
                        let _ = sink.send(WsMessage::Pong(payload)).await;
                    }
                    Some(Ok(WsMessage::Close(reason))) => {
                        tracing::info!(?reason, "server sent Close");
                        break;
                    }
                    Some(Ok(WsMessage::Binary(_))) => {}
                    Some(Ok(WsMessage::Pong(_))) => {}
                    Some(Ok(WsMessage::Frame(_))) => {}
                    Some(Err(e)) => {
                        tracing::warn!(error = %e, "read error");
                        break;
                    }
                    None => {
                        tracing::info!("stream ended (None)");
                        break;
                    }
                }
            }
        }
    }

    Ok(())
}

/// Build a LAZY_REQUEST (op 14) payload to subscribe to a guild's message,
/// typing, and member events. Fluxer uses this instead of Discord-style intents.
///
/// When `ranges` is `Some`, the subscription is for the lazy member list: the
/// server pushes `GUILD_MEMBERS_CHUNK` events covering only the requested
/// index ranges (inclusive on both ends). When `ranges` is `None`, the
/// subscription is the full set (`members: true`) used by `SubscribeGuild`.
fn lazy_request_payload(guild_id: &str, ranges: Option<&[MemberRange]>) -> String {
    let mut sub = serde_json::json!({
        "active": true,
        "sync": true,
        "typing": true,
        "members": true
    });
    if let Some(rs) = ranges {
        // Replace the full-members subscription with ranged views. The server
        // expects an array of [start, end] inclusive pairs.
        let arr: Vec<[u32; 2]> = rs.iter().map(|r| [r.start, r.end]).collect();
        sub["members"] = serde_json::Value::Null;
        sub["ranges"] = serde_json::to_value(&arr).unwrap_or(Value::Null);
    }
    let payload = serde_json::json!({
        "op": op::LAZY_REQUEST,
        "d": {
            "subscriptions": {
                guild_id: sub
            }
        }
    });
    serde_json::to_string(&payload).expect("lazy request payload is always serializable")
}

/// Build a REQUEST_GUILD_MEMBERS (op 8) payload. Used to fetch a member list
/// chunk by query (prefix search on names) or to enumerate up to `limit`
/// members starting from the lexicographically smallest id.
fn request_members_payload(guild_id: &str, query: Option<String>, limit: Option<u32>) -> String {
    let mut d = serde_json::json!({ "guild_id": guild_id });
    if let Some(q) = query {
        d["query"] = serde_json::Value::String(q);
    }
    if let Some(l) = limit {
        d["limit"] = serde_json::Value::from(l);
    }
    let payload = serde_json::json!({ "op": op::REQUEST_GUILD_MEMBERS, "d": d });
    serde_json::to_string(&payload).expect("request members payload is always serializable")
}

/// Build a PRESENCE_UPDATE (op 3) payload.
fn presence_update_payload(
    status: PresenceStatus,
    activities: &[Value],
    afk: bool,
    since: Option<u64>,
) -> String {
    let payload = serde_json::json!({
        "op": op::PRESENCE_UPDATE,
        "d": {
            "since": since.unwrap_or(0),
            "activities": activities,
            "status": status.as_str(),
            "afk": afk,
        }
    });
    serde_json::to_string(&payload).expect("presence update payload is always serializable")
}

/// Build a VOICE_STATE_UPDATE (op 4) payload. `channel_id: None` disconnects.
/// Other `None` fields are omitted so the server leaves them unchanged.
fn voice_state_update_payload(voice: &VoiceStateUpdate) -> String {
    let mut d = serde_json::Map::new();
    if let Some(ref gid) = voice.guild_id {
        d.insert("guild_id".into(), Value::String(gid.clone()));
    }
    match &voice.channel_id {
        Some(cid) => d.insert("channel_id".into(), Value::String(cid.clone())),
        // null channel_id means disconnect.
        None => d.insert("channel_id".into(), Value::Null),
    };
    if let Some(mute) = voice.self_mute {
        d.insert("self_mute".into(), Value::Bool(mute));
    }
    if let Some(deaf) = voice.self_deaf {
        d.insert("self_deaf".into(), Value::Bool(deaf));
    }
    if let Some(video) = voice.self_video {
        d.insert("self_video".into(), Value::Bool(video));
    }
    let payload = serde_json::json!({ "op": op::VOICE_STATE_UPDATE, "d": Value::Object(d) });
    serde_json::to_string(&payload).expect("voice state update payload is always serializable")
}

/// Extract `session_id` (from READY) and `s` (sequence number from any
/// DISPATCH) so we can RESUME after a reconnect.
fn track_session(text: &str, session: &mut SessionState) {
    if let Ok(v) = serde_json::from_str::<Value>(text) {
        // Track sequence number from DISPATCH events.
        if v.get("op").and_then(Value::as_i64) == Some(op::DISPATCH as i64) {
            if let Some(s) = v.get("s").and_then(Value::as_i64) {
                session.seq = Some(s);
            }
            // READY includes the session_id.
            if v.get("t").and_then(Value::as_str) == Some("READY") {
                if let Some(id) = v.pointer("/d/session_id").and_then(Value::as_str) {
                    session.session_id = Some(id.to_string());
                }
            }
            // RESUMED means the resume succeeded; the server replays missed
            // events. If we get an INVALID_SESSION, we must reset and re-IDENTIFY.
            if v.get("t").and_then(Value::as_str) == Some("RESUMED") {
                tracing::info!("gateway session resumed");
            }
        }
        // INVALID_SESSION: must reset and re-IDENTIFY fresh.
        if v.get("op").and_then(Value::as_i64) == Some(op::INVALID_SESSION as i64) {
            tracing::warn!("gateway session invalid; will re-IDENTIFY");
            session.reset();
        }
    }
}

async fn wait_for_hello<S>(stream: &mut S) -> Result<Option<u64>>
where
    S: futures_util::Stream<
            Item = std::result::Result<WsMessage, tokio_tungstenite::tungstenite::Error>,
        > + Unpin,
{
    while let Some(msg) = stream.next().await {
        match msg {
            Ok(WsMessage::Text(text)) => {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    if v.get("op").and_then(Value::as_i64) == Some(op::HELLO as i64) {
                        let interval = v.pointer("/d/heartbeat_interval").and_then(Value::as_u64);
                        return Ok(interval);
                    }
                }
            }
            Ok(WsMessage::Ping(payload)) => {
                // Without a sink here we can't pong; the main loop will handle pings.
                let _ = payload;
            }
            Ok(WsMessage::Close(_)) => return Ok(None),
            Err(_) => return Ok(None),
            _ => {}
        }
    }
    Ok(None)
}

async fn handle_text<S>(text: &str, tx: &mpsc::Sender<GatewayEvent>, sink: &mut S) -> Result<()>
where
    S: futures_util::Sink<WsMessage, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    #![allow(clippy::useless_conversion)]
    let v: Value = serde_json::from_str(text)?;
    let op = v.get("op").and_then(Value::as_i64).unwrap_or(-1) as i32;
    match op {
        op::DISPATCH => {
            let name = v.get("t").and_then(Value::as_str).unwrap_or("").to_string();
            let data = v.get("d").cloned().unwrap_or(Value::Null);
            // READY and RESUMED are silently accepted; everything else is forwarded.
            let _ = tx.send(GatewayEvent { name, data }).await;
        }
        op::HEARTBEAT => {
            let payload = serde_json::json!({ "op": op::HEARTBEAT, "d": Value::Null }).to_string();
            sink.send(WsMessage::Text(payload.into()))
                .await
                .map_err(|e| Error::Gateway(e.to_string()))?;
        }
        op::HEARTBEAT_ACK => {
            // No-op; heartbeat was acknowledged.
        }
        _ => {
            // Unknown opcode — ignore.
        }
    }
    Ok(())
}

fn identify_payload(auth: &AuthToken) -> String {
    #[derive(Serialize)]
    struct Identify<'a> {
        op: i32,
        d: IdentifyData<'a>,
    }
    #[derive(Serialize)]
    struct IdentifyData<'a> {
        token: &'a str,
        properties: IdentifyProperties,
        flags: u32,
    }
    #[derive(Serialize)]
    struct IdentifyProperties {
        // Fluxer (unlike Discord) uses bare `os`/`browser`/`device` keys. The
        // Discord-style `$os`/`$browser`/`$device` keys are ignored by the
        // gateway and the identify is treated as missing required fields, so
        // READY never arrives and the client sticks on "connecting".
        os: &'static str,
        browser: &'static str,
        device: &'static str,
    }

    let token = match auth {
        AuthToken::Bot(t) | AuthToken::Session(t) | AuthToken::Bearer(t) => t.as_str(),
    };

    // Fluxer does NOT use Discord-style intents. Instead it uses identify flags
    // (currently DEBOUNCE_MESSAGE_REACTIONS = 1 << 1) and per-guild LAZY_REQUEST
    // subscriptions (op 14) to receive message events.
    const DEBOUNCE_MESSAGE_REACTIONS: u32 = 1 << 1;

    let payload = Identify {
        op: op::IDENTIFY,
        d: IdentifyData {
            token,
            properties: IdentifyProperties {
                os: "unknown",
                browser: "fluxer-rust",
                device: "fluxer-rust",
            },
            flags: DEBOUNCE_MESSAGE_REACTIONS,
        },
    };
    serde_json::to_string(&payload).expect("identify payload is always serializable")
}

/// Build a RESUME payload to reconnect to an existing session and replay
/// missed events. Mirrors Discord's op 6 RESUME.
fn resume_payload(auth: &AuthToken, session_id: &str, seq: i64) -> String {
    #[derive(Serialize)]
    struct Resume<'a> {
        op: i32,
        d: ResumeData<'a>,
    }
    #[derive(Serialize)]
    struct ResumeData<'a> {
        token: &'a str,
        session_id: &'a str,
        seq: i64,
    }

    let token = match auth {
        AuthToken::Bot(t) | AuthToken::Session(t) | AuthToken::Bearer(t) => t.as_str(),
    };
    let payload = Resume {
        op: op::RESUME,
        d: ResumeData {
            token,
            session_id,
            seq,
        },
    };
    serde_json::to_string(&payload).expect("resume payload is always serializable")
}

/// Convenience parser for the most common gateway payloads.
#[derive(Debug, Clone, Deserialize)]
pub struct RawPayload {
    pub op: i32,
    #[serde(default)]
    pub s: Option<i64>,
    #[serde(default)]
    pub t: Option<String>,
    #[serde(default)]
    pub d: Value,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identify_payload_uses_bare_property_keys() {
        // Fluxer's gateway requires bare `os`/`browser`/`device` property keys
        // (Discord-style `$os`/`$browser`/`$device` are ignored, so READY never
        // arrives and the client sticks on "connecting"). This guards against a
        // regression to the Discord-style prefixed keys.
        let payload = identify_payload(&AuthToken::session("tok"));
        let v: Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(v["op"], 2);
        assert_eq!(v["d"]["token"], "tok");
        // Bare keys must be present…
        assert_eq!(v["d"]["properties"]["os"], "unknown");
        assert_eq!(v["d"]["properties"]["browser"], "fluxer-rust");
        assert_eq!(v["d"]["properties"]["device"], "fluxer-rust");
        // …and the Discord-style `$`-prefixed keys must NOT be.
        assert!(
            v["d"]["properties"].get("$os").is_none(),
            "identify properties must not use Discord-style $os key"
        );
    }

    #[test]
    fn build_gateway_url_merges_version_and_encoding() {
        // G.26: the gateway requires `?v=1&encoding=json`. A bare URL must gain
        // both params; an URL that already carries one must not be duplicated.
        let url = build_gateway_url("wss://gateway.fluxer.app");
        assert!(url.contains("v=1"));
        assert!(url.contains("encoding=json"));
        // G.28: a path-less host must gain a trailing `/` so the ingress
        // doesn't 400 the query string. The merged URL is therefore
        // `wss://gateway.fluxer.app/?v=1&encoding=json` (note the slash).
        assert_eq!(url, "wss://gateway.fluxer.app/?v=1&encoding=json");

        // An explicit `v` from `GET /gateway/bot` is preserved (not clobbered).
        let url = build_gateway_url("wss://gateway.fluxer.app?v=1&encoding=json");
        assert_eq!(url, "wss://gateway.fluxer.app/?v=1&encoding=json");
        // Should not duplicate the params.
        assert_eq!(url.matches("v=1").count(), 1);
        assert_eq!(url.matches("encoding=json").count(), 1);

        // A URL that already has a path keeps it unchanged.
        let url = build_gateway_url("wss://gateway.example/gw?v=1&encoding=json");
        assert_eq!(url, "wss://gateway.example/gw?v=1&encoding=json");
    }
}
