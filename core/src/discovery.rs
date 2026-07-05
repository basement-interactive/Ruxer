//! Instance discovery via `/.well-known/fluxer`.
//!
//! A Fluxer instance advertises its API, gateway, media, admin, and static CDN
//! endpoints (plus feature flags) in a `/.well-known/fluxer` document at its
//! root. `login` resolves this document from the user-supplied instance domain
//! before building the client, so the REST base URL and gateway URL are driven
//! by discovery rather than hard-coded. When discovery fails or the document
//! is missing/partial, callers fall back to `DEFAULT_API_BASE` /
//! `DEFAULT_GATEWAY_URL`.

use serde::{Deserialize, Serialize};

/// The full set of endpoints advertised by a Fluxer instance's
/// `/.well-known/fluxer` document. Every field is optional so a partial
/// document (e.g. one that only advertises `media`) still resolves.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Endpoints {
    /// The web-client REST API base (origin-checked; e.g.
    /// `https://web.fluxer.app/api`). Browser clients send an allowed
    /// `Origin` header; non-browser clients should prefer `api_public`.
    #[serde(default)]
    pub api: Option<String>,
    /// The public REST API base (no origin check; e.g.
    /// `https://api.fluxer.app`). Non-browser clients (Tauri backends,
    /// bots, CLI tools) should use this instead of `api` to avoid
    /// `INVALID_API_ORIGIN` rejections.
    #[serde(default)]
    pub api_public: Option<String>,
    /// The WebSocket gateway URL (e.g. `wss://gateway.fluxer.app`).
    #[serde(default)]
    pub gateway: Option<String>,
    /// The media CDN base for user content (avatars, attachments).
    #[serde(default)]
    pub media: Option<String>,
    /// The admin API base.
    #[serde(default)]
    pub admin: Option<String>,
    /// The static CDN base for default assets (default avatars, etc.).
    #[serde(default)]
    pub static_cdn: Option<String>,
    /// Feature flags the instance advertises.
    #[serde(default)]
    pub features: Vec<String>,
}

impl Endpoints {
    /// Pick the best REST API base for a **non-browser** client (Tauri
    /// backend, bot, CLI). Prefers `api_public` (no `Origin` header check)
    /// and falls back to `api`. Returns `None` when the document advertises
    /// neither.
    pub fn api_base_for_backend(&self) -> Option<&str> {
        self.api_public
            .as_deref()
            .or(self.api.as_deref())
    }
}

/// Resolve the endpoints for a Fluxer instance by fetching its
/// `/.well-known/fluxer` document. `instance` is the bare host
/// (e.g. `fluxer.app`); the document is fetched over HTTPS.
///
/// Returns `None` when the fetch fails, the response is not 2xx, the body is not
/// valid JSON, or the document advertises no endpoints at all.
pub async fn resolve(instance: &str) -> Option<Endpoints> {
    let instance = instance.trim_start_matches("https://").trim_start_matches("http://");
    let instance = instance.trim_end_matches('/');
    let url = format!("https://{instance}/.well-known/fluxer");
    fetch_well_known(&url).await
}

/// Resolve endpoints from an existing API base URL (e.g. one supplied as an
/// explicit override). Derives the instance host by stripping a leading
/// `api.` subdomain and any versioned path segment, then fetches the
/// well-known document. Used by callers that already have a built client and
/// want to re-resolve endpoints (e.g. the `resolve_endpoints` Tauri command).
pub async fn resolve_from_api_base(api_base: &str) -> Option<Endpoints> {
    let parsed = url::Url::parse(api_base).ok()?;
    let host = parsed.host_str()?;
    // Strip a leading "api." subdomain to get the instance root host.
    let instance = host.strip_prefix("api.").unwrap_or(host);
    let url = format!("https://{instance}/.well-known/fluxer");
    fetch_well_known(&url).await
}

async fn fetch_well_known(url: &str) -> Option<Endpoints> {
    crate::init_crypto();
    let client = reqwest::Client::builder().build().ok()?;
    let resp = client.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let v: serde_json::Value = resp.json().await.ok()?;
    // The document nests endpoint URLs under "endpoints"; features live at the
    // top level. Tolerate either a nested or flat shape.
    let ep = v.pointer("/endpoints").unwrap_or(&v);
    let api = ep.pointer("/api").and_then(|m| m.as_str()).map(String::from);
    let api_public = ep
        .pointer("/api_public")
        .and_then(|m| m.as_str())
        .map(String::from);
    let gateway = ep.pointer("/gateway").and_then(|m| m.as_str()).map(String::from);
    let media = ep.pointer("/media").and_then(|m| m.as_str()).map(String::from);
    let admin = ep.pointer("/admin").and_then(|m| m.as_str()).map(String::from);
    let static_cdn = ep
        .pointer("/static_cdn")
        .and_then(|m| m.as_str())
        .map(String::from);
    let features: Vec<String> = v
        .pointer("/features")
        .and_then(|f| f.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    if api.is_none()
        && api_public.is_none()
        && gateway.is_none()
        && media.is_none()
        && admin.is_none()
        && static_cdn.is_none()
        && features.is_empty()
    {
        return None;
    }
    Some(Endpoints {
        api,
        api_public,
        gateway,
        media,
        admin,
        static_cdn,
        features,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoints_default_is_empty() {
        let e = Endpoints::default();
        assert!(e.api.is_none());
        assert!(e.features.is_empty());
    }
}