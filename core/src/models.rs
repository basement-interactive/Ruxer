//! Core data models for the Fluxer API.
//!
//! These types cover the fields needed for guilds, direct messages, messaging, and
//! reactions. Anything we do not currently surface (embeds, attachments metadata,
//! audit logs, etc.) is intentionally left out to keep the surface minimal. The
//! Fluxer API closely follows Discord's REST shape, so existing Discord bot
//! authors should find the structure familiar.

use serde::{Deserialize, Serialize};

/// A Fluxer snowflake identifier. Newtyped for clarity; serialized as a string.
pub type Snowflake = String;

/// Notification level preference.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(into = "i32", try_from = "i32")]
pub enum NotificationLevel {
    AllMessages,
    OnlyMentions,
    NoMessages,
    Inherit,
}

impl From<NotificationLevel> for i32 {
    fn from(value: NotificationLevel) -> Self {
        match value {
            NotificationLevel::AllMessages => 0,
            NotificationLevel::OnlyMentions => 1,
            NotificationLevel::NoMessages => 2,
            NotificationLevel::Inherit => 3,
        }
    }
}

impl TryFrom<i32> for NotificationLevel {
    type Error = crate::Error;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        Ok(match value {
            0 => NotificationLevel::AllMessages,
            1 => NotificationLevel::OnlyMentions,
            2 => NotificationLevel::NoMessages,
            3 => NotificationLevel::Inherit,
            other => {
                return Err(crate::Error::Api {
                    code: "BAD_REQUEST".into(),
                    message: format!("unknown notification level {other}"),
                    status: reqwest::StatusCode::BAD_REQUEST,
                    body: String::new(),
                })
            }
        })
    }
}

/// Partial user object returned alongside messages and in lists.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct User {
    pub id: Snowflake,
    pub username: String,
    pub discriminator: String,
    #[serde(default)]
    pub global_name: Option<String>,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub avatar_color: Option<i32>,
    #[serde(default)]
    pub bot: bool,
    #[serde(default)]
    pub system: bool,
    #[serde(default)]
    pub flags: i32,
}

impl User {
    /// Effective display name: the global name if set, otherwise the username.
    pub fn display_name(&self) -> &str {
        self.global_name.as_deref().unwrap_or(&self.username)
    }

    /// The classic `username#discriminator` tag.
    pub fn tag(&self) -> String {
        format!("{}#{}", self.username, self.discriminator)
    }
}

/// The private (authenticated) user object returned by `GET /users/@me`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UserPrivate {
    #[serde(flatten)]
    pub user: User,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub verified: bool,
    #[serde(default)]
    pub mfa_enabled: bool,
    #[serde(default)]
    pub bio: Option<String>,
    #[serde(default)]
    pub pronouns: Option<String>,
    #[serde(default)]
    pub banner: Option<String>,
    #[serde(default)]
    pub accent_color: Option<i32>,
    #[serde(default)]
    pub premium_type: Option<i32>,
}

/// A guild role.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Role {
    pub id: Snowflake,
    pub name: String,
    #[serde(default)]
    pub color: i32,
    pub position: i32,
    pub permissions: String,
    #[serde(default)]
    pub hoist: bool,
    #[serde(default)]
    pub mentionable: bool,
}

/// A custom guild emoji.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Emoji {
    pub id: Snowflake,
    pub name: String,
    #[serde(default)]
    pub animated: bool,
    #[serde(default)]
    pub nsfw: bool,
}

/// A custom guild sticker.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Sticker {
    pub id: Snowflake,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub format_type: i32,
    #[serde(default)]
    pub guild_id: Option<Snowflake>,
}

/// A guild (community) object.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Guild {
    pub id: Snowflake,
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub banner: Option<String>,
    #[serde(default)]
    pub splash: Option<String>,
    pub owner_id: Snowflake,
    #[serde(default)]
    pub features: Vec<String>,
    #[serde(default)]
    pub verification_level: i32,
    #[serde(default)]
    pub nsfw: bool,
    #[serde(default)]
    pub member_count: Option<i32>,
    #[serde(default)]
    pub online_count: Option<i32>,
    #[serde(default)]
    pub roles: Vec<Role>,
    #[serde(default)]
    pub emojis: Vec<Emoji>,
    #[serde(default)]
    pub channels: Vec<Channel>,
}

/// Numeric channel type identifiers used by Fluxer (mirrors Discord values).
pub mod channel_type {
    pub const GUILD_TEXT: i32 = 0;
    pub const DM: i32 = 1;
    pub const GUILD_VOICE: i32 = 2;
    pub const GROUP_DM: i32 = 3;
    pub const GUILD_CATEGORY: i32 = 4;
    pub const GUILD_LINK: i32 = 998;
}

/// A permission overwrite entry on a channel.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PermissionOverwrite {
    pub id: Snowflake,
    #[serde(rename = "type")]
    pub kind: i32,
    pub allow: String,
    pub deny: String,
}

/// A channel object. Covers both guild channels and DM channels.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Channel {
    pub id: Snowflake,
    #[serde(rename = "type")]
    pub kind: i32,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub topic: Option<String>,
    #[serde(default)]
    pub guild_id: Option<Snowflake>,
    #[serde(default)]
    pub owner_id: Option<Snowflake>,
    #[serde(default)]
    pub parent_id: Option<Snowflake>,
    #[serde(default)]
    pub last_message_id: Option<Snowflake>,
    #[serde(default)]
    pub nsfw: bool,
    #[serde(default)]
    pub rate_limit_per_user: Option<i32>,
    #[serde(default)]
    pub recipients: Vec<User>,
    #[serde(default)]
    pub permission_overwrites: Vec<PermissionOverwrite>,
    #[serde(default)]
    pub position: Option<i32>,
}

impl Channel {
    /// Whether this channel is a 1:1 direct message.
    pub fn is_dm(&self) -> bool {
        self.kind == channel_type::DM
    }

    /// Whether this channel is a group DM.
    pub fn is_group_dm(&self) -> bool {
        self.kind == channel_type::GROUP_DM
    }

    /// Whether this channel is a guild text channel.
    pub fn is_guild_text(&self) -> bool {
        self.kind == channel_type::GUILD_TEXT
    }
}

/// A guild member (user + per-guild metadata).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Member {
    pub user: User,
    #[serde(default)]
    pub nick: Option<String>,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub roles: Vec<Snowflake>,
    // Defaulted so a member with a null/absent joined_at still deserializes
    // (otherwise the whole member parse fails and roles never load).
    #[serde(default)]
    pub joined_at: String,
    #[serde(default)]
    pub mute: bool,
    #[serde(default)]
    pub deaf: bool,
    #[serde(default)]
    pub communication_disabled_until: Option<String>,
}

/// Emoji descriptor as it appears inside a reaction object.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ReactionEmoji {
    #[serde(default)]
    pub id: Option<Snowflake>,
    pub name: String,
    #[serde(default)]
    pub animated: Option<bool>,
}

/// A reaction summary attached to a message.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Reaction {
    pub emoji: ReactionEmoji,
    pub count: i32,
    #[serde(default)]
    pub me: Option<bool>,
}

/// Numeric message type identifiers (mirrors Discord values).
pub mod message_type {
    pub const DEFAULT: i32 = 0;
    pub const RECIPIENT_ADD: i32 = 1;
    pub const RECIPIENT_REMOVE: i32 = 2;
    pub const CALL: i32 = 3;
    pub const CHANNEL_NAME_CHANGE: i32 = 4;
    pub const CHANNEL_ICON_CHANGE: i32 = 5;
    pub const CHANNEL_PINNED_MESSAGE: i32 = 6;
    pub const USER_JOIN: i32 = 7;
    pub const REPLY: i32 = 19;
}

/// Bitfield flags for messages.
pub mod message_flags {
    pub const SUPPRESS_EMBEDS: i32 = 4;
    pub const SUPPRESS_NOTIFICATIONS: i32 = 4096;
    pub const VOICE_MESSAGE: i32 = 8192;
    pub const COMPACT_ATTACHMENTS: i32 = 131072;
}

/// A reference to another message (used for replies and forwards).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MessageReference {
    pub message_id: Snowflake,
    #[serde(default)]
    pub channel_id: Option<Snowflake>,
    #[serde(default)]
    pub guild_id: Option<Snowflake>,
    /// `0` = reply (default), `1` = forward.
    #[serde(default = "default_reference_type")]
    #[serde(rename = "type")]
    pub kind: i32,
    /// When forwarding only selected media: attachment ids to include (max 10).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attachment_ids: Option<Vec<Snowflake>>,
    /// When forwarding only selected media: embed indices to include (max 10).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub embed_indices: Option<Vec<i32>>,
}

fn default_reference_type() -> i32 {
    0
}

/// Controls which mentions trigger notifications when sending a message.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct AllowedMentions {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub parse: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub users: Vec<Snowflake>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub roles: Vec<Snowflake>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replied_user: Option<bool>,
}

impl AllowedMentions {
    /// Allow no mentions at all.
    pub fn none() -> Self {
        Self::default()
    }

    /// Allow only the explicit user/role IDs supplied.
    pub fn explicit() -> Self {
        Self {
            parse: Vec::new(),
            ..Self::default()
        }
    }
}

/// A message.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Message {
    pub id: Snowflake,
    pub channel_id: Snowflake,
    pub author: User,
    #[serde(default)]
    pub webhook_id: Option<Snowflake>,
    #[serde(rename = "type")]
    pub kind: i32,
    #[serde(default)]
    pub flags: i32,
    pub content: String,
    pub timestamp: String,
    #[serde(default)]
    pub edited_timestamp: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub mention_everyone: bool,
    #[serde(default)]
    pub tts: bool,
    #[serde(default)]
    pub mentions: Vec<User>,
    #[serde(default)]
    pub mention_roles: Vec<Snowflake>,
    #[serde(default)]
    pub reactions: Vec<Reaction>,
    #[serde(default)]
    pub attachments: Vec<Attachment>,
    /// Generated link previews / rich embeds attached to the message.
    /// Defaults to empty when the server omits the field.
    #[serde(default)]
    pub embeds: Vec<Embed>,
    /// Snapshots of forwarded messages (present when this message is a forward).
    /// Defaults to empty for normal messages.
    #[serde(default)]
    pub message_snapshots: Vec<MessageSnapshot>,
    #[serde(default)]
    pub message_reference: Option<MessageReference>,
    #[serde(default)]
    pub nonce: Option<String>,
}

/// A snapshot of a forwarded message, attached to the carrier message's
/// `message_snapshots` array. Mirrors the Fluxer `MessageSnapshotResponse`
/// schema. Carries the original content/embeds/attachments; the carrier
/// message's author is the forwarder.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MessageSnapshot {
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub timestamp: Option<String>,
    #[serde(default)]
    pub edited_timestamp: Option<String>,
    #[serde(default)]
    pub embeds: Vec<Embed>,
    #[serde(default)]
    pub attachments: Vec<Attachment>,
    #[serde(default)]
    pub kind: i32,
}

/// A message embed (link preview / rich embed / video / image). Mirrors the
/// Fluxer `MessageEmbedResponse` schema. Only `kind` is required; every other
/// field is optional. The `html` field carries sanitized oEmbed HTML (e.g. a
/// YouTube `<iframe>`) for video/article embeds that the client can render.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Embed {
    /// Embed type: `rich`, `image`, `video`, `gifv`, `article`, `link`.
    #[serde(rename = "type", default = "default_embed_type")]
    pub kind: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub color: Option<i32>,
    #[serde(default)]
    pub timestamp: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<EmbedAuthor>,
    #[serde(default)]
    pub image: Option<EmbedMedia>,
    #[serde(default)]
    pub thumbnail: Option<EmbedMedia>,
    #[serde(default)]
    pub footer: Option<EmbedFooter>,
    #[serde(default)]
    pub fields: Vec<EmbedField>,
    /// Provider (e.g. "YouTube", "Twitter"); reuses the author shape.
    #[serde(default)]
    pub provider: Option<EmbedAuthor>,
    #[serde(default)]
    pub video: Option<EmbedMedia>,
    #[serde(default)]
    pub audio: Option<EmbedMedia>,
    /// Sanitized oEmbed HTML (e.g. a YouTube iframe) for inline playback.
    #[serde(default)]
    pub html: Option<String>,
    #[serde(default)]
    pub html_width: Option<i32>,
    #[serde(default)]
    pub html_height: Option<i32>,
    #[serde(default)]
    pub nsfw: Option<bool>,
}

fn default_embed_type() -> String {
    "rich".to_string()
}

/// Embed author/provider metadata.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EmbedAuthor {
    pub name: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub proxy_icon_url: Option<String>,
}

/// An image/video/audio media object on an embed.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EmbedMedia {
    pub url: String,
    #[serde(default)]
    pub proxy_url: Option<String>,
    #[serde(default)]
    pub content_type: Option<String>,
    #[serde(default)]
    pub width: Option<i32>,
    #[serde(default)]
    pub height: Option<i32>,
    #[serde(default)]
    pub description: Option<String>,
    /// Duration in seconds, when known.
    #[serde(default)]
    pub duration: Option<i32>,
}

/// Embed footer.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EmbedFooter {
    pub text: String,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub proxy_icon_url: Option<String>,
}

/// An inline field on a rich embed.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EmbedField {
    pub name: String,
    pub value: String,
    #[serde(default)]
    pub inline: bool,
}

/// A file attached to a message. Mirrors Discord/Fluxer's attachment object.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Attachment {
    pub id: Snowflake,
    #[serde(default)]
    pub filename: String,
    #[serde(default)]
    pub size: i64,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub proxy_url: Option<String>,
    #[serde(default)]
    pub content_type: Option<String>,
    #[serde(default)]
    pub width: Option<i32>,
    #[serde(default)]
    pub height: Option<i32>,
    #[serde(default)]
    pub description: Option<String>,
    /// Attachment bitfield from the server (`MessageAttachmentFlags`):
    /// IS_SPOILER = 8, CONTAINS_EXPLICIT_MEDIA = 16, IS_ANIMATED = 32. The
    /// API carries spoiler state ONLY here — there is no boolean field.
    #[serde(default)]
    pub flags: i32,
    /// Legacy convenience flag kept for older callers; the server never sends
    /// it (see `flags` bit 8).
    #[serde(default)]
    pub spoiler: bool,
}

/// Bitfield flags for message attachments (`MessageAttachmentFlags`).
pub mod attachment_flags {
    pub const IS_SPOILER: i32 = 8;
    pub const CONTAINS_EXPLICIT_MEDIA: i32 = 16;
    pub const IS_ANIMATED: i32 = 32;
}

/// A saved-message (bookmark) entry from `GET /users/@me/saved-messages`.
/// `status` is `"available"` (message populated) or `"missing_permissions"`
/// (kept as a String for forward compatibility).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SavedMessageEntry {
    pub id: Snowflake,
    pub channel_id: Snowflake,
    pub message_id: Snowflake,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub message: Option<Message>,
}

/// A read state entry for a channel.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ReadState {
    pub id: Snowflake,
    #[serde(default)]
    pub mention_count: i32,
    #[serde(default)]
    pub last_message_id: Option<Snowflake>,
    #[serde(default)]
    pub last_pin_timestamp: Option<String>,
}

/// An invite to a guild (or a channel within a guild). Returned by
/// `GET /invites/{code}` and accepted via `POST /invites/{code}`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Invite {
    /// The invite code (the path segment in `fluxer.app/invite/{code}`).
    pub code: String,
    /// The guild the invite points to (present for guild invites).
    #[serde(default)]
    pub guild: Option<InviteGuild>,
    /// The channel the invite points to.
    #[serde(default)]
    pub channel: Option<InviteChannel>,
    /// The user who created the invite, when available.
    #[serde(default)]
    pub inviter: Option<User>,
    /// Approximate member count of the guild, when the server includes it.
    #[serde(default)]
    pub approximate_member_count: Option<i64>,
    /// Approximate presence count (online members), when included.
    #[serde(default)]
    pub approximate_presence_count: Option<i64>,
    /// Max age in seconds (0 = never expires).
    #[serde(default)]
    pub max_age: Option<i32>,
    /// Max number of uses (0 = unlimited).
    #[serde(default)]
    pub max_uses: Option<i32>,
    /// Whether the invite is temporary (kicks members on session end).
    #[serde(default)]
    pub temporary: bool,
    /// Whether the invite has been revoked.
    #[serde(default)]
    pub revoked: bool,
    /// Number of times the invite has been used.
    #[serde(default)]
    pub uses: Option<i32>,
}

/// A trimmed guild object embedded in an [`Invite`]. Only the fields the
/// invite preview needs are surfaced.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct InviteGuild {
    pub id: Snowflake,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub banner: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub features: Vec<String>,
    #[serde(default)]
    pub verification_level: Option<i32>,
}

/// A trimmed channel object embedded in an [`Invite`].
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct InviteChannel {
    pub id: Snowflake,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub kind: i32,
}

/// A guild ban entry: the banned user + an optional reason.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GuildBan {
    #[serde(default)]
    pub reason: Option<String>,
    pub user: User,
}

/// Relationship entry (friend, blocked, pending request).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Relationship {
    pub id: Snowflake,
    #[serde(rename = "type")]
    pub kind: i32,
    pub user: User,
    #[serde(default)]
    pub since: Option<String>,
    #[serde(default)]
    pub nickname: Option<String>,
}

/// Gateway connection info returned by `GET /gateway/bot`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GatewayBot {
    pub url: String,
    pub shards: i64,
    pub session_start_limit: SessionStartLimit,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SessionStartLimit {
    pub total: i64,
    pub remaining: i64,
    pub reset_after: i64,
    pub max_concurrency: i64,
}

/// Cursor-style pagination helpers used by several list endpoints.
#[derive(Debug, Clone, Default)]
pub struct ListParams {
    pub limit: Option<i32>,
    pub before: Option<Snowflake>,
    pub after: Option<Snowflake>,
    pub around: Option<Snowflake>,
}

impl ListParams {
    /// Apply these parameters to a `reqwest::RequestBuilder`.
    pub(crate) fn apply(&self, mut builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if let Some(limit) = self.limit {
            builder = builder.query(&[("limit", limit.to_string())]);
        }
        if let Some(ref before) = self.before {
            builder = builder.query(&[("before", before.as_str())]);
        }
        if let Some(ref after) = self.after {
            builder = builder.query(&[("after", after.as_str())]);
        }
        if let Some(ref around) = self.around {
            builder = builder.query(&[("around", around.as_str())]);
        }
        builder
    }
}
