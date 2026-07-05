//! Low-level HTTP transport for the Fluxer REST API.
//!
//! Every request flows through [`Http::execute_keyed`], which:
//! 1. Acquires a slot from the shared [`RateLimiter`] for the request's route
//!    key (blocking if the per-route or global bucket is exhausted).
//! 2. Sends the request.
//! 3. Feeds the response status + headers back to the limiter so it can
//!    refresh the bucket state or apply a `Retry-After` pause.
//! 4. On a 429, retries once after the limiter's pause (the limiter's bucket
//!    state is updated by step 3, so the retry's `acquire` will block until
//!    the window resets).
//! 5. Decodes the body (or returns a structured [`Error::Api`]).
//!
//! Route keys are derived from `(method, major-params path)` so two different
//! channels get separate buckets. See [`crate::ratelimit`] for the collapse
//! rules.

use crate::auth::AuthToken;
use crate::error::{Error, ErrorBody, Result};
use crate::ratelimit::{RateLimiter, RouteKey};
use reqwest::{Client, Method, RequestBuilder, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;

/// The default production REST base URL.
pub const DEFAULT_API_BASE: &str = "https://api.fluxer.app/v1";

/// Wraps a [`reqwest::Client`] with the auth token, base URL, and a shared
/// rate limiter used by every call.
#[derive(Clone)]
pub struct Http {
    client: Client,
    auth: AuthToken,
    base_url: String,
    ratelimiter: RateLimiter,
}

impl std::fmt::Debug for Http {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Http")
            .field("base_url", &self.base_url)
            .finish_non_exhaustive()
    }
}

impl Http {
    /// Build a new HTTP transport. You usually do not call this directly; use
    /// [`crate::FluxerClientBuilder`] instead.
    pub fn new(auth: AuthToken, base_url: impl Into<String>, client: Client) -> Self {
        Self {
            client,
            auth,
            base_url: base_url.into(),
            ratelimiter: RateLimiter::new(),
        }
    }

    /// The base URL this transport sends requests to.
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// The underlying reqwest client (pooled connections, TLS config). Exposed
    /// so callers building requests against a different base URL (e.g. the
    /// media endpoint) can still reuse the connection pool + auth headers.
    pub fn client(&self) -> &Client {
        &self.client
    }

    /// The credential used to authenticate requests.
    pub fn auth_token(&self) -> &AuthToken {
        &self.auth
    }

    /// The shared rate limiter. Exposed so callers that build custom requests
    /// (e.g. multipart uploads) can still acquire a slot.
    pub fn ratelimiter(&self) -> &RateLimiter {
        &self.ratelimiter
    }

    /// Begin building a request against the given path (no leading slash required).
    pub fn request(&self, method: Method, path: &str) -> RequestBuilder {
        let url = format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            path.trim_start_matches('/')
        );
        self.client
            .request(method, &url)
            .header("Authorization", self.auth.header_value())
            .header(
                "User-Agent",
                concat!("fluxer-rust/", env!("CARGO_PKG_VERSION")),
            )
    }

    /// Execute a `GET` and decode the JSON body into `T`.
    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        self.send_empty(Method::GET, path).await
    }

    /// Execute a `DELETE` with no body and decode the JSON response (or `()` on 204).
    pub async fn delete<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        self.send_empty(Method::DELETE, path).await
    }

    /// Execute a request with a JSON body and decode the response into `T`.
    pub async fn send_json<B: Serialize, T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: &B,
    ) -> Result<T> {
        // Capture the body bytes + path once so a 429 retry can rebuild the
        // request without re-serializing (and without requiring `B: Clone`).
        let body_bytes = serde_json::to_vec(body).map_err(Error::Decode)?;
        let path_owned = path.to_string();
        let rebuild = {
            let body_bytes = body_bytes.clone();
            let path_owned = path_owned.clone();
            let method = method.clone();
            move |http: &Http| {
                http.request(method.clone(), &path_owned)
                    .header(reqwest::header::CONTENT_TYPE, "application/json")
                    .body(body_bytes.clone())
            }
        };
        let builder = self
            .request(method.clone(), path)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body_bytes);
        self.execute_keyed(method, path, builder, Some(Box::new(rebuild))).await
    }

    /// Execute a request with no body and decode the response into `T`.
    pub async fn send_empty<T: DeserializeOwned>(&self, method: Method, path: &str) -> Result<T> {
        let path_owned = path.to_string();
        let rebuild = {
            let path_owned = path_owned.clone();
            let method = method.clone();
            move |http: &Http| http.request(method.clone(), &path_owned)
        };
        let builder = self.request(method.clone(), path);
        self.execute_keyed(method, path, builder, Some(Box::new(rebuild))).await
    }

    /// Run a prebuilt [`RequestBuilder`] and decode the response. The caller
    /// must supply the `method` and `path` used to build it so the rate
    /// limiter can key the route correctly. Callers that want 429 auto-retry
    /// must use [`Self::execute_retryable`] instead; this entry point does not
    /// know how to rebuild the request, so a 429 is surfaced as an error.
    pub async fn execute<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        builder: RequestBuilder,
    ) -> Result<T> {
        self.execute_keyed(method, path, builder, None).await
    }

    /// Like [`Self::execute`] but with a rebuild closure so a 429 can be
    /// retried once after `retry-after`. Used by multipart uploads where the
    /// caller has the raw bytes needed to reconstruct the form.
    pub async fn execute_retryable<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        builder: RequestBuilder,
        rebuild: impl Fn(&Http) -> RequestBuilder + Send + 'static,
    ) -> Result<T> {
        self.execute_keyed(method, path, builder, Some(Box::new(rebuild))).await
    }

    /// Inner send-and-decode loop with rate-limit awareness. On a 429 we
    /// consume the body, let the limiter's `record` update the bucket state
    /// (which sets the retry-after deadline), then — when a `rebuild` closure
    /// is available — re-acquire a slot (which blocks until the window resets)
    /// and retry exactly once. Without `rebuild` we surface the 429 as an
    /// error, matching the pre-retry behavior.
    async fn execute_keyed<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        builder: RequestBuilder,
        rebuild: Option<Box<dyn Fn(&Http) -> RequestBuilder + Send>>,
    ) -> Result<T> {
        let key = RouteKey::new(method.clone(), path);

        // First attempt.
        let guard = self.ratelimiter.acquire(key.clone()).await;
        let response = builder.send().await?;
        let status = response.status();
        let headers = response.headers().clone();
        guard.record(status, &headers).await;

        if status == StatusCode::TOO_MANY_REQUESTS {
            // Consume the body to free the connection before we (maybe) retry.
            let _ = response.bytes().await;

            if let Some(rebuild) = rebuild {
                tracing::debug!(status = %status, path = %path, "rate limited, retrying after pause");
                // Re-acquire a slot — `record` has updated the bucket so this
                // blocks until the retry-after deadline, then dispatches.
                let guard = self.ratelimiter.acquire(key.clone()).await;
                let builder2 = rebuild(self);
                let response2 = builder2.send().await?;
                let status2 = response2.status();
                let headers2 = response2.headers().clone();
                guard.record(status2, &headers2).await;

                if status2 == StatusCode::NO_CONTENT {
                    return serde_json::from_value(serde_json::Value::Null).map_err(Error::Decode);
                }
                let bytes = response2.bytes().await?;
                if status2.is_success() {
                    return serde_json::from_slice::<T>(&bytes).map_err(Error::Decode);
                }
                let body_text = String::from_utf8_lossy(&bytes).to_string();
                return Err(Self::api_error(status2, &bytes, body_text));
            }

            // No rebuild closure — surface the 429. The bucket state has been
            // updated, so the next call from any task will block until the
            // window resets.
            return Err(Error::Api {
                code: "RATE_LIMITED".into(),
                message: "rate limited by server; retry after the bucket resets".into(),
                status,
                body: String::new(),
            });
        }

        if status == StatusCode::NO_CONTENT {
            // For 204 endpoints the caller is expected to use a unit-friendly
            // decoder; if they asked for a real type we still try empty-body parse.
            return serde_json::from_value(serde_json::Value::Null).map_err(Error::Decode);
        }

        let bytes = response.bytes().await?;
        if status.is_success() {
            return serde_json::from_slice::<T>(&bytes).map_err(Error::Decode);
        }

        // Try to parse the Fluxer error envelope; fall back to a raw body.
        let body_text = String::from_utf8_lossy(&bytes).to_string();
        Err(Self::api_error(status, &bytes, body_text))
    }

    /// Build an [`Error::Api`] from a non-2xx response, parsing the Fluxer
    /// envelope when possible and falling back to the raw body text.
    fn api_error(status: StatusCode, bytes: &[u8], body_text: String) -> Error {
        if let Ok(err) = serde_json::from_slice::<ErrorBody>(bytes) {
            Error::Api {
                code: err.code,
                message: err.message,
                status,
                body: body_text,
            }
        } else {
            Error::Api {
                code: "UNKNOWN".into(),
                message: body_text.clone(),
                status,
                body: body_text,
            }
        }
    }
}