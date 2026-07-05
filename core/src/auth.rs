use std::fmt;

use crate::error::{Error, Result};
use crate::http::DEFAULT_API_BASE;
use crate::models::Snowflake;
use serde::{Deserialize, Serialize};

/// The kind of credential used to authenticate with the Fluxer API.
///
/// All variants are sent in the `Authorization` HTTP header.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AuthToken {
    /// `Authorization: Bot <token>` — used by bot applications.
    Bot(String),
    /// `Authorization: <token>` — bare user session token obtained from login.
    Session(String),
    /// `Authorization: Bearer <token>` — OAuth2 access token.
    Bearer(String),
}

impl AuthToken {
    /// Convenience constructor for a bot token.
    pub fn bot(token: impl Into<String>) -> Self {
        AuthToken::Bot(token.into())
    }

    /// Convenience constructor for a user session token.
    pub fn session(token: impl Into<String>) -> Self {
        AuthToken::Session(token.into())
    }

    /// Convenience constructor for an OAuth2 bearer token.
    pub fn bearer(token: impl Into<String>) -> Self {
        AuthToken::Bearer(token.into())
    }

    /// Format the value to place after `Authorization: ` in an HTTP request.
    pub fn header_value(&self) -> String {
        match self {
            AuthToken::Bot(t) => format!("Bot {t}"),
            AuthToken::Session(t) => t.clone(),
            AuthToken::Bearer(t) => format!("Bearer {t}"),
        }
    }
}

impl fmt::Display for AuthToken {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.header_value().as_str())
    }
}

// ---------------------------------------------------------------------------
// Email/password + MFA login (E.23)
// ---------------------------------------------------------------------------

/// A Fluxer login flow: `POST /auth/login` → `AuthLoginResponse`, then (if
/// MFA is required) `POST /auth/login/mfa/totp` → token.
///
/// The `/auth/*` endpoints are anonymous (no `Authorization` header), so this
/// uses a plain `reqwest::Client` pointed at the REST base. The outcome is
/// either an [`AuthLogin::Token`] (login complete) or an
/// [`AuthLogin::MfaChallenge`] (the caller must prompt for a TOTP code and
/// call [`Login::verify_totp`]).
#[derive(Clone, Debug)]
pub struct Login {
    client: reqwest::Client,
    base_url: String,
}

/// The result of `POST /auth/login`. The Fluxer API returns a `oneOf`:
/// either an `{ token, user_id, user }` token object (login complete) or an
/// `{ mfa: true, ticket, allowed_methods, totp, webauthn }` challenge object
/// (the caller must complete MFA). We deserialize both into a single struct
/// with optional fields and discriminate on `mfa == Some(true)`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AuthLoginResponse {
    /// Present (and `true`) when MFA is required to finish login.
    #[serde(default)]
    pub mfa: Option<bool>,
    /// The MFA ticket — present only on the MFA challenge variant. Used as the
    /// `ticket` field in the subsequent `POST /auth/login/mfa/totp` call.
    #[serde(default)]
    pub ticket: Option<String>,
    /// Allowed MFA methods (e.g. `["totp", "webauthn"]`).
    #[serde(default)]
    pub allowed_methods: Vec<String>,
    /// Whether TOTP authenticator MFA is available for this account.
    #[serde(default)]
    pub totp: bool,
    /// Whether WebAuthn security-key MFA is available for this account.
    #[serde(default)]
    pub webauthn: bool,

    // --- Token variant fields ---
    /// Session token — present only on the token variant (login complete).
    #[serde(default)]
    pub token: Option<String>,
    /// The authenticated user's id — present only on the token variant.
    #[serde(default)]
    pub user_id: Option<Snowflake>,
}

impl AuthLoginResponse {
    /// Whether this response is an MFA challenge (rather than a completed
    /// login with a token).
    pub fn is_mfa_challenge(&self) -> bool {
        matches!(self.mfa, Some(true))
    }

    /// Interpret the response as a completed login, returning the session
    /// token when present.
    pub fn token(&self) -> Option<&str> {
        self.token.as_deref()
    }
}

/// The discriminated outcome of [`Login::login`]. The caller drives the flow:
/// on `MfaChallenge` they prompt for a TOTP code and call [`Login::verify_totp`].
#[derive(Debug, Clone)]
pub enum LoginOutcome {
    /// Login succeeded — the session token is ready to use with [`AuthToken::session`].
    Token {
        token: String,
        user_id: Snowflake,
    },
    /// MFA is required. Hand the ticket + the user's TOTP code to
    /// [`Login::verify_totp`] to finish login.
    MfaChallenge(MfaChallenge),
}

/// An MFA challenge returned by `POST /auth/login` when the account has MFA
/// enabled. The `ticket` is consumed by the follow-up TOTP verification call.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MfaChallenge {
    /// The MFA ticket to pass back to `POST /auth/login/mfa/totp`.
    pub ticket: String,
    /// Allowed MFA methods (e.g. `["totp", "webauthn"]`).
    pub allowed_methods: Vec<String>,
    /// Whether TOTP authenticator MFA is available.
    pub totp: bool,
    /// Whether WebAuthn security-key MFA is available.
    pub webauthn: bool,
}

/// The response to `POST /auth/login/mfa/totp`: a session token + user id.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AuthTokenWithUserId {
    pub token: String,
    pub user_id: Snowflake,
}

impl Login {
    /// Build a login flow client pointed at the given REST base URL. Falls
    /// back to the production default when `base_url` is empty.
    pub fn new(base_url: impl Into<String>) -> Self {
        // Ensure the rustls crypto provider is installed before we build a
        // reqwest client (rustls 0.23 needs an explicit CryptoProvider).
        crate::init_crypto();
        let base_url = base_url.into();
        let base_url = if base_url.trim().is_empty() {
            DEFAULT_API_BASE.to_string()
        } else {
            base_url
        };
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default();
        Self { client, base_url }
    }

    /// `POST /auth/login` — authenticate with email + password. Returns a
    /// [`LoginOutcome::Token`] when login completes immediately, or a
    /// [`LoginOutcome::MfaChallenge`] when the account has MFA enabled.
    pub async fn login(&self, email: &str, password: &str) -> Result<LoginOutcome> {
        #[derive(Serialize)]
        struct Body<'a> {
            email: &'a str,
            password: &'a str,
        }
        let url = format!("{}/auth/login", self.base_url.trim_end_matches('/'));
        let resp = self
            .client
            .post(&url)
            .header("User-Agent", concat!("fluxer-rust/", env!("CARGO_PKG_VERSION")))
            .json(&Body { email, password })
            .send()
            .await?;
        let status = resp.status();
        let bytes = resp.bytes().await?;
        if !status.is_success() {
            return Err(Self::api_error(status, &bytes));
        }
        let parsed: AuthLoginResponse = serde_json::from_slice(&bytes).map_err(Error::Decode)?;
        if parsed.is_mfa_challenge() {
            let ticket = parsed.ticket.clone().ok_or_else(|| Error::Api {
                code: "MFA_NO_TICKET".into(),
                message: "MFA challenge missing ticket".into(),
                status: reqwest::StatusCode::BAD_REQUEST,
                body: String::new(),
            })?;
            Ok(LoginOutcome::MfaChallenge(MfaChallenge {
                ticket,
                allowed_methods: parsed.allowed_methods,
                totp: parsed.totp,
                webauthn: parsed.webauthn,
            }))
        } else {
            let token = parsed.token.clone().ok_or_else(|| Error::Api {
                code: "LOGIN_NO_TOKEN".into(),
                message: "login response missing token".into(),
                status: reqwest::StatusCode::BAD_REQUEST,
                body: String::new(),
            })?;
            let user_id = parsed.user_id.clone().ok_or_else(|| Error::Api {
                code: "LOGIN_NO_USER_ID".into(),
                message: "login response missing user_id".into(),
                status: reqwest::StatusCode::BAD_REQUEST,
                body: String::new(),
            })?;
            Ok(LoginOutcome::Token { token, user_id })
        }
    }

    /// `POST /auth/login/mfa/totp` — complete MFA by verifying the TOTP code
    /// from the user's authenticator app. On success returns the session
    /// token + user id, which the caller feeds to [`AuthToken::session`] and
    /// the normal client bootstrap.
    pub async fn verify_totp(&self, ticket: &str, code: &str) -> Result<AuthTokenWithUserId> {
        #[derive(Serialize)]
        struct Body<'a> {
            ticket: &'a str,
            code: &'a str,
        }
        let url = format!(
            "{}/auth/login/mfa/totp",
            self.base_url.trim_end_matches('/')
        );
        let resp = self
            .client
            .post(&url)
            .header("User-Agent", concat!("fluxer-rust/", env!("CARGO_PKG_VERSION")))
            .json(&Body { ticket, code })
            .send()
            .await?;
        let status = resp.status();
        let bytes = resp.bytes().await?;
        if !status.is_success() {
            return Err(Self::api_error(status, &bytes));
        }
        serde_json::from_slice::<AuthTokenWithUserId>(&bytes).map_err(Error::Decode)
    }

    /// Build an [`Error::Api`] from a non-2xx response body, parsing the
    /// Fluxer error envelope when present and falling back to the raw text.
    fn api_error(status: reqwest::StatusCode, bytes: &[u8]) -> Error {
        if let Ok(err) = serde_json::from_slice::<crate::error::ErrorBody>(bytes) {
            Error::Api {
                code: err.code,
                message: err.message,
                status,
                body: String::from_utf8_lossy(bytes).to_string(),
            }
        } else {
            Error::Api {
                code: "UNKNOWN".into(),
                message: String::from_utf8_lossy(bytes).to_string(),
                status,
                body: String::from_utf8_lossy(bytes).to_string(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_token_variant() {
        let json = r#"{"token":"abc","user_id":"123","user":{"id":"123","username":"u","discriminator":"0001","global_name":null,"avatar":null,"avatar_color":null,"flags":0}}"#;
        let r: AuthLoginResponse = serde_json::from_str(json).unwrap();
        assert!(!r.is_mfa_challenge());
        assert_eq!(r.token(), Some("abc"));
        assert_eq!(r.user_id.as_deref(), Some("123"));
    }

    #[test]
    fn parses_mfa_challenge_variant() {
        let json = r#"{"mfa":true,"ticket":"TICK","allowed_methods":["totp"],"totp":true,"webauthn":false}"#;
        let r: AuthLoginResponse = serde_json::from_str(json).unwrap();
        assert!(r.is_mfa_challenge());
        assert_eq!(r.ticket.as_deref(), Some("TICK"));
        assert!(r.totp);
        assert!(!r.webauthn);
        assert_eq!(r.token(), None);
    }

    #[test]
    fn parses_totp_response() {
        let json = r#"{"token":"xyz","user_id":"456"}"#;
        let r: AuthTokenWithUserId = serde_json::from_str(json).unwrap();
        assert_eq!(r.token, "xyz");
        assert_eq!(r.user_id, "456");
    }
}
