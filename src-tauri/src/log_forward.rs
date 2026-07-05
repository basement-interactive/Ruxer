//! Forward backend tracing records to the frontend devtools console.
//!
//! Installs a [`LogLayer`] on the global tracing subscriber that, for every
//! event passing the env-filter, formats the message + level + target and
//! emits a `backend-log` Tauri event. The frontend listens on that channel
//! (see `api.ts` / `stores.ts`) and routes each record to `console.*`.
//!
//! The [`AppHandle`] is set lazily from `setup()` (it isn't available when the
//! subscriber is built in `run()`); until then records fall back to stderr
//! formatting only and no event is emitted.

use serde::Serialize;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

/// The minimum level below which records are *also* forwarded to the
/// frontend. Mirrors the env-filter's effective floor so we don't spam the
/// webview with TRACE/DEBUG logs that the user filtered out. Set from
/// `run()` by parsing `RUST_LOG` heuristically.
static LEVEL: OnceLock<tracing::Level> = OnceLock::new();

/// The AppHandle used to emit `backend-log` events. `None` until `set_app`
/// is called from `setup()`.
static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn set_level(level: tracing::Level) {
    let _ = LEVEL.set(level);
}

pub fn set_app(app: AppHandle) {
    let _ = APP.set(app);
}

/// Pick a default level from `RUST_LOG` if present, else `INFO`. Used to keep
/// the frontend mirror roughly in sync with the fmt subscriber's filter
/// without duplicating the full env-filter machinery.
pub fn level_from_env() -> tracing::Level {
    if let Ok(rust_log) = std::env::var("RUST_LOG") {
        for tok in rust_log.split(',') {
            let bare = tok.split('=').next().unwrap_or(tok).trim();
            match bare.to_ascii_uppercase().as_str() {
                "TRACE" => return tracing::Level::TRACE,
                "DEBUG" => return tracing::Level::DEBUG,
                "INFO" => return tracing::Level::INFO,
                "WARN" => return tracing::Level::WARN,
                "ERROR" => return tracing::Level::ERROR,
                _ => {}
            }
        }
    }
    tracing::Level::INFO
}

#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    /// `tracing::Level` string: "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR".
    pub level: String,
    /// Module path / target of the span or event.
    pub target: String,
    /// Formatted message (fields rendered into the message line).
    pub message: String,
}

/// A `tracing-subscriber` layer that mirrors events to the frontend.
///
/// The layer holds no state itself; it reads from the module-level `APP`
/// handle. If the handle isn't set yet (pre-`setup`) the layer is a no-op.
pub struct LogLayer;

impl LogLayer {
    pub fn new() -> Self {
        Self
    }
}

impl<S> tracing_subscriber::Layer<S> for LogLayer
where
    S: tracing::Subscriber,
{
    fn on_event(
        &self,
        event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        use tracing::field::Visit;

        // Level gate: skip forwarding records below the configured floor so
        // the devtools console isn't flooded when the user set RUST_LOG=warn.
        let floor = *LEVEL.get().unwrap_or(&tracing::Level::INFO);
        if *event.metadata().level() > floor {
            return;
        }

        // Collect the message string by visiting the event's fields.
        struct MsgVisitor {
            parts: Vec<String>,
            seen_message: bool,
        }
        impl Visit for MsgVisitor {
            fn record_debug(
                &mut self,
                field: &tracing::field::Field,
                value: &dyn std::fmt::Debug,
            ) {
                if field.name() == "message" {
                    self.parts.push(format!("{:?}", value));
                    self.seen_message = true;
                } else {
                    self.parts
                        .push(format!("{}={:?}", field.name(), value));
                }
            }
        }
        let mut v = MsgVisitor {
            parts: Vec::new(),
            seen_message: false,
        };
        event.record(&mut v);

        let message = if v.seen_message {
            // Leading message field first, then key=value fields joined.
            v.parts.join(" ")
        } else if v.parts.is_empty() {
            event.metadata().name().to_string()
        } else {
            v.parts.join(" ")
        };

        let entry = LogEntry {
            level: event.metadata().level().to_string(),
            target: event.metadata().target().to_string(),
            message,
        };

        // Emit to every webview window. `app.emit` targets all listeners on
        // the global channel. Using `get_webview_windows` + per-window emit
        // would also work but `Emitter::emit` on the handle covers it.
        if let Some(app) = APP.get() {
            let _ = app.emit("backend-log", &entry);
        }
    }
}