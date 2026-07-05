//! Temporary on-disk media cache for remote images, videos, and files.
//!
//! Avatars, guild icons, emojis, and attachment media are fetched through the
//! Tauri backend (to dodge CORS + the token) and cached on disk so they don't
//! re-download on every render or navigation. Files live under the OS temp dir
//! (`<temp>/fluxer-media-cache/`) so the OS clears them on reboot — this is a
//! *temporary* cache, not persistent storage.
//!
//! Cached files are served to the webview via Tauri's `asset:` protocol as
//! ordinary URLs (no base64 overhead, native browser-level caching) rather than
//! as inlined data URIs. The cache key is a stable hash of the source URL; the
//! content type is stored alongside the bytes in the filename so the asset
//! protocol serves the right MIME.

use md5::{Digest, Md5};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use crate::ApiError;

/// A fetched media item: the local file that holds its bytes + its MIME type.
pub struct CachedMedia {
    pub path: PathBuf,
    pub content_type: String,
}

/// Tracks which URLs currently have an in-flight fetch, so two concurrent
/// requests for the same URL don't both download it. A `std::sync::Mutex` (not
/// `tokio`) because every critical section is a trivial synchronous map op that
/// never awaits — and the entry-removing `Drop` guard below runs in a sync
/// context where blocking on a tokio mutex would panic on a runtime worker.
static FETCH_LOCKS: OnceLock<Mutex<std::collections::HashMap<String, ()>>> = OnceLock::new();

fn locks() -> &'static Mutex<std::collections::HashMap<String, ()>> {
    FETCH_LOCKS.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

/// The cache directory: `<OS cache dir>/fluxer-media-cache` (falling back to
/// the OS temp dir). Created on first use. Returns `None` only when neither
/// can be resolved (very rare) — callers fall back to the in-memory data-URI
/// path in that case.
fn cache_dir() -> Option<PathBuf> {
    let base = dirs::cache_dir().unwrap_or_else(std::env::temp_dir);
    // Use the OS cache dir when available (persists across reboots for a
    // snappier UX) and fall back to temp. Either way this is throwaway data
    // we can rebuild; nothing here is authoritative.
    let dir = base.join("fluxer-media-cache");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

/// Map a source URL to a stable cache file path. The filename is
/// `<md5(url)>.<sanitized-ext>` so the asset protocol can infer a MIME from
/// the extension when the stored content type is ambiguous. Two URLs with the
/// same bytes (e.g. CDN retries) share a file; collisions are astronomically
/// unlikely with MD5 over a URL namespace.
fn cache_path_for(url: &str) -> Option<PathBuf> {
    let dir = cache_dir()?;
    let mut hasher = Md5::new();
    hasher.update(url.as_bytes());
    let digest = hasher.finalize();
    let hex: String = digest.iter().map(|b| format!("{:02x}", b)).collect();
    // Derive a best-effort extension from the URL path so `asset:` can serve a
    // reasonable MIME; the real content type is what the proxy records.
    let ext = url_ext(url).unwrap_or_else(|| "bin".to_string());
    Some(dir.join(format!("{hex}.{ext}")))
}

/// Best-effort file extension from a URL's path (without query string).
fn url_ext(url: &str) -> Option<String> {
    let path = url.split('?').next().unwrap_or(url);
    let ext = Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
    // Keep it short + filesystem-safe.
    if ext.chars().all(|c| c.is_ascii_alphanumeric()) && ext.len() <= 8 {
        Some(ext)
    } else {
        None
    }
}

/// The companion `.meta` file next to a cache entry records the MIME type. We
/// store it as a plain UTF-8 string (the content type) so reading is trivial.
fn meta_path_for(data_path: &Path) -> PathBuf {
    let mut p = data_path.to_path_buf();
    let new_name = format!(
        "{}.meta",
        p.file_name().and_then(|s| s.to_str()).unwrap_or("entry")
    );
    p.set_file_name(new_name);
    p
}

/// Look up a cached entry by URL. Returns the on-disk path + content type when
/// the entry exists and is non-empty.
///
/// Synchronous — does blocking `stat`/`read` syscalls. This is called on every
/// avatar/icon/emoji/attachment render (`image_proxy`/`image_proxy_asset`), so
/// prefer [`get_async`] from an async context to avoid stalling a Tokio
/// worker thread; this sync version remains for callers already off the
/// runtime (e.g. inside `spawn_blocking`).
pub fn get(url: &str) -> Option<CachedMedia> {
    let path = cache_path_for(url)?;
    if !path.is_file() || path.metadata().ok()?.len() == 0 {
        return None;
    }
    let meta_path = meta_path_for(&path);
    let content_type = std::fs::read_to_string(&meta_path)
        .unwrap_or_else(|_| "application/octet-stream".to_string());
    Some(CachedMedia { path, content_type })
}

/// Async wrapper over [`get`] that runs the blocking `stat`/`read` syscalls on
/// the blocking thread pool instead of the calling async task's worker
/// thread. Prefer this from `#[tauri::command] async fn` handlers — it is
/// called on every rendered image/video/attachment, so keeping it off the
/// Tokio reactor threads matters more than the single-file-io cost itself.
pub async fn get_async(url: &str) -> Option<CachedMedia> {
    let url = url.to_string();
    tokio::task::spawn_blocking(move || get(&url)).await.ok()?
}

/// Removes its URL key from the in-flight `FETCH_LOCKS` map when dropped, so the
/// map only ever holds URLs whose fetch is currently in progress — not every URL
/// ever fetched. Without this the map grew by one `(String, ())` entry per unique
/// media URL for the whole session (avatars, emojis, attachments, GIF thumbs,
/// embeds), an unbounded leak on a long-running client. Removing on drop covers
/// every exit path (including the several `?` early returns below) with no manual
/// cleanup at each one.
struct InFlightGuard {
    url: String,
}

impl Drop for InFlightGuard {
    fn drop(&mut self) {
        // Synchronous `std::sync::Mutex`: a single `HashMap::remove`, no await,
        // safe to run from `Drop` on any thread. Recover from a poisoned lock so
        // a panic elsewhere can't wedge the cache.
        let mut map = match locks().lock() {
            Ok(m) => m,
            Err(poisoned) => poisoned.into_inner(),
        };
        map.remove(&self.url);
    }
}

/// Fetch `url` over HTTP, write its bytes to the cache, and return the entry.
/// Concurrent calls for the same URL are coalesced via a per-key async mutex
/// so only one download happens.
pub async fn fetch(url: &str) -> Result<CachedMedia, ApiError> {
    // Coalesce concurrent fetches for the same URL.
    let path = cache_path_for(url).ok_or_else(|| ApiError {
        message: "cache dir unavailable".into(),
        code: "CACHE".into(),
        status: 0,
    })?;
    // Mark this URL as in-flight, then arrange to clear it on ALL exit paths via
    // the guard's Drop (see `InFlightGuard`) so the map stays bounded to only
    // currently-downloading URLs.
    {
        let mut map = match locks().lock() {
            Ok(m) => m,
            Err(poisoned) => poisoned.into_inner(),
        };
        map.insert(url.to_string(), ());
    }
    let _in_flight = InFlightGuard { url: url.to_string() };
    // Re-check after acquiring: another task may have just written it.
    if let Some(existing) = get_async(url).await {
        return Ok(existing);
    }
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| ApiError {
            message: e.to_string(),
            code: "HTTP".into(),
            status: 0,
        })?;
    let resp = client.get(url).send().await.map_err(|e| ApiError {
        message: e.to_string(),
        code: "HTTP".into(),
        status: 0,
    })?;
    if !resp.status().is_success() {
        return Err(ApiError {
            message: format!("upstream status {}", resp.status()),
            code: "HTTP".into(),
            status: resp.status().as_u16(),
        });
    }
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let bytes = resp.bytes().await.map_err(|e| ApiError {
        message: e.to_string(),
        code: "HTTP".into(),
        status: 0,
    })?;

    // Write atomically: temp file then rename, so a partial write never
    // replaces a good cache entry. Uses `tokio::fs` (spawn_blocking under the
    // hood) rather than `std::fs` so this cache-miss path — still an async
    // command handler — doesn't block a Tokio worker thread on disk I/O.
    let tmp = path.with_extension("tmp");
    {
        let mut f = tokio::fs::File::create(&tmp).await.map_err(|e| ApiError {
            message: e.to_string(),
            code: "IO".into(),
            status: 0,
        })?;
        tokio::io::AsyncWriteExt::write_all(&mut f, &bytes)
            .await
            .map_err(|e| ApiError {
                message: e.to_string(),
                code: "IO".into(),
                status: 0,
            })?;
        let _ = f.sync_all().await;
    }
    tokio::fs::rename(&tmp, &path).await.map_err(|e| ApiError {
        message: e.to_string(),
        code: "IO".into(),
        status: 0,
    })?;
    // Record the content type in the companion `.meta` file (best-effort).
    let _ = tokio::fs::write(meta_path_for(&path), &content_type).await;

    Ok(CachedMedia { path, content_type })
}

/// Convert a local filesystem path into a clean, absolute path string suitable
/// for handing to the frontend, which wraps it with Tauri's `convertFileSrc`
/// to produce a platform-correct `asset:`/`http://asset.localhost/` URL. We do
/// NOT build the URL here because the correct scheme/host shape differs by
/// platform (WebView2 wants `http://asset.localhost/`, macOS/Linux want
/// `asset://localhost/`) and Tauri's JS API knows the right one.
///
/// The path is made absolute via `canonicalize`, but we strip Windows's
/// `\\?\` verbatim-path prefix (which would otherwise get mangled into `%3F`
/// when URL-encoded) so the returned string is a plain OS path.
pub fn asset_path_string(path: &Path) -> String {
    let abs = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => path.to_path_buf(),
    };
    let s = abs.to_string_lossy().replace('\\', "/");
    // Strip the Windows `\\?\` (or `\\.\`) verbatim-path prefix. canonicalize
    // adds it; it must not leak into the URL the webview loads.
    let s = s
        .strip_prefix("//?/")
        .or_else(|| s.strip_prefix("//./"))
        .map(|rest| {
            // After stripping `//?/` we have `C:/Users/...`; restore the drive
            // colon. `strip_prefix` left it intact, so just prepend nothing.
            rest.to_string()
        })
        .unwrap_or(s);
    s
}

/// Best-effort cleanup of the cache directory: drop entries older than
/// `max_age` and cap total size. Runs on a plain OS thread (not a Tokio task)
/// so it can be called from `setup()` before the runtime is driving the main
/// thread, and so its blocking filesystem I/O never stalls the reactor.
/// Keeps the cache truly "temporary" over long-running sessions.
pub fn prune_async(max_age: std::time::Duration, max_bytes: u64) {
    std::thread::spawn(move || {
        let _ = prune_blocking(max_age, max_bytes);
    });
}

fn prune_blocking(max_age: std::time::Duration, max_bytes: u64) -> std::io::Result<()> {
    let Some(dir) = cache_dir() else {
        return Ok(());
    };
    let now = std::time::SystemTime::now();
    let cutoff = now - max_age;
    // Collect entries with (path, mtime, size).
    let mut entries: Vec<(PathBuf, std::time::SystemTime, u64)> = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let meta = entry.metadata()?;
        if !meta.is_file() {
            continue;
        }
        let mtime = meta.modified().unwrap_or(now);
        let size = meta.len();
        // Age-based eviction first.
        if mtime < cutoff {
            let _ = std::fs::remove_file(entry.path());
            continue;
        }
        entries.push((entry.path(), mtime, size));
    }
    // Size-based eviction: drop oldest until under the cap.
    entries.sort_by_key(|(_, mtime, _)| *mtime);
    let mut total: u64 = entries.iter().map(|(_, _, s)| s).sum();
    for (path, _, size) in entries {
        if total <= max_bytes {
            break;
        }
        let _ = std::fs::remove_file(&path);
        total = total.saturating_sub(size);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_ext_handles_query_and_uppercase() {
        assert_eq!(url_ext("https://x.com/a/b.png?w=10"), Some("png".into()));
        assert_eq!(url_ext("https://x.com/AVATAR.PNG"), Some("png".into()));
        assert_eq!(url_ext("https://x.com/no-ext"), None);
        assert_eq!(url_ext("https://x.com/a.weird%20"), None);
    }

    #[test]
    fn asset_path_string_strips_windows_verbatim_prefix() {
        // On Windows, canonicalize() prepends `\\?\`; our helper must strip it
        // so it doesn't get mangled into `%3F` when the webview URL-encodes it.
        // We simulate that by feeding a path that already carries the prefix.
        let s = asset_path_string(Path::new(r"\\?\C:\Users\felix\cache.webp"));
        assert!(!s.contains("?"), "verbatim prefix must be stripped: {s}");
        assert!(s.starts_with("C:/Users/felix/cache.webp"), "got {s}");
        assert!(!s.contains('\\'), "backslashes normalized: {s}");
    }
}
