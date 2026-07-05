//! Secure credential storage via the OS keychain (`keyring` crate).
//!
//! On login, [`save_session`] writes `{ token, kind, instance, endpoints }`
//! to the OS credential store under a fixed service name. On app start,
//! [`load_session`] reads it back so the frontend can silently restore the
//! session without re-prompting. [`clear_session`] removes the entry on
//! logout or when the server returns 401 (the token is no longer valid).
//!
//! The stored blob is JSON for convenience; the keychain itself provides the
//! encryption-at-rest. Never store the token in plaintext on disk.

use crate::AppState;
use serde::{Deserialize, Serialize};

/// The keychain service + entry name. Using a fixed service lets us find the
/// entry again on the next app start.
const SERVICE: &str = "fluxer-desktop";
const ACCOUNT: &str = "fluxer-session";

/// The persisted session blob. `endpoints` is stored so a restored session
/// reuses the same instance endpoints without re-running discovery (though
/// discovery is re-run if the blob is missing or partial).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredSession {
    pub token: String,
    pub kind: String,
    pub instance: String,
    #[serde(default)]
    pub endpoints: Option<crate::Endpoints>,
}

/// Save the session to the OS keychain. Best-effort: failures are logged but
/// do not fail the login flow (falling back to a non-persistent session is
/// better than blocking login).
pub fn save_session(
    _state: &AppState,
    token: &str,
    kind: &str,
    instance: &str,
    endpoints: Option<&crate::Endpoints>,
) {
    let blob = StoredSession {
        token: token.to_string(),
        kind: kind.to_string(),
        instance: instance.to_string(),
        endpoints: endpoints.cloned(),
    };
    match serde_json::to_vec(&blob) {
        Ok(bytes) => match keyring::Entry::new(SERVICE, ACCOUNT) {
            Ok(entry) => {
                if let Err(e) = entry.set_password(&base64_encode(&bytes)) {
                    tracing::warn!(error = %e, "failed to save session to keychain");
                }
            }
            Err(e) => tracing::warn!(error = %e, "keychain unavailable"),
        },
        Err(e) => tracing::warn!(error = %e, "failed to serialize session"),
    }
}

/// Load a previously saved session from the OS keychain. Returns `None` when
/// there is no entry, the keychain is unavailable, or the blob fails to decode.
pub fn load_session() -> Option<StoredSession> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).ok()?;
    let encoded = entry.get_password().ok()?;
    let bytes = base64_decode(&encoded)?;
    serde_json::from_slice::<StoredSession>(&bytes).ok()
}

/// Remove the stored session (on logout or 401). Best-effort.
pub fn clear_session() {
    if let Ok(entry) = keyring::Entry::new(SERVICE, ACCOUNT) {
        if let Err(e) = entry.delete_credential() {
            tracing::debug!(error = %e, "no session to clear (or already cleared)");
        }
    }
}

/// Standard base64 encode (URL-safe not required here).
fn base64_encode(bytes: &[u8]) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    STANDARD.encode(bytes)
}

/// Standard base64 decode.
fn base64_decode(s: &str) -> Option<Vec<u8>> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    STANDARD.decode(s).ok()
}