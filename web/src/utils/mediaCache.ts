// Media cache: a JS-side memo + in-flight dedup layer over the Tauri media
// proxy commands. Components call `resolveAssetUrl(url)` to get a webview-loadable
// URL for an avatar/icon/emoji/attachment. The first call fetches + caches the
// asset (via the backend's on-disk temp cache); subsequent calls for the same
// URL return instantly from memory without crossing the IPC boundary.
//
// The backend returns a local filesystem path; we wrap it with Tauri's
// `convertFileSrc` to produce the platform-correct asset URL
// (`http://asset.localhost/<path>` on Windows WebView2, `asset://localhost/`
// on macOS/Linux). Building the URL here (rather than in Rust) keeps the
// platform knowledge in one place.

import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../api";

/// Memo of URL -> resolved webview-loadable string. Lives for the page
/// lifetime; the backend's on-disk cache handles cross-session persistence.
const assetMemo = new Map<string, string | null>();
const dataUriMemo = new Map<string, string | null>();

/// In-flight requests, so N concurrent callers for the same URL share one
/// fetch (and one backend call).
const assetInFlight = new Map<string, Promise<string | null>>();
const dataUriInFlight = new Map<string, Promise<string | null>>();

/// Resolve a remote media URL to a webview-loadable asset URL backed by the
/// on-disk cache (preferred for `<img>`/`<video>`/`<a>`). The backend returns a
/// local filesystem path; we wrap it with `convertFileSrc` to get the
/// platform-correct URL. Returns `null` when the asset can't be fetched or
/// cached; callers should fall back to a placeholder.
export function resolveAssetUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  const cached = assetMemo.get(url);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = assetInFlight.get(url);
  if (existing) return existing;
  const p = api
    .imageProxyAsset(url)
    .then((path) => {
      const resolved = path ? convertFileSrc(path) : null;
      assetMemo.set(url, resolved);
      assetInFlight.delete(url);
      return resolved;
    })
    .catch(() => {
      assetInFlight.delete(url);
      return null;
    });
  assetInFlight.set(url, p);
  return p;
}

/// Resolve a remote media URL to a base64 data URI (for callers that need an
/// inlined blob). Shares the dedup machinery with `resolveAssetUrl`.
export function resolveDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  const cached = dataUriMemo.get(url);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = dataUriInFlight.get(url);
  if (existing) return existing;
  const p = api
    .imageProxy(url)
    .then((resolved) => {
      dataUriMemo.set(url, resolved);
      dataUriInFlight.delete(url);
      return resolved ?? null;
    })
    .catch(() => {
      dataUriInFlight.delete(url);
      return null;
    });
  dataUriInFlight.set(url, p);
  return p;
}

/// Drop the JS-side memo for a URL so the next access re-resolves (e.g. after
/// the underlying asset changed). Rarely needed; exposed for completeness.
export function evictFromMediaCache(url: string) {
  assetMemo.delete(url);
  dataUriMemo.delete(url);
}

/// A React hook that resolves a media URL to a cached `asset://` URL and
/// re-renders when ready. Returns `null` while pending or on failure.
import { useEffect, useState } from "react";
export function useAssetUrl(url: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(() =>
    url ? (assetMemo.get(url) ?? null) : null,
  );
  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setSrc(null);
      return;
    }
    // If already memoized, set synchronously to avoid a flash.
    const cached = assetMemo.get(url);
    if (cached !== undefined) {
      setSrc(cached);
      return;
    }
    setSrc(null);
    resolveAssetUrl(url).then((resolved) => {
      if (!cancelled) setSrc(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return src;
}
