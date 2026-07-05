//! Image helpers: endpoint discovery and a simple in-memory cache so the
//! frontend can request avatar/emoji/icon bytes through Tauri (avoiding CORS
//! and the need to expose the token to the webview).
//!
//! Two caching layers:
//!   1. An on-disk temp cache (`media_cache`) keyed by URL hash, served to the
//!      webview via the `asset:` protocol — this is the primary path for
//!      avatars/icons/images/videos. It survives navigation + process restarts
//!      and gives the webview native browser-level caching for free.
//!   2. A small in-memory cache of bytes (used by `image_proxy`) as a fast
//!      data-URI fallback for callers that want an inlined blob.

use crate::{ApiError, CmdResult, Endpoints};
use fluxer::FluxerClient;

/// A cached image: bytes + inferred content type.
pub struct CachedImage {
    pub bytes: Vec<u8>,
    pub content_type: String,
}

/// Discover the instance's endpoints (api, gateway, media, admin, static_cdn,
/// features) from its `/.well-known/fluxer` document, via `core::discovery`.
/// Returns `None` when discovery fails or the document advertises nothing.
pub async fn resolve_endpoints(client: &FluxerClient) -> Option<Endpoints> {
    let base = client.http().base_url();
    let ep = fluxer::discovery::resolve_from_api_base(base).await?;
    Some(Endpoints {
        api: ep.api,
        api_public: ep.api_public,
        gateway: ep.gateway,
        media: ep.media,
        admin: ep.admin,
        static_cdn: ep.static_cdn,
        features: ep.features,
    })
}

/// Fetch an image by URL and return it as a data URI (base64). Used by callers
/// that need an inlined blob. Served from the on-disk cache when present; falls
/// back to fetching + caching. Bytes are also mirrored into the in-memory map
/// so repeat calls in the same session skip disk too.
pub async fn proxy(
    state: &crate::AppState,
    url: &str,
) -> CmdResult<Option<String>> {
    // Fast path: in-memory map already has the bytes for this URL.
    {
        let map = state.images.lock().unwrap();
        if let Some(cached) = map.get(url) {
            return Ok(Some(data_uri(&cached.bytes, &cached.content_type)));
        }
    }

    // Disk cache: if we've fetched this URL before (this session or a prior
    // one), read the bytes off disk instead of hitting the network. Both the
    // cache lookup and the file read run on the blocking pool — this path
    // runs once per rendered avatar/icon/emoji/attachment, so keeping it off
    // the async worker thread avoids stalling other in-flight commands.
    let (bytes, content_type) = match crate::media_cache::get_async(url).await {
        Some(entry) => {
            let bytes = tokio::fs::read(&entry.path).await.unwrap_or_default();
            if bytes.is_empty() {
                fetch_and_cache(state, url).await?
            } else {
                (bytes, entry.content_type)
            }
        }
        None => fetch_and_cache(state, url).await?,
    };

    // Mirror into the in-memory map for next time.
    {
        let mut map = state.images.lock().unwrap();
        // Bounded cache: drop oldest entries if we exceed 256 images.
        if map.len() > 256 {
            if let Some(key) = map.keys().next().cloned() {
                map.remove(&key);
            }
        }
        map.insert(
            url.to_string(),
            CachedImage {
                bytes: bytes.clone(),
                content_type: content_type.clone(),
            },
        );
    }

    Ok(Some(data_uri(&bytes, &content_type)))
}

/// Resolve `url` to a local filesystem path backed by the on-disk cache.
/// Returns `None` only when the cache dir is unavailable or the upstream fetch
/// fails. The frontend wraps the returned path with Tauri's `convertFileSrc`
/// to produce a platform-correct `asset:` URL and loads it with a native
/// element (`<img>`, `<video>`, `<a download>`): this avoids base64 overhead
/// and lets the webview cache the decoded asset. Fetches + caches on miss.
pub async fn proxy_asset(url: &str) -> CmdResult<Option<String>> {
    // Hit? Runs the stat/read on the blocking pool — this is the primary path
    // for every rendered `<img>`/`<video>`, so it must not block a Tokio
    // worker thread on disk I/O.
    if let Some(entry) = crate::media_cache::get_async(url).await {
        return Ok(Some(crate::media_cache::asset_path_string(&entry.path)));
    }
    // Miss: fetch + cache.
    match crate::media_cache::fetch(url).await {
        Ok(entry) => Ok(Some(crate::media_cache::asset_path_string(&entry.path))),
        Err(_) => Ok(None),
    }
}

/// Fetch `url`, write it to the on-disk cache, and return the bytes + content
/// type (so the data-URI caller can inline them without a second read).
async fn fetch_and_cache(
    _state: &crate::AppState,
    url: &str,
) -> Result<(Vec<u8>, String), ApiError> {
    let entry = crate::media_cache::fetch(url).await?;
    let bytes = tokio::fs::read(&entry.path).await.map_err(|e| ApiError {
        message: e.to_string(),
        code: "IO".into(),
        status: 0,
    })?;
    Ok((bytes, entry.content_type))
}

/// Build a `data:` URI from raw bytes + content type.
fn data_uri(bytes: &[u8], content_type: &str) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    format!("data:{};base64,{}", content_type, STANDARD.encode(bytes))
}// c 1782910757
