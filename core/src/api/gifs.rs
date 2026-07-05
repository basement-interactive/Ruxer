//! GIF endpoints (`/gifs/search`, `/gifs/trending`, `/gifs/featured`).
//!
//! Fluxer proxies GIF requests to the Klipy GIF provider (configured in the
//! instance's well-known document under `gif.provider`). The endpoints are
//! part of the REST API but not in the OpenAPI spec — they're gateway-level
//! proxy routes. Source: reference/fluxer/fluxer_app/src/features/expressions/commands/GifCommands.ts
//! + reference/fluxer/fluxer_app/src/features/app/constants/Endpoints.ts:149-153.

use crate::error::Result;
use crate::http::Http;
use serde::{Deserialize, Serialize};

/// GIF resource API.
#[derive(Clone, Debug)]
pub struct Gifs(pub Http);

/// A single GIF result.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Gif {
    pub id: String,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub src: String,
    #[serde(default)]
    pub proxy_src: String,
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
    #[serde(default)]
    pub media: std::collections::HashMap<String, GifMediaFormat>,
    #[serde(default)]
    pub placeholder: Option<String>,
}

/// A media format variant of a GIF (e.g. "tiny", "small", "medium", "large").
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GifMediaFormat {
    #[serde(default)]
    pub src: String,
    #[serde(default)]
    pub proxy_src: String,
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
}

/// A featured GIF category (shown on the trending/featured page of the picker).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GifCategory {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub src: String,
    #[serde(default)]
    pub proxy_src: String,
    #[serde(default)]
    pub gif: Option<Gif>,
}

/// The trending/featured response.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct GifFeatured {
    #[serde(default)]
    pub categories: Vec<GifCategory>,
    #[serde(default)]
    pub gifs: Vec<Gif>,
}

impl Gifs {
    /// `GET /gifs/search?q=<query>&locale=<locale>` — search GIFs by keyword.
    pub async fn search(&self, query: &str, locale: &str) -> Result<Vec<Gif>> {
        let builder = self
            .0
            .request(reqwest::Method::GET, "gifs/search")
            .query(&[("q", query), ("locale", locale)]);
        let v: serde_json::Value = self
            .0
            .execute(reqwest::Method::GET, "gifs/search", builder)
            .await?;
        // The response is an array of Gif objects.
        let gifs: Vec<Gif> = serde_json::from_value(v).unwrap_or_default();
        Ok(gifs)
    }

    /// `GET /gifs/trending?locale=<locale>` — get trending GIFs + categories.
    pub async fn trending(&self, locale: &str) -> Result<GifFeatured> {
        let builder = self
            .0
            .request(reqwest::Method::GET, "gifs/trending")
            .query(&[("locale", locale)]);
        let v: serde_json::Value = self
            .0
            .execute(reqwest::Method::GET, "gifs/trending", builder)
            .await?;
        Ok(serde_json::from_value(v).unwrap_or_default())
    }

    /// `GET /gifs/featured?locale=<locale>` — get featured GIF categories.
    pub async fn featured(&self, locale: &str) -> Result<GifFeatured> {
        let builder = self
            .0
            .request(reqwest::Method::GET, "gifs/featured")
            .query(&[("locale", locale)]);
        let v: serde_json::Value = self
            .0
            .execute(reqwest::Method::GET, "gifs/featured", builder)
            .await?;
        Ok(serde_json::from_value(v).unwrap_or_default())
    }
}