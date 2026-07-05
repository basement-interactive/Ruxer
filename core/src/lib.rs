//! A minimal asynchronous Rust client for the [Fluxer](https://fluxer.app) API.
//!
//! Fluxer is a free, open-source instant messaging and VoIP chat app. This crate
//! currently covers the parts needed to build bots and basic clients that interact
//! with guilds, direct messages, messages, and reactions. Voice/video is out of
//! scope for now.
//!
//! # Quick start
//!
//! ```no_run
//! use fluxer::{FluxerClient, AuthToken};
//!
//! # #[tokio::main] async fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let client = FluxerClient::builder(AuthToken::bot("your.bot.token"))
//!     .build()?;
//!
//! let me = client.users().current().await?;
//! println!("logged in as {}#{}", me.user.username, me.user.discriminator);
//! # Ok(())
//! # }
//! ```
//!
//! # Authentication
//!
//! Fluxer accepts three token shapes, all sent via the `Authorization` header:
//!
//! | Token kind | Header value            | Typical use        |
//! |-----------|-------------------------|--------------------|
//! | Bot       | `Bot <token>`           | Bot applications   |
//! | Session   | `<token>`               | User sessions      |
//! | Bearer    | `Bearer <token>`        | OAuth2 access tokens |
//!
//! Construct the appropriate [`AuthToken`] variant for your flow.

#![deny(missing_debug_implementations)]

pub mod api;
pub mod auth;
pub mod client;
pub mod discovery;
pub mod error;
pub mod gateway;
pub mod http;
pub mod models;
pub mod ratelimit;

pub use api::reactions::ReactionTarget;
pub use auth::{AuthToken, AuthTokenWithUserId, AuthLoginResponse, Login, LoginOutcome, MfaChallenge};
pub use client::{FluxerClient, FluxerClientBuilder};
pub use discovery::Endpoints as DiscoveryEndpoints;
pub use error::{Error, Result};
pub use models::*;

/// Install the `ring` crypto provider as rustls's process-level default.
///
/// rustls 0.23 no longer picks a crypto backend automatically; both the REST
/// client (reqwest) and the gateway (tokio-tungstenite) use rustls with
/// `rustls-tls-webpki-roots`, which pulls in `ring` via `rustls-webpki` but
/// does not install it as the default provider. Without this call, the
/// gateway's WebSocket handshake panics with "Could not automatically
/// determine the process-level CryptoProvider". We install it once at first
/// use via a `OnceLock` so repeated calls are cheap.
fn ensure_rustls_provider() {
    use std::sync::OnceLock;
    static INSTALLED: OnceLock<()> = OnceLock::new();
    INSTALLED.get_or_init(|| {
        // `ring` is a transitive dep of rustls-webpki (via webpki-roots).
        // Install it as the process-default crypto provider. If a caller
        // already installed one (or built reqwest with a feature that does),
        // this is a no-op.
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

/// Ensure the rustls crypto provider is installed before any TLS use. Safe
/// to call multiple times. Public so binary callers (the Tauri backend) can
/// invoke it early in `main`.
pub fn init_crypto() {
    ensure_rustls_provider();
}
