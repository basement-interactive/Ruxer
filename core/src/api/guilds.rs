//! Guild endpoints (`/guilds/{id}`, channels, members, roles, emojis).

use crate::error::Result;
use crate::http::Http;
use crate::models::{Channel, Emoji, Guild, Member, Role, Snowflake, Sticker};

/// Guild management.
#[derive(Clone, Debug)]
pub struct Guilds(pub Http);

impl Guilds {
    /// `GET /guilds/{guild_id}` — fetch a guild the current user is a member of.
    pub async fn get(&self, guild_id: &Snowflake) -> Result<Guild> {
        let path = format!("guilds/{}", guild_id);
        self.0.get(&path).await
    }

    /// `GET /guilds/{guild_id}/channels` — list the guild's channels.
    pub async fn channels(&self, guild_id: &Snowflake) -> Result<Vec<Channel>> {
        let path = format!("guilds/{}/channels", guild_id);
        self.0.get(&path).await
    }

    /// `GET /guilds/{guild_id}/members` — list guild members (paginated by `after` + `limit`).
    pub async fn members(
        &self,
        guild_id: &Snowflake,
        limit: Option<i32>,
        after: Option<&Snowflake>,
    ) -> Result<Vec<Member>> {
        let path = format!("guilds/{}/members", guild_id);
        let mut builder = self.0.request(reqwest::Method::GET, &path);
        if let Some(limit) = limit {
            builder = builder.query(&[("limit", limit.to_string())]);
        }
        if let Some(after) = after {
            builder = builder.query(&[("after", after.as_str())]);
        }
        self.0.execute(reqwest::Method::GET, &path, builder).await
    }

    /// `GET /guilds/{guild_id}/members/{user_id}` — fetch a single guild member.
    pub async fn member(&self, guild_id: &Snowflake, user_id: &Snowflake) -> Result<Member> {
        let path = format!("guilds/{}/members/{}", guild_id, user_id);
        self.0.get(&path).await
    }

    /// `GET /guilds/{guild_id}/members/@me` — the current user's membership in the guild.
    pub async fn current_member(&self, guild_id: &Snowflake) -> Result<Member> {
        let path = format!("guilds/{}/members/@me", guild_id);
        self.0.get(&path).await
    }

    /// `PATCH /guilds/{guild_id}/members/{user_id}` — update a member. Used for
    /// voice moderation: `mute`/`deaf` (server mute/deafen), `channel_id`
    /// (move/disconnect — `None` disconnects), and `nick`.
    pub async fn update_member(
        &self,
        guild_id: &Snowflake,
        user_id: &Snowflake,
        mute: Option<bool>,
        deaf: Option<bool>,
        channel_id: Option<Option<Snowflake>>,
        nick: Option<&str>,
        // Double Option like `channel_id`: Some(Some(ts)) sets a timeout until
        // the ISO-8601 timestamp, Some(None) clears it, None omits the field.
        communication_disabled_until: Option<Option<&str>>,
    ) -> Result<Member> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            mute: Option<bool>,
            #[serde(skip_serializing_if = "Option::is_none")]
            deaf: Option<bool>,
            // `channel_id` uses a double Option so we can serialize an explicit
            // `null` (disconnect) vs omit the field entirely.
            #[serde(skip_serializing_if = "Option::is_none")]
            channel_id: Option<Option<Snowflake>>,
            #[serde(skip_serializing_if = "Option::is_none")]
            nick: Option<&'a str>,
            #[serde(skip_serializing_if = "Option::is_none")]
            communication_disabled_until: Option<Option<&'a str>>,
        }
        let path = format!("guilds/{}/members/{}", guild_id, user_id);
        self.0
            .send_json(
                reqwest::Method::PATCH,
                &path,
                &Body {
                    mute,
                    deaf,
                    channel_id,
                    nick,
                    communication_disabled_until,
                },
            )
            .await
    }

    /// `PATCH /guilds/{guild_id}` — partial update of guild settings (e.g.
    /// `{"name": "...", "verification_level": 1}`). Loosely typed; returns the
    /// updated guild object as JSON.
    pub async fn update(
        &self,
        guild_id: &Snowflake,
        patch: &serde_json::Value,
    ) -> Result<serde_json::Value> {
        let path = format!("guilds/{}", guild_id);
        self.0
            .send_json(reqwest::Method::PATCH, &path, patch)
            .await
    }

    /// `PATCH /guilds/{guild_id}/channels` — bulk channel position/parent update
    /// (reorder). `positions` is an array of `{id, position, parent_id?}`.
    /// Returns 204 No Content.
    pub async fn reorder_channels(
        &self,
        guild_id: &Snowflake,
        positions: &serde_json::Value,
    ) -> Result<()> {
        let path = format!("guilds/{}/channels", guild_id);
        self.0
            .send_json(reqwest::Method::PATCH, &path, positions)
            .await
    }

    /// `GET /guilds/{guild_id}/vanity-url` — the guild's vanity invite `{code, uses}`.
    pub async fn vanity_url(&self, guild_id: &Snowflake) -> Result<serde_json::Value> {
        let path = format!("guilds/{}/vanity-url", guild_id);
        self.0.get(&path).await
    }

    /// `PATCH /guilds/{guild_id}/vanity-url` — set the guild's vanity invite code.
    pub async fn update_vanity_url(
        &self,
        guild_id: &Snowflake,
        code: &str,
    ) -> Result<serde_json::Value> {
        let path = format!("guilds/{}/vanity-url", guild_id);
        self.0
            .send_json(
                reqwest::Method::PATCH,
                &path,
                &serde_json::json!({ "code": code }),
            )
            .await
    }

    /// `POST /guilds/{guild_id}/transfer-ownership` — transfer ownership to
    /// another member. Requires the current owner's account password.
    pub async fn transfer_ownership(
        &self,
        guild_id: &Snowflake,
        new_owner_id: &Snowflake,
        password: &str,
    ) -> Result<serde_json::Value> {
        let path = format!("guilds/{}/transfer-ownership", guild_id);
        self.0
            .send_json(
                reqwest::Method::POST,
                &path,
                &serde_json::json!({ "new_owner_id": new_owner_id, "password": password }),
            )
            .await
    }

    /// `GET /guilds/{guild_id}/roles` — list the guild's roles.
    pub async fn roles(&self, guild_id: &Snowflake) -> Result<Vec<Role>> {
        let path = format!("guilds/{}/roles", guild_id);
        self.0.get(&path).await
    }

    /// `POST /guilds/{guild_id}/roles` — create a role. `name` is required;
    /// `color` (RGB int, 0 = none) + `permissions` (bitfield as a string) are
    /// optional.
    pub async fn create_role(
        &self,
        guild_id: &Snowflake,
        name: &str,
        color: Option<i64>,
        permissions: Option<&str>,
    ) -> Result<Role> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            name: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            color: Option<i64>,
            #[serde(skip_serializing_if = "Option::is_none")]
            permissions: Option<&'a str>,
        }
        let path = format!("guilds/{}/roles", guild_id);
        self.0
            .send_json(
                reqwest::Method::POST,
                &path,
                &Body {
                    name,
                    color,
                    permissions,
                },
            )
            .await
    }

    /// `PATCH /guilds/{guild_id}/roles/{role_id}` — update a role. Every field
    /// is optional; only the supplied fields are changed.
    pub async fn update_role(
        &self,
        guild_id: &Snowflake,
        role_id: &Snowflake,
        name: Option<&str>,
        color: Option<i64>,
        permissions: Option<&str>,
        hoist: Option<bool>,
        mentionable: Option<bool>,
    ) -> Result<Role> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            name: Option<&'a str>,
            #[serde(skip_serializing_if = "Option::is_none")]
            color: Option<i64>,
            #[serde(skip_serializing_if = "Option::is_none")]
            permissions: Option<&'a str>,
            #[serde(skip_serializing_if = "Option::is_none")]
            hoist: Option<bool>,
            #[serde(skip_serializing_if = "Option::is_none")]
            mentionable: Option<bool>,
        }
        let path = format!("guilds/{}/roles/{}", guild_id, role_id);
        self.0
            .send_json(
                reqwest::Method::PATCH,
                &path,
                &Body {
                    name,
                    color,
                    permissions,
                    hoist,
                    mentionable,
                },
            )
            .await
    }

    /// `DELETE /guilds/{guild_id}/roles/{role_id}` — delete a role.
    pub async fn delete_role(&self, guild_id: &Snowflake, role_id: &Snowflake) -> Result<()> {
        let path = format!("guilds/{}/roles/{}", guild_id, role_id);
        self.0.delete::<()>(&path).await
    }

    /// `PUT /guilds/{guild_id}/members/{user_id}/roles/{role_id}` — assign a
    /// role to a member.
    pub async fn add_member_role(
        &self,
        guild_id: &Snowflake,
        user_id: &Snowflake,
        role_id: &Snowflake,
    ) -> Result<()> {
        let path = format!("guilds/{}/members/{}/roles/{}", guild_id, user_id, role_id);
        self.0
            .send_json(reqwest::Method::PUT, &path, &serde_json::json!({}))
            .await
    }

    /// `DELETE /guilds/{guild_id}/members/{user_id}/roles/{role_id}` — remove a
    /// role from a member.
    pub async fn remove_member_role(
        &self,
        guild_id: &Snowflake,
        user_id: &Snowflake,
        role_id: &Snowflake,
    ) -> Result<()> {
        let path = format!("guilds/{}/members/{}/roles/{}", guild_id, user_id, role_id);
        self.0.delete::<()>(&path).await
    }

    /// `GET /guilds/{guild_id}/emojis` — list the guild's custom emojis.
    pub async fn emojis(&self, guild_id: &Snowflake) -> Result<Vec<Emoji>> {
        let path = format!("guilds/{}/emojis", guild_id);
        self.0.get(&path).await
    }

    /// `POST /guilds/{guild_id}/emojis` — create a custom emoji. `image` is a
    /// base64 data URI (e.g. `data:image/png;base64,…`).
    pub async fn create_emoji(
        &self,
        guild_id: &Snowflake,
        name: &str,
        image: &str,
    ) -> Result<Emoji> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            name: &'a str,
            image: &'a str,
        }
        let path = format!("guilds/{}/emojis", guild_id);
        self.0
            .send_json(reqwest::Method::POST, &path, &Body { name, image })
            .await
    }

    /// `PATCH /guilds/{guild_id}/emojis/{emoji_id}` — rename a custom emoji.
    pub async fn update_emoji(
        &self,
        guild_id: &Snowflake,
        emoji_id: &Snowflake,
        name: &str,
    ) -> Result<Emoji> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            name: &'a str,
        }
        let path = format!("guilds/{}/emojis/{}", guild_id, emoji_id);
        self.0
            .send_json(reqwest::Method::PATCH, &path, &Body { name })
            .await
    }

    /// `DELETE /guilds/{guild_id}/emojis/{emoji_id}` — delete a custom emoji.
    pub async fn delete_emoji(&self, guild_id: &Snowflake, emoji_id: &Snowflake) -> Result<()> {
        let path = format!("guilds/{}/emojis/{}", guild_id, emoji_id);
        self.0.delete::<()>(&path).await
    }

    /// `GET /guilds/{guild_id}/stickers` — list the guild's custom stickers.
    pub async fn stickers(&self, guild_id: &Snowflake) -> Result<Vec<Sticker>> {
        let path = format!("guilds/{}/stickers", guild_id);
        self.0.get(&path).await
    }

    /// `GET /stickers/{sticker_id}/metadata` — fetch sticker metadata.
    pub async fn sticker_metadata(&self, sticker_id: &Snowflake) -> Result<Sticker> {
        let path = format!("stickers/{}/metadata", sticker_id);
        self.0.get(&path).await
    }

    /// `POST /guilds/{guild_id}/stickers` — create a custom sticker. `image` is
    /// a base64 data URI; `tags` are search keywords.
    pub async fn create_sticker(
        &self,
        guild_id: &Snowflake,
        name: &str,
        description: Option<&str>,
        tags: &[String],
        image: &str,
    ) -> Result<Sticker> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            name: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            description: Option<&'a str>,
            tags: &'a [String],
            image: &'a str,
        }
        let path = format!("guilds/{}/stickers", guild_id);
        self.0
            .send_json(
                reqwest::Method::POST,
                &path,
                &Body {
                    name,
                    description,
                    tags,
                    image,
                },
            )
            .await
    }

    /// `PATCH /guilds/{guild_id}/stickers/{sticker_id}` — update a sticker's
    /// name/description/tags.
    pub async fn update_sticker(
        &self,
        guild_id: &Snowflake,
        sticker_id: &Snowflake,
        name: Option<&str>,
        description: Option<&str>,
        tags: Option<&[String]>,
    ) -> Result<Sticker> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            name: Option<&'a str>,
            #[serde(skip_serializing_if = "Option::is_none")]
            description: Option<&'a str>,
            #[serde(skip_serializing_if = "Option::is_none")]
            tags: Option<&'a [String]>,
        }
        let path = format!("guilds/{}/stickers/{}", guild_id, sticker_id);
        self.0
            .send_json(
                reqwest::Method::PATCH,
                &path,
                &Body {
                    name,
                    description,
                    tags,
                },
            )
            .await
    }

    /// `DELETE /guilds/{guild_id}/stickers/{sticker_id}` — delete a sticker.
    pub async fn delete_sticker(
        &self,
        guild_id: &Snowflake,
        sticker_id: &Snowflake,
    ) -> Result<()> {
        let path = format!("guilds/{}/stickers/{}", guild_id, sticker_id);
        self.0.delete::<()>(&path).await
    }

    /// `DELETE /users/@me/guilds/{guild_id}` (via the users API) is also surfaced here
    /// as a convenience; see [`crate::api::users::Users::leave_guild`] for the canonical path.
    pub async fn leave(&self, guild_id: &Snowflake) -> Result<()> {
        let path = format!("users/@me/guilds/{}", guild_id);
        self.0
            .send_json(reqwest::Method::DELETE, &path, &serde_json::json!({}))
            .await
    }

    /// `POST /guilds` — create a new guild. The current user becomes the owner.
    /// `name` is required (2–100 chars); `icon` is an optional base64 data URI.
    pub async fn create(&self, name: &str, icon: Option<&str>) -> Result<Guild> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            name: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            icon: Option<&'a str>,
        }
        self.0
            .send_json(
                reqwest::Method::POST,
                "guilds",
                &Body { name, icon },
            )
            .await
    }

    /// `GET /guilds/{guild_id}/bans` — list the guild's bans.
    pub async fn bans(&self, guild_id: &Snowflake) -> Result<Vec<crate::models::GuildBan>> {
        let path = format!("guilds/{}/bans", guild_id);
        self.0.get(&path).await
    }

    /// `PUT /guilds/{guild_id}/bans/{user_id}` — ban a user. `reason` is
    /// optional; `delete_message_seconds` controls how much of the user's
    /// recent message history is deleted (0 = none).
    pub async fn ban(
        &self,
        guild_id: &Snowflake,
        user_id: &Snowflake,
        reason: Option<&str>,
        delete_message_seconds: Option<i64>,
    ) -> Result<()> {
        let path = format!("guilds/{}/bans/{}", guild_id, user_id);
        #[derive(serde::Serialize)]
        struct Body<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            reason: Option<&'a str>,
            #[serde(skip_serializing_if = "Option::is_none")]
            delete_message_seconds: Option<i64>,
        }
        self.0
            .send_json(
                reqwest::Method::PUT,
                &path,
                &Body {
                    reason,
                    delete_message_seconds,
                },
            )
            .await
    }

    /// `DELETE /guilds/{guild_id}/bans/{user_id}` — unban a user.
    pub async fn unban(&self, guild_id: &Snowflake, user_id: &Snowflake) -> Result<()> {
        let path = format!("guilds/{}/bans/{}", guild_id, user_id);
        self.0.delete::<()>(&path).await
    }

    /// `DELETE /guilds/{guild_id}/members/{user_id}` — kick a member.
    pub async fn kick(&self, guild_id: &Snowflake, user_id: &Snowflake) -> Result<()> {
        let path = format!("guilds/{}/members/{}", guild_id, user_id);
        self.0.delete::<()>(&path).await
    }

    /// `DELETE /guilds/{guild_id}` — delete the guild (owner only).
    pub async fn delete(&self, guild_id: &Snowflake) -> Result<()> {
        let path = format!("guilds/{}", guild_id);
        self.0.delete::<()>(&path).await
    }

    /// `GET /guilds/{guild_id}/audit-logs` — list the guild's audit log entries.
    pub async fn audit_log(
        &self,
        guild_id: &Snowflake,
        limit: Option<u32>,
        action_type: Option<i32>,
        user_id: Option<&Snowflake>,
    ) -> Result<serde_json::Value> {
        let mut path = format!("guilds/{}/audit-logs", guild_id);
        let mut q: Vec<String> = Vec::new();
        if let Some(l) = limit {
            q.push(format!("limit={l}"));
        }
        if let Some(a) = action_type {
            q.push(format!("action_type={a}"));
        }
        if let Some(u) = user_id {
            q.push(format!("user_id={u}"));
        }
        if !q.is_empty() {
            path.push('?');
            path.push_str(&q.join("&"));
        }
        self.0.get(&path).await
    }
}
