// SPDX-License-Identifier: AGPL-3.0-or-later

use scraper::{Html, Selector};

#[derive(Debug, Default, Clone)]
#[allow(dead_code)]
pub struct OgMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub url: Option<String>,
    pub image: Option<String>,
    pub images: Vec<String>,
    pub image_alt: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub video: Option<String>,
    pub audio: Option<String>,
    pub site_name: Option<String>,
    pub og_type: Option<String>,
    pub theme_color: Option<String>,
}

#[derive(Debug, Default, Clone)]
#[allow(dead_code)]
pub struct TwitterCardMetadata {
    pub card: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    pub image_alt: Option<String>,
    pub player: Option<String>,
    pub player_width: Option<u32>,
    pub player_height: Option<u32>,
}

pub fn parse_opengraph(html: &str) -> OgMetadata {
    let doc = Html::parse_document(html);

    let title = extract_meta(&doc, "og:title");
    let description =
        extract_meta(&doc, "og:description").or_else(|| extract_meta_by_name(&doc, "description"));
    let image =
        extract_meta(&doc, "og:image").or_else(|| extract_meta(&doc, "og:image:secure_url"));
    let video = extract_meta(&doc, "og:video")
        .or_else(|| extract_meta(&doc, "og:video:url"))
        .or_else(|| extract_meta(&doc, "og:video:secure_url"))
        .or_else(|| extract_meta_by_name(&doc, "twitter:player"))
        .or_else(|| extract_meta_by_name(&doc, "twitter:player:stream"));

    let mut og = OgMetadata {
        title,
        description,
        url: extract_meta(&doc, "og:url"),
        image,
        images: extract_image_urls(&doc),
        image_alt: extract_meta(&doc, "og:image:alt")
            .or_else(|| extract_meta_by_name(&doc, "twitter:image:alt"))
            .or_else(|| extract_meta(&doc, "og:image:description")),
        image_width: extract_meta(&doc, "og:image:width").and_then(|v| v.parse().ok()),
        image_height: extract_meta(&doc, "og:image:height").and_then(|v| v.parse().ok()),
        video,
        audio: extract_meta(&doc, "og:audio").or_else(|| extract_meta(&doc, "og:audio:url")),
        site_name: extract_meta(&doc, "og:site_name")
            .or_else(|| extract_meta_by_name(&doc, "twitter:site:name"))
            .or_else(|| extract_meta_by_name(&doc, "application-name")),
        og_type: extract_meta(&doc, "og:type"),
        theme_color: extract_meta_by_name(&doc, "theme-color"),
    };

    if og.title.is_none() {
        og.title = extract_meta_by_name(&doc, "twitter:title")
            .or_else(|| extract_html_title(&doc))
            .or_else(|| extract_meta_by_name(&doc, "title"));
    }

    if og.description.is_none() {
        og.description = extract_meta_by_name(&doc, "twitter:description");
    }

    og
}

#[allow(dead_code)]
pub fn parse_twitter_card(html: &str) -> TwitterCardMetadata {
    let doc = Html::parse_document(html);

    TwitterCardMetadata {
        card: extract_meta_by_name(&doc, "twitter:card"),
        title: extract_meta_by_name(&doc, "twitter:title"),
        description: extract_meta_by_name(&doc, "twitter:description"),
        image: extract_meta_by_name(&doc, "twitter:image")
            .or_else(|| extract_meta_by_name(&doc, "twitter:image:src")),
        image_alt: extract_meta_by_name(&doc, "twitter:image:alt"),
        player: extract_meta_by_name(&doc, "twitter:player"),
        player_width: extract_meta_by_name(&doc, "twitter:player:width")
            .and_then(|v| v.parse().ok()),
        player_height: extract_meta_by_name(&doc, "twitter:player:height")
            .and_then(|v| v.parse().ok()),
    }
}

pub fn extract_html_title(doc: &Html) -> Option<String> {
    let sel = Selector::parse("title").ok()?;
    doc.select(&sel)
        .next()
        .map(|el| el.text().collect::<String>())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_owned())
}

pub fn find_activity_pub_link(html: &str) -> Option<String> {
    let doc = Html::parse_document(html);
    let sel = Selector::parse("link").ok()?;

    for el in doc.select(&sel) {
        let rel = el.value().attr("rel")?.to_ascii_lowercase();
        let rel_tokens: Vec<&str> = rel.split_whitespace().collect();
        if !rel_tokens.contains(&"alternate") {
            continue;
        }

        let link_type = el.value().attr("type")?.to_ascii_lowercase();
        let is_ap = link_type == "application/activity+json"
            || (link_type == "application/ld+json" && el.value().attr("href").is_some())
            || link_type.contains("application/activity+json")
            || link_type.contains("profile=\"https://www.w3.org/ns/activitystreams\"")
            || link_type.contains("profile='https://www.w3.org/ns/activitystreams'");

        if is_ap {
            return el.value().attr("href").map(|s| s.to_owned());
        }
    }

    None
}

#[allow(dead_code)]
pub fn find_canonical_url(html: &str, base_url: &url::Url) -> Option<String> {
    let doc = Html::parse_document(html);
    let sel = Selector::parse("link[rel=\"canonical\"]").ok()?;
    let el = doc.select(&sel).next()?;
    let href = el.value().attr("href")?;
    if href.is_empty() {
        return None;
    }
    base_url.join(href).ok().map(|u| u.to_string())
}

pub fn find_apple_touch_icon(html: &str, base_url: &url::Url) -> Option<String> {
    let doc = Html::parse_document(html);
    for selector in [
        r#"link[rel="apple-touch-icon"][sizes="180x180"]"#,
        r#"link[rel="apple-touch-icon"]"#,
    ] {
        let sel = Selector::parse(selector).ok()?;
        if let Some(el) = doc.select(&sel).next()
            && let Some(href) = el.value().attr("href")
            && !href.is_empty()
            && let Ok(resolved) = base_url.join(href)
        {
            return Some(resolved.to_string());
        }
    }
    None
}

fn extract_image_urls(doc: &Html) -> Vec<String> {
    let properties = [
        "og:image",
        "og:image:secure_url",
        "twitter:image",
        "twitter:image:src",
        "image",
    ];
    let mut seen = std::collections::HashSet::new();
    let mut values = Vec::new();

    for prop in &properties {
        for val in extract_meta_values(doc, prop) {
            let Some(normalized) = normalize_image_reference_key(&val) else {
                continue;
            };
            if seen.insert(normalized) {
                values.push(val.trim().to_owned());
            }
        }
    }
    values
}

fn normalize_image_reference_key(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty()
        || value
            .chars()
            .any(|c| c.is_ascii_whitespace() || c.is_control())
    {
        return None;
    }

    if let Ok(parsed) = url::Url::parse(value) {
        return is_http_url(&parsed).then(|| parsed.as_str().trim_end_matches('/').to_owned());
    }

    let base = url::Url::parse("https://example.invalid/").ok()?;
    let resolved = base.join(value).ok()?;
    is_http_url(&resolved).then(|| format!("relative:{}", value.trim_end_matches('/')))
}

fn is_http_url(url: &url::Url) -> bool {
    matches!(url.scheme(), "http" | "https")
}

fn extract_meta_values(doc: &Html, property: &str) -> Vec<String> {
    let twitter_property = format!(
        "twitter:{}",
        property.strip_prefix("og:").unwrap_or(property)
    );
    let selectors = [
        format!(r#"meta[property="{property}"]"#),
        format!(r#"meta[name="{property}"]"#),
        format!(r#"meta[property="{twitter_property}"]"#),
        format!(r#"meta[name="{twitter_property}"]"#),
    ];
    let mut values = Vec::new();
    for selector_str in &selectors {
        if let Ok(sel) = Selector::parse(selector_str) {
            for el in doc.select(&sel) {
                if let Some(content) = el.value().attr("content")
                    && !content.is_empty()
                {
                    values.push(content.to_owned());
                }
            }
        }
    }
    values
}

fn extract_meta(doc: &Html, property: &str) -> Option<String> {
    extract_meta_values(doc, property).pop()
}

fn extract_meta_by_name(doc: &Html, name: &str) -> Option<String> {
    extract_meta_values(doc, name).pop()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn og(html: &str) -> OgMetadata {
        parse_opengraph(html)
    }

    #[test]
    fn extracts_og_title_desc_image_url() {
        let h = r#"<html><head>
            <meta property="og:title" content="T">
            <meta property="og:description" content="D">
            <meta property="og:image" content="https://i.example.com/a.png">
            <meta property="og:url" content="https://example.com/p">
        </head></html>"#;
        let m = og(h);
        assert_eq!(m.title.as_deref(), Some("T"));
        assert_eq!(m.description.as_deref(), Some("D"));
        assert_eq!(m.image.as_deref(), Some("https://i.example.com/a.png"));
        assert_eq!(m.url.as_deref(), Some("https://example.com/p"));
    }

    #[test]
    fn handles_missing_tags() {
        let m = og("<html><head><title>X</title></head></html>");
        assert_eq!(m.title.as_deref(), Some("X"));
        assert!(m.description.is_none() && m.image.is_none() && m.url.is_none());
    }

    #[test]
    fn extracts_multiple_images() {
        let h = r#"<head><meta property="og:image" content="https://a.com/1.png">
            <meta property="og:image" content="https://a.com/2.png"></head>"#;
        assert!(og(h).images.len() >= 2);
    }

    #[test]
    fn falls_back_to_meta_description() {
        let m = og(r#"<head><meta name="description" content="MD"></head>"#);
        assert_eq!(m.description.as_deref(), Some("MD"));
    }

    #[test]
    fn meta_extraction_matches_twitter_aliases_for_og_fields() {
        let m = og(r#"<head><meta name="twitter:description" content="TD"></head>"#);
        assert_eq!(m.description.as_deref(), Some("TD"));
    }

    #[test]
    fn extracts_site_name_from_application_name() {
        let m = og(r#"<head><meta name="application-name" content="App"></head>"#);
        assert_eq!(m.site_name.as_deref(), Some("App"));
    }

    #[test]
    fn find_ap_link() {
        let h = r#"<head><link rel="alternate" type="application/activity+json" href="https://e.com/ap"></head>"#;
        assert_eq!(find_activity_pub_link(h), Some("https://e.com/ap".into()));
        assert!(find_activity_pub_link("<head></head>").is_none());
    }

    #[test]
    fn find_canonical() {
        let h = r#"<head><link rel="canonical" href="/p"></head>"#;
        let base = url::Url::parse("https://e.com/old").unwrap();
        assert_eq!(find_canonical_url(h, &base), Some("https://e.com/p".into()));
        assert!(find_canonical_url("<head></head>", &base).is_none());
    }

    #[test]
    fn title_fallback_chain_matches_ts() {
        let m = og(r#"<head><meta property="og:title" content="OG"></head>"#);
        assert_eq!(m.title.as_deref(), Some("OG"));
        let m = og(r#"<head><meta name="twitter:title" content="TW"></head>"#);
        assert_eq!(m.title.as_deref(), Some("TW"));
        let m = og(r#"<html><head><title>HTML Title</title></head></html>"#);
        assert_eq!(m.title.as_deref(), Some("HTML Title"));
        let m = og(r#"<head><meta name="title" content="Meta"></head>"#);
        assert_eq!(m.title.as_deref(), Some("Meta"));
    }

    #[test]
    fn description_fallback_chain_matches_ts() {
        let m = og(r#"<head><meta property="og:description" content="OD"></head>"#);
        assert_eq!(m.description.as_deref(), Some("OD"));
        let m = og(r#"<head><meta name="description" content="MD"></head>"#);
        assert_eq!(m.description.as_deref(), Some("MD"));
        let m = og(r#"<head><meta name="twitter:description" content="TD"></head>"#);
        assert_eq!(m.description.as_deref(), Some("TD"));
    }

    #[test]
    fn site_name_fallback_chain_matches_ts() {
        let m = og(r#"<head><meta property="og:site_name" content="OG Site"></head>"#);
        assert_eq!(m.site_name.as_deref(), Some("OG Site"));
        let m = og(r#"<head><meta name="twitter:site:name" content="TW Site"></head>"#);
        assert_eq!(m.site_name.as_deref(), Some("TW Site"));
        let m = og(r#"<head><meta name="application-name" content="App"></head>"#);
        assert_eq!(m.site_name.as_deref(), Some("App"));
    }

    #[test]
    fn video_url_fallback_chain_matches_ts() {
        let m = og(r#"<head><meta property="og:video" content="https://v.com/a.mp4"></head>"#);
        assert_eq!(m.video.as_deref(), Some("https://v.com/a.mp4"));
        let m = og(
            r#"<head><meta property="og:video:secure_url" content="https://v.com/b.mp4"></head>"#,
        );
        assert_eq!(m.video.as_deref(), Some("https://v.com/b.mp4"));
        let m = og(r#"<head><meta name="twitter:player" content="https://p.com/embed"></head>"#);
        assert_eq!(m.video.as_deref(), Some("https://p.com/embed"));
        let m =
            og(r#"<head><meta name="twitter:player:stream" content="https://s.com/a.mp4"></head>"#);
        assert_eq!(m.video.as_deref(), Some("https://s.com/a.mp4"));
    }

    #[test]
    fn audio_url_fallback_matches_ts() {
        let m = og(r#"<head><meta property="og:audio" content="https://a.com/song.mp3"></head>"#);
        assert_eq!(m.audio.as_deref(), Some("https://a.com/song.mp3"));
        let m =
            og(r#"<head><meta property="og:audio:url" content="https://a.com/song2.mp3"></head>"#);
        assert_eq!(m.audio.as_deref(), Some("https://a.com/song2.mp3"));
    }

    #[test]
    fn image_url_fallback_matches_ts() {
        let m = og(r#"<head><meta property="og:image" content="https://i.com/a.png"></head>"#);
        assert_eq!(m.image.as_deref(), Some("https://i.com/a.png"));
        let m = og(
            r#"<head><meta property="og:image:secure_url" content="https://i.com/b.png"></head>"#,
        );
        assert_eq!(m.image.as_deref(), Some("https://i.com/b.png"));
    }

    #[test]
    fn extracts_image_dimensions() {
        let m = og(r#"<head>
            <meta property="og:image:width" content="1200">
            <meta property="og:image:height" content="630">
        </head>"#);
        assert_eq!(m.image_width, Some(1200));
        assert_eq!(m.image_height, Some(630));
    }

    #[test]
    fn extracts_theme_color() {
        let m = og(r##"<head><meta name="theme-color" content="#FF0000"></head>"##);
        assert_eq!(m.theme_color.as_deref(), Some("#FF0000"));
    }

    #[test]
    fn extracts_og_type() {
        let m = og(r#"<head><meta property="og:type" content="article"></head>"#);
        assert_eq!(m.og_type.as_deref(), Some("article"));
    }

    #[test]
    fn images_deduplicated_by_normalized_url() {
        let h = r#"<head>
            <meta property="og:image" content="https://a.com/1.png">
            <meta property="og:image" content="https://a.com/1.png/">
        </head>"#;
        assert_eq!(og(h).images.len(), 1);
    }

    #[test]
    fn images_collected_from_multiple_sources() {
        let h = r#"<head>
            <meta property="og:image" content="https://a.com/1.png">
            <meta name="twitter:image" content="https://a.com/2.png">
            <meta name="twitter:image:src" content="https://a.com/3.png">
        </head>"#;
        assert_eq!(og(h).images.len(), 3);
    }

    #[test]
    fn images_keep_relative_url_references() {
        let h = r#"<head>
            <meta property="og:image" content="/api/og">
            <meta property="og:image" content="hero.png">
            <meta name="twitter:image" content="//cdn.example.com/card.png">
        </head>"#;
        assert_eq!(
            og(h).images,
            vec![
                "/api/og".to_owned(),
                "hero.png".to_owned(),
                "//cdn.example.com/card.png".to_owned()
            ]
        );
    }

    #[test]
    fn images_reject_bad_url_references() {
        let h = r#"<head>
            <meta property="og:image" content="javascript:alert(1)">
            <meta property="og:image" content="data:image/png;base64,abcd">
            <meta property="og:image" content="bad url.png">
            <meta property="og:image" content="https://a.com/ok.png">
        </head>"#;
        assert_eq!(og(h).images, vec!["https://a.com/ok.png".to_owned()]);
    }

    #[test]
    fn twitter_card_parsing() {
        let h = r#"<head>
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="Title">
            <meta name="twitter:description" content="Desc">
            <meta name="twitter:image" content="https://i.com/a.png">
            <meta name="twitter:player" content="https://p.com/embed">
            <meta name="twitter:player:width" content="640">
            <meta name="twitter:player:height" content="360">
        </head>"#;
        let tc = parse_twitter_card(h);
        assert_eq!(tc.card.as_deref(), Some("summary_large_image"));
        assert_eq!(tc.title.as_deref(), Some("Title"));
        assert_eq!(tc.description.as_deref(), Some("Desc"));
        assert_eq!(tc.image.as_deref(), Some("https://i.com/a.png"));
        assert_eq!(tc.player.as_deref(), Some("https://p.com/embed"));
        assert_eq!(tc.player_width, Some(640));
        assert_eq!(tc.player_height, Some(360));
    }

    #[test]
    fn twitter_card_image_falls_back_to_src() {
        let h = r#"<head><meta name="twitter:image:src" content="https://i.com/a.png"></head>"#;
        let tc = parse_twitter_card(h);
        assert_eq!(tc.image.as_deref(), Some("https://i.com/a.png"));
    }

    #[test]
    fn activity_pub_link_ld_json_variant() {
        let h = r#"<head><link rel="alternate" type="application/ld+json" href="https://e.com/ld"></head>"#;
        assert_eq!(find_activity_pub_link(h), Some("https://e.com/ld".into()));
    }

    #[test]
    fn activity_pub_link_profile_annotation() {
        let h = r#"<head><link rel="alternate" type="application/ld+json; profile='https://www.w3.org/ns/activitystreams'" href="https://e.com/ap"></head>"#;
        assert_eq!(find_activity_pub_link(h), Some("https://e.com/ap".into()));
    }

    #[test]
    fn activity_pub_link_requires_alternate_rel() {
        let h = r#"<head><link rel="preload" type="application/activity+json" href="https://e.com/ap"></head>"#;
        assert!(find_activity_pub_link(h).is_none());
    }

    #[test]
    fn find_apple_touch_icon_prefers_180x180() {
        let h = r#"<head>
            <link rel="apple-touch-icon" href="/icon-default.png">
            <link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png">
        </head>"#;
        let base = url::Url::parse("https://e.com/page").unwrap();
        assert_eq!(
            find_apple_touch_icon(h, &base),
            Some("https://e.com/icon-180.png".into())
        );
    }

    #[test]
    fn find_apple_touch_icon_resolves_relative_urls() {
        let h = r#"<head><link rel="apple-touch-icon" href="/icons/touch.png"></head>"#;
        let base = url::Url::parse("https://e.com/page").unwrap();
        assert_eq!(
            find_apple_touch_icon(h, &base),
            Some("https://e.com/icons/touch.png".into())
        );
    }

    #[test]
    fn canonical_url_resolves_relative() {
        let h = r#"<head><link rel="canonical" href="../other"></head>"#;
        let base = url::Url::parse("https://e.com/a/b/c").unwrap();
        assert_eq!(
            find_canonical_url(h, &base),
            Some("https://e.com/a/other".into())
        );
    }

    #[test]
    fn canonical_url_empty_href_returns_none() {
        let h = r#"<head><link rel="canonical" href=""></head>"#;
        let base = url::Url::parse("https://e.com/page").unwrap();
        assert!(find_canonical_url(h, &base).is_none());
    }

    #[test]
    fn html_title_trims_whitespace() {
        let doc = scraper::Html::parse_document("<title>  Hello World  </title>");
        assert_eq!(extract_html_title(&doc).as_deref(), Some("Hello World"));
    }

    #[test]
    fn html_title_empty_returns_none() {
        let doc = scraper::Html::parse_document("<title>   </title>");
        assert!(extract_html_title(&doc).is_none());
    }

    #[test]
    fn empty_meta_content_is_skipped() {
        let m = og(r#"<head><meta property="og:title" content=""></head>"#);
        assert!(m.title.is_none());
    }
}
