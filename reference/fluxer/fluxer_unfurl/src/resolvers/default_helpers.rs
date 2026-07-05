// SPDX-License-Identifier: AGPL-3.0-or-later

use super::ResolveContext;
use crate::oembed;
use url::Url;

pub struct ImageCandidate {
    pub url: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

pub fn build_image_candidates(
    base_url: &Url,
    og: &crate::html_parser::OgMetadata,
    oembed: Option<&oembed::OEmbedResponse>,
) -> Vec<ImageCandidate> {
    let mut candidates = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for url in &og.images {
        if let Some(resolved) = resolve_media_url(base_url, url)
            && let Some(n) = normalize_url(&resolved)
            && seen.insert(n)
        {
            candidates.push(ImageCandidate {
                url: resolved,
                width: None,
                height: None,
            });
        }
    }
    if let Some(o) = oembed {
        let is_photo = o
            .oembed_type
            .as_deref()
            .map(|t| t.eq_ignore_ascii_case("photo"))
            .unwrap_or(false);
        if is_photo {
            add_candidate(
                &mut candidates,
                &mut seen,
                base_url,
                o.url.as_deref(),
                o.width.as_ref().and_then(oembed::parse_dimension),
                o.height.as_ref().and_then(oembed::parse_dimension),
            );
        }
        add_candidate(
            &mut candidates,
            &mut seen,
            base_url,
            o.thumbnail_url.as_deref(),
            o.thumbnail_width.as_ref().and_then(oembed::parse_dimension),
            o.thumbnail_height
                .as_ref()
                .and_then(oembed::parse_dimension),
        );
    }
    candidates
}

fn add_candidate(
    cs: &mut Vec<ImageCandidate>,
    seen: &mut std::collections::HashSet<String>,
    base_url: &Url,
    url: Option<&str>,
    w: Option<u32>,
    h: Option<u32>,
) {
    if let Some(u) = url
        && let Some(resolved) = resolve_media_url(base_url, u)
        && let Some(n) = normalize_url(&resolved)
        && seen.insert(n)
    {
        cs.push(ImageCandidate {
            url: resolved,
            width: w,
            height: h,
        });
    }
}

pub fn resolve_media_url(base_url: &Url, value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty()
        || value
            .chars()
            .any(|c| c.is_ascii_whitespace() || c.is_control())
    {
        return None;
    }
    let url = base_url.join(value).ok()?;
    matches!(url.scheme(), "http" | "https").then(|| url.to_string())
}

fn normalize_url(url: &str) -> Option<String> {
    Url::parse(url)
        .ok()
        .map(|u| u.as_str().trim_end_matches('/').to_owned())
}

pub async fn fetch_oembed_data(
    ctx: &ResolveContext<'_>,
    html: &str,
) -> Option<oembed::OEmbedResponse> {
    for ep in &oembed::discover_oembed_url(html) {
        let endpoint = ctx
            .url
            .join(&ep.url)
            .map(|url| url.to_string())
            .unwrap_or_else(|_| ep.url.clone());
        if let Ok(data) = oembed::fetch_oembed(&ctx.http_client, &endpoint, ep.format).await {
            return Some(data);
        }
    }
    let hostname = ctx.url.host_str()?;
    let known = oembed::known_oembed_endpoint(hostname, ctx.url.as_str())?;
    oembed::fetch_oembed(&ctx.http_client, &known.url, known.format)
        .await
        .ok()
}

pub fn parse_hex_color(s: &str) -> Option<u32> {
    let hex = s.trim().strip_prefix('#')?;
    let ok = (hex.len() == 6 || hex.len() == 3) && hex.chars().all(|c| c.is_ascii_hexdigit());
    if !ok {
        return None;
    }
    match hex.len() {
        6 => u32::from_str_radix(hex, 16).ok(),
        3 => {
            let e: String = hex.chars().flat_map(|c| [c, c]).collect();
            u32::from_str_radix(&e, 16).ok()
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::html_parser::OgMetadata;

    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }

    #[test]
    fn resolve_media_url_resolves_relative_references() {
        let base = url("https://forgetful.vercel.app/posts/page");

        assert_eq!(
            resolve_media_url(&base, "/api/og").as_deref(),
            Some("https://forgetful.vercel.app/api/og")
        );
        assert_eq!(
            resolve_media_url(&base, "images/card.png").as_deref(),
            Some("https://forgetful.vercel.app/posts/images/card.png")
        );
        assert_eq!(
            resolve_media_url(&base, "//cdn.example.com/card.png").as_deref(),
            Some("https://cdn.example.com/card.png")
        );
    }

    #[test]
    fn resolve_media_url_rejects_non_http_and_invalid_references() {
        let base = url("https://example.com/page");

        assert!(resolve_media_url(&base, "javascript:alert(1)").is_none());
        assert!(resolve_media_url(&base, "data:image/png;base64,abcd").is_none());
        assert!(resolve_media_url(&base, "bad url.png").is_none());
    }

    #[test]
    fn build_image_candidates_resolves_relative_og_images() {
        let base = url("https://forgetful.vercel.app/posts/page");
        let og = OgMetadata {
            images: vec![
                "/api/og".to_owned(),
                "images/card.png".to_owned(),
                "//cdn.example.com/card.png".to_owned(),
            ],
            ..Default::default()
        };

        let candidates = build_image_candidates(&base, &og, None);
        let urls = candidates
            .into_iter()
            .map(|candidate| candidate.url)
            .collect::<Vec<_>>();

        assert_eq!(
            urls,
            vec![
                "https://forgetful.vercel.app/api/og".to_owned(),
                "https://forgetful.vercel.app/posts/images/card.png".to_owned(),
                "https://cdn.example.com/card.png".to_owned()
            ]
        );
    }

    #[test]
    fn build_image_candidates_deduplicates_after_resolution() {
        let base = url("https://forgetful.vercel.app/posts/page");
        let og = OgMetadata {
            images: vec![
                "/api/og".to_owned(),
                "https://forgetful.vercel.app/api/og/".to_owned(),
            ],
            ..Default::default()
        };

        let candidates = build_image_candidates(&base, &og, None);

        assert_eq!(candidates.len(), 1);
        assert_eq!(
            candidates[0].url.as_str(),
            "https://forgetful.vercel.app/api/og"
        );
    }
}
