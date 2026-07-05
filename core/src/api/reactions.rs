//! Reaction endpoints (`/channels/{cid}/messages/{mid}/reactions/...`).
//!
//! Emoji identifiers in URLs follow the Discord convention:
//! - Unicode emoji: URL-encoded UTF-8 (e.g. `%F0%9F%91%8D` for 👍).
//! - Custom guild emoji: `emoji_name:emoji_id` (e.g. `fluxer:123456789`).
//!
//! Use [`ReactionTarget`] to construct either form safely.

use crate::error::Result;
use crate::http::Http;
use crate::models::{Snowflake, User};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};

/// A reaction emoji identifier, ready to be placed in a path segment.
#[derive(Debug, Clone)]
pub enum ReactionTarget {
    /// A Unicode emoji, encoded for safe inclusion in a URL path segment.
    Unicode(String),
    /// A custom guild emoji: `name:id`.
    Custom { name: String, id: Snowflake },
}

impl ReactionTarget {
    /// Build the path-safe representation. Unicode emoji are percent-encoded; custom
    /// emoji use the `name:id` form which is already URL-safe.
    pub fn path_segment(&self) -> String {
        match self {
            ReactionTarget::Unicode(s) => utf8_percent_encode(s, NON_ALPHANUMERIC).to_string(),
            ReactionTarget::Custom { name, id } => format!("{}:{}", name, id),
        }
    }
}

/// Reaction management.
#[derive(Clone, Debug)]
pub struct Reactions(pub Http);

impl Reactions {
    /// `PUT /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me`
    /// — add a reaction to a message as the current user.
    pub async fn add(
        &self,
        channel_id: &Snowflake,
        message_id: &Snowflake,
        emoji: &ReactionTarget,
    ) -> Result<()> {
        let path = format!(
            "channels/{}/messages/{}/reactions/{}/@me",
            channel_id,
            message_id,
            emoji.path_segment()
        );
        self.0.send_empty(reqwest::Method::PUT, &path).await
    }

    /// `DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me`
    /// — remove the current user's own reaction.
    pub async fn remove_own(
        &self,
        channel_id: &Snowflake,
        message_id: &Snowflake,
        emoji: &ReactionTarget,
    ) -> Result<()> {
        let path = format!(
            "channels/{}/messages/{}/reactions/{}/@me",
            channel_id,
            message_id,
            emoji.path_segment()
        );
        self.0.delete::<()>(&path).await
    }

    /// `DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/{target_id}`
    /// — remove another user's reaction (requires moderation permissions).
    pub async fn remove_for(
        &self,
        channel_id: &Snowflake,
        message_id: &Snowflake,
        emoji: &ReactionTarget,
        target_id: &Snowflake,
    ) -> Result<()> {
        let path = format!(
            "channels/{}/messages/{}/reactions/{}/{}",
            channel_id,
            message_id,
            emoji.path_segment(),
            target_id
        );
        self.0.delete::<()>(&path).await
    }

    /// `DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji}`
    /// — remove everyone's reactions of a specific emoji (moderator only).
    pub async fn remove_all_for_emoji(
        &self,
        channel_id: &Snowflake,
        message_id: &Snowflake,
        emoji: &ReactionTarget,
    ) -> Result<()> {
        let path = format!(
            "channels/{}/messages/{}/reactions/{}",
            channel_id,
            message_id,
            emoji.path_segment()
        );
        self.0.delete::<()>(&path).await
    }

    /// `DELETE /channels/{channel_id}/messages/{message_id}/reactions` — remove all
    /// reactions from a message (moderator only).
    pub async fn remove_all(&self, channel_id: &Snowflake, message_id: &Snowflake) -> Result<()> {
        let path = format!("channels/{}/messages/{}/reactions", channel_id, message_id);
        self.0.delete::<()>(&path).await
    }

    /// `GET /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/users`
    /// — paginate users who reacted with a specific emoji.
    pub async fn users(
        &self,
        channel_id: &Snowflake,
        message_id: &Snowflake,
        emoji: &ReactionTarget,
        limit: Option<i32>,
        after: Option<&Snowflake>,
    ) -> Result<Vec<User>> {
        let path = format!(
            "channels/{}/messages/{}/reactions/{}/users",
            channel_id,
            message_id,
            emoji.path_segment()
        );
        let mut builder = self.0.request(reqwest::Method::GET, &path);
        if let Some(limit) = limit {
            builder = builder.query(&[("limit", limit.to_string())]);
        }
        if let Some(after) = after {
            builder = builder.query(&[("after", after.as_str())]);
        }
        self.0.execute(reqwest::Method::GET, &path, builder).await
    }
}
