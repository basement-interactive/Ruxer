//! Search endpoints (`POST /search/messages`).
//!
//! Fluxer's search API is a JSON-body POST (not the GET-with-query-params
//! shape the earlier implementation assumed). The request body mirrors
//! [`GlobalSearchMessagesRequest`][openapi]; the response is a `oneOf` — either
//! `{ messages: [...], total: N }` results, or `{ indexing: true }` when the
//! server is still indexing the relevant channels.
//!
//! [openapi]: https://fluxerapp-fluxer.mintlify.app

use crate::error::{Error, Result};
use crate::http::Http;
use crate::models::{Message, Snowflake};

/// Message search across channels and guilds.
#[derive(Clone, Debug)]
pub struct Search(pub Http);

/// Filters applied to a search query. The server applies whatever it supports;
/// every field is optional. Array fields (`author_id`, `channel_id`, `guild_id`,
/// `has`) match the server's repeated-value shape and are sent as JSON arrays.
#[derive(Debug, Default, Clone)]
pub struct SearchFilters {
    /// Author id filter (`from:<user>`). Treated as an OR across the ids.
    pub author_id: Vec<Snowflake>,
    /// Channel id filter (`in:<channel>`).
    pub channel_id: Vec<Snowflake>,
    /// Guild id filter (scopes the search to a guild).
    pub guild_id: Vec<Snowflake>,
    /// `has:attachment`/`has:image`/`has:video`/`has:sound`/`has:embed`/
    /// `has:link`/`has:file` content flags.
    pub has: Vec<String>,
    /// Page size (1–25, server-capped). Sent as `hits_per_page`.
    pub limit: Option<i32>,
    /// 1-based page number.
    pub page: Option<i64>,
}

/// A single search hit: the matched message.
#[derive(Debug, Clone)]
pub struct SearchHit {
    pub message: Message,
}

/// The parsed search response. Either results (`hits` + optional `total`) or an
/// `indexing` flag meaning the server hasn't finished indexing the relevant
/// channels and the client should retry shortly.
#[derive(Debug, Clone, Default)]
pub struct SearchResponse {
    pub hits: Vec<SearchHit>,
    pub total: Option<i64>,
    /// `true` when the server returned `{ indexing: true }` instead of results.
    pub indexing: bool,
}

impl Search {
    /// `POST /search/messages` — search messages. The query string is the
    /// user's raw search text; the structured filters are sent as JSON fields
    /// when set. Handles both the results response and the `indexing` variant.
    pub async fn search(&self, query: &str, filters: SearchFilters) -> Result<SearchResponse> {
        let body = build_request_body(query, &filters);
        let v: serde_json::Value = self.0.send_json(reqwest::Method::POST, "search/messages", &body).await?;

        // `{ indexing: true }` variant — server is still indexing; no results.
        if v.get("indexing").and_then(|i| i.as_bool()) == Some(true) {
            return Ok(SearchResponse { indexing: true, ..Default::default() });
        }

        // Results variant: `{ messages: [...], total?: N }`.
        let messages = v
            .pointer("/messages")
            .and_then(|m| m.as_array())
            .ok_or_else(|| Error::Api {
                code: "SEARCH_BAD_SHAPE".into(),
                message: format!("unexpected search response shape: {}", v),
                status: reqwest::StatusCode::BAD_REQUEST,
                body: v.to_string(),
            })?;

        let mut hits = Vec::with_capacity(messages.len());
        for m in messages {
            match serde_json::from_value::<Message>(m.clone()) {
                Ok(msg) => hits.push(SearchHit { message: msg }),
                Err(e) => {
                    // Surface malformed hits rather than silently dropping
                    // them (the old `filter_map(...).ok())` swallowed them).
                    tracing::warn!(error = %e, "search hit failed to deserialize as Message");
                }
            }
        }
        let total = v.pointer("/total").and_then(|t| t.as_i64());
        Ok(SearchResponse { hits, total, indexing: false })
    }
}

/// Build the `GlobalSearchMessagesRequest` JSON body. Empty/`None` fields are
/// omitted so the server applies its defaults. Kept as a standalone fn so it
/// can be unit-tested independently of the HTTP layer.
fn build_request_body(query: &str, filters: &SearchFilters) -> serde_json::Value {
    let mut obj = serde_json::Map::new();
    if !query.is_empty() {
        obj.insert("content".into(), query.into());
    }
    if !filters.author_id.is_empty() {
        obj.insert(
            "author_id".into(),
            serde_json::Value::Array(filters.author_id.iter().map(|s| s.as_str().into()).collect()),
        );
    }
    if !filters.channel_id.is_empty() {
        obj.insert(
            "channel_id".into(),
            serde_json::Value::Array(filters.channel_id.iter().map(|s| s.as_str().into()).collect()),
        );
    }
    if !filters.guild_id.is_empty() {
        obj.insert(
            "guild_id".into(),
            serde_json::Value::Array(filters.guild_id.iter().map(|s| s.as_str().into()).collect()),
        );
    }
    if !filters.has.is_empty() {
        obj.insert(
            "has".into(),
            serde_json::Value::Array(filters.has.iter().map(|s| s.as_str().into()).collect()),
        );
    }
    if let Some(limit) = filters.limit {
        // The server caps hits_per_page at 25.
        obj.insert("hits_per_page".into(), limit.min(25).into());
    }
    if let Some(page) = filters.page {
        obj.insert("page".into(), page.into());
    }
    serde_json::Value::Object(obj)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn body_omits_empty_fields() {
        let body = build_request_body("hello", &SearchFilters::default());
        let obj = body.as_object().unwrap();
        assert_eq!(obj.get("content").and_then(|v| v.as_str()), Some("hello"));
        assert!(obj.get("author_id").is_none());
        assert!(obj.get("channel_id").is_none());
        assert!(obj.get("has").is_none());
    }

    #[test]
    fn body_arrays_filters_and_caps_limit() {
        let filters = SearchFilters {
            author_id: vec!["111".into()],
            channel_id: vec!["222".into(), "333".into()],
            has: vec!["embed".into(), "image".into()],
            limit: Some(99),
            page: Some(2),
            ..Default::default()
        };
        let body = build_request_body("", &filters);
        let obj = body.as_object().unwrap();
        // Empty query → no content field.
        assert!(obj.get("content").is_none());
        let author = obj.get("author_id").unwrap().as_array().unwrap();
        assert_eq!(author.len(), 1);
        assert_eq!(author[0].as_str(), Some("111"));
        let channels = obj.get("channel_id").unwrap().as_array().unwrap();
        assert_eq!(channels.len(), 2);
        let has = obj.get("has").unwrap().as_array().unwrap();
        assert_eq!(has.iter().map(|v| v.as_str().unwrap()).collect::<Vec<_>>(), vec!["embed", "image"]);
        // Limit capped at 25.
        assert_eq!(obj.get("hits_per_page").and_then(|v| v.as_i64()), Some(25));
        assert_eq!(obj.get("page").and_then(|v| v.as_i64()), Some(2));
    }
}
