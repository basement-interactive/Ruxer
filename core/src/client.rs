//! The top-level [`FluxerClient`] and its builder.

use crate::api::Api;
use crate::auth::AuthToken;
use crate::error::Result;
use crate::gateway::Gateway;
use crate::http::{self, Http};
use crate::models::GatewayBot;
use reqwest::Client;

/// The default gateway URL used when none is supplied explicitly. The canonical
/// source for the gateway URL is `GET /gateway/bot`, which is also available via
/// [`FluxerClient::gateway_bot`].
pub const DEFAULT_GATEWAY_URL: &str = "wss://gateway.fluxer.app";

/// The entry point for talking to the Fluxer API.
///
/// Holds a reusable [`reqwest::Client`] (so connections are pooled) and the auth
/// token. Resource APIs are accessed through the [`Self::users`], [`Self::guilds`],
/// [`Self::channels`], [`Self::messages`], and [`Self::reactions`] accessors.
#[derive(Clone)]
pub struct FluxerClient {
    http: Http,
    api: Api,
}

impl std::fmt::Debug for FluxerClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FluxerClient")
            .field("http", &self.http)
            .finish_non_exhaustive()
    }
}

impl FluxerClient {
    /// Begin building a client with the given token and production defaults.
    pub fn builder(auth: AuthToken) -> FluxerClientBuilder {
        FluxerClientBuilder::new(auth)
    }

    /// Users, DMs, and relationships.
    pub fn users(&self) -> crate::api::users::Users {
        self.api.users()
    }

    /// Guilds, channels, members, roles, emojis.
    pub fn guilds(&self) -> crate::api::guilds::Guilds {
        self.api.guilds()
    }

    /// Invite lookup + acceptance.
    pub fn invites(&self) -> crate::api::invites::Invites {
        self.api.invites()
    }

    /// Channel metadata, typing, pins, group DM recipients.
    pub fn channels(&self) -> crate::api::channels::Channels {
        self.api.channels()
    }

    /// Message list / send / edit / delete / bulk delete.
    pub fn messages(&self) -> crate::api::messages::Messages {
        self.api.messages()
    }

    /// Reactions add/remove and reaction user listings.
    pub fn reactions(&self) -> crate::api::reactions::Reactions {
        self.api.reactions()
    }

    /// Abuse reports (message/user/guild).
    pub fn reports(&self) -> crate::api::reports::Reports {
        self.api.reports()
    }

    /// Message search across channels and guilds.
    pub fn search(&self) -> crate::api::search::Search {
        self.api.search()
    }

    /// GIF search + trending (proxied to the Klipy GIF provider).
    pub fn gifs(&self) -> crate::api::gifs::Gifs {
        self.api.gifs()
    }

    /// Discovery browser for public communities.
    pub fn discovery(&self) -> crate::api::discovery::Discovery {
        self.api.discovery()
    }

    /// `GET /gateway/bot` — fetch the gateway URL and identify rate limits.
    pub async fn gateway_bot(&self) -> Result<GatewayBot> {
        self.http.get("gateway/bot").await
    }

    /// Resolve the gateway URL to connect to, preferring the one advertised by
    /// `GET /gateway/bot` and falling back to a sensible default.
    pub async fn gateway_url(&self) -> Result<String> {
        match self.gateway_bot().await {
            Ok(info) => Ok(info.url),
            Err(_) => Ok(DEFAULT_GATEWAY_URL.to_string()),
        }
    }

    /// Open a WebSocket gateway connection. Returns a [`GatewayHandle`] that you can
    /// use to spawn the event loop and read incoming events.
    ///
    /// See [`Gateway`] for the supported event subset.
    pub fn gateway(&self, url: impl Into<String>) -> Gateway {
        Gateway::new(url, self.http.clone())
    }

    /// Borrow the underlying HTTP transport (advanced use).
    pub fn http(&self) -> &Http {
        &self.http
    }
}

/// Builder for [`FluxerClient`].
#[derive(Debug)]
pub struct FluxerClientBuilder {
    auth: AuthToken,
    base_url: String,
    client: Option<Client>,
}

impl FluxerClientBuilder {
    fn new(auth: AuthToken) -> Self {
        Self {
            auth,
            base_url: http::DEFAULT_API_BASE.to_string(),
            client: None,
        }
    }

    /// Override the REST API base URL (e.g. for a self-hosted Fluxer instance).
    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = url.into();
        self
    }

    /// Supply a custom `reqwest::Client` (e.g. with a proxy or custom TLS config).
    pub fn http_client(mut self, client: Client) -> Self {
        self.client = Some(client);
        self
    }

    /// Finalize the client.
    pub fn build(self) -> Result<FluxerClient> {
        // F.24: apply a per-request timeout so a wedged server or a hung
        // connection doesn't hang the UI forever. 30s is a generous default
        // that still beats an indefinite stall; long uploads (attachments)
        // go through `execute_retryable` which builds its own builders on the
        // same pooled client and can opt out per-call if needed.
        let client = self.client.unwrap_or_else(|| {
            reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("failed to build reqwest client with timeout")
        });
        let http = Http::new(self.auth, self.base_url, client);
        let api = Api(http.clone());
        Ok(FluxerClient { http, api })
    }
}
