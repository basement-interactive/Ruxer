//! Discovery endpoints (`/discovery/guilds`, `/discovery/categories`).
//!
//! Browse public communities. Source: reference/fluxer/fluxer_app/src/features/app/constants/Endpoints.ts:244-247.

use crate::error::Result;
use crate::http::Http;
use serde::{Deserialize, Serialize};

/// Discovery browsing API.
#[derive(Clone, Debug)]
pub struct Discovery(pub Http);

/// A discoverable guild (public community listing).
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct DiscoveryGuild {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub banner: Option<String>,
    #[serde(default)]
    pub approximate_member_count: Option<i64>,
    #[serde(default)]
    pub approximate_presence_count: Option<i64>,
    #[serde(default)]
    pub features: Vec<String>,
    #[serde(default)]
    pub category: Option<String>,
}

/// A discovery category.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct DiscoveryCategory {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
}

impl Discovery {
    /// `GET /discovery/guilds` — list public communities, optionally filtered.
    pub async fn guilds(&self, category: Option<&str>, query: Option<&str>) -> Result<Vec<DiscoveryGuild>> {
        let mut builder = self.0.request(reqwest::Method::GET, "discovery/guilds");
        if let Some(cat) = category {
            builder = builder.query(&[("category", cat)]);
        }
        if let Some(q) = query {
            builder = builder.query(&[("q", q)]);
        }
        let v: serde_json::Value = self.0.execute(reqwest::Method::GET, "discovery/guilds", builder).await?;
        // Tolerate { guilds: [...] } envelope or bare array.
        if let Some(arr) = v.pointer("/guilds").and_then(|m| m.as_array()) {
            let guilds: Vec<DiscoveryGuild> = arr.iter()
                .filter_map(|g| serde_json::from_value(g.clone()).ok())
                .collect();
            return Ok(guilds);
        }
        if let Some(arr) = v.as_array() {
            let guilds: Vec<DiscoveryGuild> = arr.iter()
                .filter_map(|g| serde_json::from_value(g.clone()).ok())
                .collect();
            return Ok(guilds);
        }
        Ok(Vec::new())
    }

    /// `GET /discovery/categories` — list discovery categories.
    pub async fn categories(&self) -> Result<Vec<DiscoveryCategory>> {
        let v: serde_json::Value = self.0.execute(
            reqwest::Method::GET,
            "discovery/categories",
            self.0.request(reqwest::Method::GET, "discovery/categories"),
        ).await?;
        if let Some(arr) = v.as_array() {
            let cats: Vec<DiscoveryCategory> = arr.iter()
                .filter_map(|c| serde_json::from_value(c.clone()).ok())
                .collect();
            return Ok(cats);
        }
        Ok(Vec::new())
    }

    /// `POST /discovery/guilds/{guild_id}/join` — join a discovered guild.
    pub async fn join(&self, guild_id: &str) -> Result<serde_json::Value> {
        let path = format!("discovery/guilds/{}/join", guild_id);
        self.0.send_json(reqwest::Method::POST, &path, &serde_json::json!({})).await
    }
}