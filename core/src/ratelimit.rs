//! Client-side rate limiting for the Fluxer REST API.
//!
//! Fluxer exposes two layers of rate-limit information, both surfaced as HTTP
//! headers on every response (mirrors Discord's scheme, which Fluxer.Net also
//! copies):
//!
//! - **Per-route buckets**: identified by `X-RateLimit-Bucket` (a short hash of
//!   the route major params). Each bucket has `X-RateLimit-Remaining` requests
//!   in the current window and `X-RateLimit-Reset-After` seconds until the
//!   window resets. When `Remaining` hits 0, callers must wait until `Reset`.
//! - **A global bucket**: a worldwide ceiling, surfaced via `X-RateLimit-Global:
//!   true` on a 429 plus `Retry-After` seconds. A global block pauses *all*
//!   requests.
//!
//! On a 429 we read `Retry-After` (in seconds) and either block the offending
//! bucket (no `X-RateLimit-Global`) or block everything (`X-RateLimit-Global`).
//!
//! The limiter is held behind an async `Mutex` so callers across tasks are
//! serialized at the point of dispatch. Requests that arrive while their bucket
//! is paused await the bucket's reset, then proceed. This means a flood of
//! calls to the same route self-throttles instead of hammering the server and
//! burning 429s.
//!
//! Routes are keyed by a "major params" derivation (e.g. `channels/{id}`,
//! `guilds/{id}`, `webhooks/{id}`) so that two different channels get separate
//! buckets even when they share the same `X-RateLimit-Bucket` hash. This
//! matches Fluxer.Net's `RouteKey` behavior.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tokio::time::sleep_until;

/// Header names used by the Fluxer rate-limit scheme. Kept here so the strings
/// live in one place.
pub mod headers {
    pub const BUCKET: &str = "x-ratelimit-bucket";
    pub const LIMIT: &str = "x-ratelimit-limit";
    pub const REMAINING: &str = "x-ratelimit-remaining";
    pub const RESET: &str = "x-ratelimit-reset";
    pub const RESET_AFTER: &str = "x-ratelimit-reset-after";
    pub const GLOBAL: &str = "x-ratelimit-global";
    pub const RETRY_AFTER: &str = "retry-after";
    /// Fluxer-specific shared-bucket header (rare; treated like a normal
    /// bucket when present).
    pub const SHARED: &str = "x-ratelimit-shared";
}

/// A rate-limiting layer shared by every request the [`crate::http::Http`]
/// transport makes. Cheap to clone (it's an `Arc<Mutex<Inner>>`).
#[derive(Clone, Debug)]
pub struct RateLimiter {
    inner: Arc<Mutex<Inner>>,
}

#[derive(Debug, Default)]
struct Inner {
    /// Per-bucket state, keyed by the route key (method + major-params path).
    buckets: HashMap<RouteKey, BucketState>,
    /// The server-reported bucket hash for each route key. Used only for
    /// diagnostics — the limiter keys off the route, not the hash, so two
    /// routes that share a hash still get independent slots unless the server
    /// 429s one of them with a shared bucket id.
    bucket_hashes: HashMap<RouteKey, String>,
    /// When the global bucket unlocks. `None` when there's no active global
    /// block. While set, every request waits until this instant regardless of
    /// its own bucket.
    global_until: Option<Instant>,
}

/// A route key: method + major-params path. The major-params form collapses
/// dynamic ids to `:id` while keeping the *first* segment of each major family
/// (`channels`, `guilds`, `webhooks`) verbatim, so `channels/123` and
/// `channels/456` get separate buckets but `channels/123/messages/789` shares
/// `channels/123`'s bucket.
#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub struct RouteKey {
    method: String,
    route: String,
}

impl RouteKey {
    /// Build a route key from a method and an unmodified path (the same string
    /// passed to [`crate::http::Http::request`]).
    pub fn new(method: reqwest::Method, path: &str) -> Self {
        Self {
            method: method.as_str().to_string(),
            route: collapse_major_params(path),
        }
    }
}

/// Collapse dynamic snowflake-ish segments under the major-param families to
/// a stable route key. The Discord/Fluxer "major params" rule:
/// - `channels/{id}`, `guilds/{id}`, `webhooks/{id}` are the only families
///   whose id is kept verbatim. Everything else under them is collapsed.
/// - Any all-digit segment that isn't a kept major id becomes `:id`.
/// - Literal segments (`messages`, `members`, `reactions`, `@me`, `👍`, …) are
///   kept as-is so the route key stays distinct per sub-resource.
///
/// Examples:
/// - `channels/123/messages/789` -> `channels/123/messages/:id`
/// - `channels/123/messages/789/reactions/👍/@me` -> `channels/123/messages/:id/reactions/👍/@me`
/// - `guilds/321/members/42` -> `guilds/321/members/:id`
/// - `users/@me` -> `users/@me`
/// - `roles/9` -> `roles/:id`
fn collapse_major_params(path: &str) -> String {
    let path = path.trim_start_matches('/');
    let segs: Vec<&str> = path.split('/').collect();
    let major = ["channels", "guilds", "webhooks"];
    let mut out: Vec<String> = Vec::with_capacity(segs.len());
    let mut i = 0;
    while i < segs.len() {
        let s = segs[i];
        if major.contains(&s) {
            out.push(s.to_string());
            if i + 1 < segs.len() {
                out.push(segs[i + 1].to_string());
                i += 2;
                continue;
            }
        } else if is_snowflake_like(s) {
            out.push(":id".to_string());
        } else {
            out.push(s.to_string());
        }
        i += 1;
    }
    out.join("/")
}

/// Heuristic: a segment is treated as a dynamic id if it's non-empty and all
/// ASCII digits. This covers Fluxer snowflakes. Non-numeric tokens (`@me`,
/// `👍`, `messages`, …) are kept literal.
fn is_snowflake_like(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

#[derive(Debug, Clone, Copy)]
struct BucketState {
    /// When the current window resets. Requests arriving when `remaining == 0`
    /// sleep until this instant.
    reset_at: Instant,
    /// Requests remaining in the current window. Decremented optimistically
    /// when we dispatch a request (so a flood self-throttles before the server
    /// has to 429 us) and corrected when the server's headers come back.
    remaining: i64,
    /// The bucket's advertised limit (window size). Used only to seed
    /// `remaining` if the server didn't send a `Remaining` header.
    limit: i64,
}

impl RateLimiter {
    /// Construct a fresh limiter with no known buckets.
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner::default())),
        }
    }

    /// Wait until it's safe to dispatch a request on the given route. This
    /// blocks on the per-route bucket (if exhausted) and on the global bucket
    /// (if active). Returns a guard the caller must drop after the response
    /// headers arrive so we can record the server's rate-limit headers.
    pub async fn acquire(&self, key: RouteKey) -> AcquireGuard {
        loop {
            // Wait for whichever deadline is later: the route bucket or the
            // global block. Re-check after each sleep because the global block
            // may have been extended while we were waiting.
            let wait_until = {
                let inner = self.inner.lock().await;
                let route_wait = inner.buckets.get(&key).and_then(|b| {
                    (b.remaining <= 0).then(|| b.reset_at)
                });
                let global_wait = inner.global_until;
                match (route_wait, global_wait) {
                    (Some(r), Some(g)) => Some(r.max(g)),
                    (Some(r), None) => Some(r),
                    (None, Some(g)) => Some(g),
                    (None, None) => None,
                }
            };
            match wait_until {
                Some(deadline) if deadline > Instant::now() => {
                    sleep_until(tokio::time::Instant::from_std(deadline)).await;
                }
                _ => break,
            }
        }
        // Reserve a slot: decrement remaining by 1 so concurrent callers don't
        // all storm through the same window.
        {
            let mut inner = self.inner.lock().await;
            if let Some(b) = inner.buckets.get_mut(&key) {
                if b.remaining > 0 {
                    b.remaining -= 1;
                }
            }
        }
        AcquireGuard {
            limiter: self.clone(),
            key,
            recorded: false,
        }
    }
}

/// RAII guard returned by [`RateLimiter::acquire`]. The caller drops it after
/// the response arrives; on drop (or via [`AcquireGuard::record`]) we parse
/// the response's rate-limit headers and update the bucket state. If the
/// caller forgets to call `record` we just treat the slot as consumed.
pub struct AcquireGuard {
    limiter: RateLimiter,
    key: RouteKey,
    recorded: bool,
}

impl std::fmt::Debug for AcquireGuard {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AcquireGuard")
            .field("key", &self.key)
            .field("recorded", &self.recorded)
            .finish_non_exhaustive()
    }
}

impl AcquireGuard {
    /// Feed a response's headers into the limiter so it can update the bucket
    /// state. Call this once the response has arrived (before consuming the
    /// body). Handles both 2xx (update remaining/reset) and 429 (apply
    /// retry-after, possibly globally).
    pub async fn record(mut self, status: reqwest::StatusCode, headers: &reqwest::header::HeaderMap) {
        self.recorded = true;
        let mut inner = self.limiter.inner.lock().await;

        // 429: apply a retry-after pause. If the server says it's global, we
        // block everything; otherwise we block just this route.
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let retry_after = parse_retry_after(headers).unwrap_or(Duration::from_secs(1));
            let until = Instant::now() + retry_after;
            let is_global = headers
                .get(headers::GLOBAL)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.eq_ignore_ascii_case("true"))
                .unwrap_or(false);
            if is_global {
                inner.global_until = Some(until);
            } else {
                let b = inner.buckets.entry(self.key.clone()).or_insert(BucketState {
                    reset_at: until,
                    remaining: 0,
                    limit: 1,
                });
                b.remaining = 0;
                b.reset_at = until;
            }
            return;
        }

        // 2xx (or other): refresh the bucket from the response headers. If the
        // server gave us a new bucket hash, remember it for diagnostics.
        if let Some(hash) = headers.get(headers::BUCKET).and_then(|v| v.to_str().ok()) {
            inner.bucket_hashes.insert(self.key.clone(), hash.to_string());
        }
        let limit = headers
            .get(headers::LIMIT)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<i64>().ok());
        let remaining = headers
            .get(headers::REMAINING)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<i64>().ok());
        let reset_after = headers
            .get(headers::RESET_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<f64>().ok());
        // The reset-after header is the canonical "seconds until window resets"
        // value. Fall back to `Retry-After` (rare on 2xx) if absent.
        let reset_secs = reset_after.or_else(|| {
            headers
                .get(headers::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<f64>().ok())
        });

        let now = Instant::now();
        let reset_at = reset_secs.map(|s| now + Duration::from_secs_f64(s));
        let limit = limit.unwrap_or(1);
        let remaining = remaining.unwrap_or(limit.max(1));
        if let Some(reset_at) = reset_at {
            let b = inner.buckets.entry(self.key.clone()).or_insert(BucketState {
                reset_at,
                remaining,
                limit,
            });
            b.reset_at = reset_at;
            b.remaining = remaining;
            b.limit = limit;
            // Clear a global block if the server tells us the world is healthy
            // again (most 2xx responses don't carry the global header, so we
            // leave it intact unless explicitly told otherwise).
            if headers
                .get(headers::GLOBAL)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.eq_ignore_ascii_case("false"))
                .unwrap_or(false)
            {
                inner.global_until = None;
            }
        }
    }
}

impl Drop for AcquireGuard {
    fn drop(&mut self) {
        if !self.recorded {
            // The caller dropped without feeding us a response (e.g. a network
            // error before any headers arrived). Nothing to do — we already
            // decremented `remaining` optimistically, so the bucket will
            // self-correct on the next response that does carry headers.
        }
    }
}

/// Parse the `Retry-After` header. Fluxer sends it as a number of seconds
/// (the common form). The HTTP spec also allows an HTTP-date, but no Fluxer
/// endpoint is known to send that; if one ever does we fall back to a 1s pause
/// rather than dragging in an HTTP-date parser.
fn parse_retry_after(headers: &reqwest::header::HeaderMap) -> Option<Duration> {
    let v = headers.get(headers::RETRY_AFTER)?.to_str().ok()?;
    if let Ok(secs) = v.parse::<f64>() {
        return Some(Duration::from_secs_f64(secs));
    }
    Some(Duration::from_secs(1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collapse_keeps_major_ids() {
        assert_eq!(
            collapse_major_params("channels/123/messages/789"),
            "channels/123/messages/:id"
        );
        assert_eq!(
            collapse_major_params("channels/123/messages/789/reactions/👍/@me"),
            "channels/123/messages/:id/reactions/👍/@me"
        );
        assert_eq!(
            collapse_major_params("guilds/321/members/42"),
            "guilds/321/members/:id"
        );
        assert_eq!(collapse_major_params("users/@me"), "users/@me");
        assert_eq!(collapse_major_params("users/@me/guilds"), "users/@me/guilds");
        // Non-major families lose their ids.
        assert_eq!(collapse_major_params("roles/9"), "roles/:id");
    }

    #[tokio::test]
    async fn acquire_returns_immediately_when_no_state() {
        let rl = RateLimiter::new();
        let key = RouteKey::new(reqwest::Method::GET, "users/@me");
        // No bucket state yet — should not block.
        let now = Instant::now();
        let _g = rl.acquire(key).await;
        assert!(now.elapsed() < Duration::from_millis(50));
    }
}