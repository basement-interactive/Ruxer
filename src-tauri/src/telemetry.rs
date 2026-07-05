//! Opt-in error telemetry: forwards frontend console errors to a Fluxer
//! webhook, ONLY after the user explicitly agreed on first launch.
//!
//! Consent lives in `<config_dir>/ruxer/telemetry.json` as
//! `{"enabled": bool}`; the file being absent means "never asked yet", which
//! triggers the one-time prompt at startup (see `prompt_if_unasked`).
//! Reports are deduplicated by message hash and hard-capped per session so a
//! render-loop error can't flood the webhook.

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

/// The Fluxer webhook that receives error reports (user-supplied).
const WEBHOOK_URL: &str = "https://api.canary.fluxer.app/webhooks/1521561596516630528/AZ5stpXA5koRudEUAWBLxNQHUtvV1ACfGU9pnGnKT3VCGPPjz5TPriAsvYBMFGDK";

/// Hard cap of webhook posts per app session. Each UNIQUE message counts once
/// (dedup via `seen_hashes`), so this is a cap on distinct errors+warnings per
/// session, not total volume. Raised from 15 when console.warn forwarding was
/// added (warnings + errors now share this budget) so a burst of distinct
/// warnings can't starve real errors out of the cap.
const MAX_REPORTS_PER_SESSION: u32 = 50;

static SESSION_REPORT_COUNT: AtomicU32 = AtomicU32::new(0);

fn seen_hashes() -> &'static Mutex<HashSet<u64>> {
    static SEEN: std::sync::OnceLock<Mutex<HashSet<u64>>> = std::sync::OnceLock::new();
    SEEN.get_or_init(|| Mutex::new(HashSet::new()))
}

fn consent_path() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("ruxer").join("telemetry.json"))
}

/// `Some(enabled)` once the user has answered the prompt; `None` = not asked.
pub fn consent_status() -> Option<bool> {
    let path = consent_path()?;
    let raw = std::fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    v.get("enabled").and_then(|b| b.as_bool())
}

pub fn set_consent(enabled: bool) {
    let Some(path) = consent_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, format!("{{\"enabled\": {enabled}}}"));
}

/// One-time first-launch prompt. No-op when the user already answered.
/// Non-blocking: the dialog callback stores the choice whenever the user
/// clicks, the app keeps starting up meanwhile.
pub fn prompt_if_unasked(app: &tauri::AppHandle) {
    if consent_status().is_some() {
        return;
    }
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    app.dialog()
        .message(
            "Help improve Ruxer by sending anonymous error reports?\n\n\
             Only console errors (message + stack trace + app version) are sent — \
             no messages, account data, or personal information. You can change \
             this anytime in Settings > Desktop.",
        )
        .title("Error reporting")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Enable".to_string(),
            "No thanks".to_string(),
        ))
        .show(|agreed| {
            set_consent(agreed);
        });
}

/// Forward one error to the webhook (if consented + within caps). Fire and
/// forget: never blocks or errors toward the caller.
pub fn report(kind: String, message: String, stack: Option<String>) {
    if consent_status() != Some(true) {
        return;
    }
    // Dedupe identical errors within the session.
    let hash = {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        message.hash(&mut h);
        h.finish()
    };
    if let Ok(mut seen) = seen_hashes().lock() {
        if !seen.insert(hash) {
            return;
        }
    }
    if SESSION_REPORT_COUNT.fetch_add(1, Ordering::Relaxed) >= MAX_REPORTS_PER_SESSION {
        return;
    }

    let version = env!("CARGO_PKG_VERSION");
    let os = std::env::consts::OS;
    // Truncate defensively: webhook content limits + no interest in huge dumps.
    let mut body = format!("**[{kind}]** Ruxer {version} ({os})\n```\n{message}\n");
    if let Some(stack) = stack {
        let stack: String = stack.chars().take(1200).collect();
        body.push_str(&stack);
        body.push('\n');
    }
    body.push_str("```");
    let content: String = body.chars().take(1900).collect();

    tauri::async_runtime::spawn(async move {
        let payload = serde_json::json!({ "content": content });
        let client = reqwest::Client::new();
        let _ = client
            .post(WEBHOOK_URL)
            .json(&payload)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await;
    });
}

#[tauri::command]
pub fn telemetry_get_enabled() -> Option<bool> {
    consent_status()
}

#[tauri::command]
pub fn telemetry_set_enabled(enabled: bool) {
    set_consent(enabled);
}

#[tauri::command]
pub fn telemetry_report(kind: String, message: String, stack: Option<String>) {
    report(kind, message, stack);
}
