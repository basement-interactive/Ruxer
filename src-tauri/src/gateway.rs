//! Gateway task: connect, identify, heartbeat, and forward DISPATCH events to
//! the frontend via Tauri events. Reconnects with backoff so real-time updates
//! keep flowing after transient failures.

use crate::emit_gateway_event;
use fluxer::gateway::{GatewayCommand, GatewayEvent};
use fluxer::FluxerClient;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Notify};

/// Spawn the gateway loop. Events are emitted as `gateway` Tauri events with a
/// `{ name, data }` payload. The `shutdown` notifier stops the loop on logout.
/// Returns a sender for gateway commands (e.g. guild subscriptions).
///
/// Status changes are emitted as `gateway_status` Tauri events with a
/// `{ status }` payload where status is one of: `"connecting"`, `"connected"`,
/// `"reconnecting"`, or `"disconnected"`. The frontend renders a reconnect
/// banner from these. The old `GATEWAY_READY` sentinel is folded into this
/// (`connected` replaces it).
pub fn spawn(
    app: AppHandle,
    client: FluxerClient,
    url: String,
    shutdown: Arc<Notify>,
) -> mpsc::Sender<GatewayCommand> {
    let (cmd_tx, mut cmd_rx) = mpsc::channel::<GatewayCommand>(64);
    let app_for_status = app.clone();
    tokio::spawn(async move {
        let mut backoff = std::time::Duration::from_secs(1);
        const MAX_BACKOFF: std::time::Duration = std::time::Duration::from_secs(30);
        emit_status(&app_for_status, "connecting");
        loop {
            let result = run(&client, &url, &app, &shutdown, &mut cmd_rx).await;
            if result.is_ok() {
                backoff = std::time::Duration::from_secs(1);
            } else {
                tracing::warn!(error = ?result.as_ref().err(), "gateway disconnected, reconnecting");
            }
            // The connection dropped — tell the frontend we're reconnecting so
            // it can show the banner (unless we're shutting down).
            emit_status(&app_for_status, "reconnecting");
            let cancelled = tokio::select! {
                _ = shutdown.notified() => true,
                _ = tokio::time::sleep(backoff) => false,
            };
            if cancelled {
                emit_status(&app_for_status, "disconnected");
                break;
            }
            backoff = (backoff * 2).min(MAX_BACKOFF);
            emit_status(&app_for_status, "connecting");
        }
    });
    cmd_tx
}

/// Emit a gateway status change to the frontend as a `gateway_status` event.
fn emit_status(app: &AppHandle, status: &str) {
    use serde_json::json;
    let _ = app.emit("gateway_status", json!({ "status": status }));
}

async fn run(
    client: &FluxerClient,
    url: &str,
    app: &AppHandle,
    shutdown: &Arc<Notify>,
    cmd_rx: &mut mpsc::Receiver<GatewayCommand>,
) -> Result<(), String> {
    let gateway = client.gateway(url.to_string());
    let mut handle = gateway.connect().await.map_err(|e| e.to_string())?;

    // Drain the gateway task's real connection status (connecting/connected/
    // reconnecting/disconnected) and forward it to the frontend. The
    // background task emits these once the WS handshake + IDENTIFY actually
    // succeed, so the banner is accurate rather than prematurely claiming
    // "connected". Run in its own task to avoid a double-mutable-borrow with
    // `handle.recv()` in the main loop below.
    let app_for_status = app.clone();
    let shutdown_for_status = shutdown.clone();
    let mut status_rx = handle.take_status();
    tokio::spawn(async move {
        loop {
            let status = tokio::select! {
                _ = shutdown_for_status.notified() => break,
                s = status_rx.recv() => match s {
                    Some(s) => s,
                    None => break,
                },
            };
            emit_status(&app_for_status, match status {
                fluxer::gateway::GatewayStatus::Connecting => "connecting",
                fluxer::gateway::GatewayStatus::Connected => "connected",
                fluxer::gateway::GatewayStatus::Reconnecting => "reconnecting",
                fluxer::gateway::GatewayStatus::Disconnected => "disconnected",
            });
        }
    });

    loop {
        tokio::select! {
            _ = shutdown.notified() => {
                handle.shutdown();
                emit_status(app, "disconnected");
                break;
            }
            ev = handle.recv() => {
                let Some(ev) = ev else { break };
                forward(app, ev);
            }
            // Forward commands from the frontend to the gateway task.
            cmd = cmd_rx.recv() => {
                if let Some(cmd) = cmd {
                    if let Err(e) = handle.send_command(cmd).await {
                        tracing::warn!(error = %e, "failed to send gateway command");
                        break;
                    }
                }
            }
        }
    }
    Ok(())
}

/// Forward a gateway event to the frontend, with light parsing for the events
/// we care about. The frontend MobX stores handle them.
///
/// Takes `ev` by value: dispatch payloads (e.g. `GUILD_CREATE`, `READY`) can be
/// large JSON blobs, and this is a per-event hot path, so we move the data
/// into the emitted Tauri event instead of cloning it.
fn forward(app: &AppHandle, ev: GatewayEvent) {
    // Parse the event name and pass the raw data through. The frontend decides
    // how to interpret each event.
    emit_gateway_event(app, &ev.name, ev.data);
}