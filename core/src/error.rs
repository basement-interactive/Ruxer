use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Errors returned by the Fluxer client.
#[derive(Debug, Error)]
pub enum Error {
    /// A network or HTTP transport failure.
    #[error("http transport error: {0}")]
    Http(#[from] reqwest::Error),
    /// The server returned a non-2xx response. Holds the Fluxer error code (when present),
    /// the human message, and the raw response body for debugging.
    #[error("api error {code}: {message}")]
    Api {
        code: String,
        message: String,
        status: reqwest::StatusCode,
        body: String,
    },
    /// The response body could not be parsed into the expected type.
    #[error("decode error: {0}")]
    Decode(#[from] serde_json::Error),
    /// A WebSocket / gateway level failure.
    #[error("gateway error: {0}")]
    Gateway(String),
    /// A URL parsing or construction failure.
    #[error("url error: {0}")]
    Url(#[from] url::ParseError),
}

/// Convenience alias used throughout the crate.
pub type Result<T> = std::result::Result<T, Error>;

/// Server-side error envelope, as documented by the Fluxer OpenAPI spec.
/// Public so the auth module's anonymous login flow can parse error bodies
/// from the `/auth/*` endpoints without going through the rate-limited
/// [`crate::http::Http`] transport.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub errors: Vec<serde_json::Value>,
}
