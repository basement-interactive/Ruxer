//! User-related endpoints (`/users/@me`, `/users/{id}`, DM list, relationships).

use crate::error::Result;
use crate::http::Http;
use crate::models::{Channel, Relationship, Snowflake, User, UserPrivate};

/// Users and direct-message channel management.
#[derive(Clone, Debug)]
pub struct Users(pub Http);

impl Users {
    /// `GET /users/@me` — the authenticated user's full private profile.
    pub async fn current(&self) -> Result<UserPrivate> {
        self.0.get("users/@me").await
    }

    /// `GET /users/{user_id}` — public user object by ID.
    pub async fn get(&self, user_id: &Snowflake) -> Result<User> {
        let path = format!("users/{}", user_id);
        self.0.get(&path).await
    }

    /// `GET /users/@me/guilds` — guilds the current user is a member of.
    pub async fn guilds(&self) -> Result<Vec<crate::models::Guild>> {
        self.0.get("users/@me/guilds").await
    }

    /// `GET /users/@me/channels` — the current user's private (DM / group DM) channels.
    pub async fn private_channels(&self) -> Result<Vec<Channel>> {
        self.0.get("users/@me/channels").await
    }

    /// `POST /users/@me/channels` — create or open a 1:1 DM with the given recipient.
    ///
    /// For group DMs pass multiple recipient IDs.
    pub async fn create_dm(&self, recipient_id: &Snowflake) -> Result<Channel> {
        self.create_group_dm(std::slice::from_ref(recipient_id))
            .await
    }

    /// `POST /users/@me/channels` — create a group DM with the given recipients.
    pub async fn create_group_dm(&self, recipients: &[Snowflake]) -> Result<Channel> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            recipients: &'a [Snowflake],
        }
        self.0
            .send_json(
                reqwest::Method::POST,
                "users/@me/channels",
                &Body { recipients },
            )
            .await
    }

    /// `GET /users/@me/relationships` — list friends, blocked users, and pending requests.
    pub async fn relationships(&self) -> Result<Vec<Relationship>> {
        self.0.get("users/@me/relationships").await
    }

    /// `POST /users/@me/relationships/{user_id}` — send a friend request to a user by ID.
    pub async fn send_friend_request(&self, user_id: &Snowflake) -> Result<Relationship> {
        let path = format!("users/@me/relationships/{}", user_id);
        #[derive(serde::Serialize)]
        struct Body {}
        self.0
            .send_json(reqwest::Method::POST, &path, &Body {})
            .await
    }

    /// `DELETE /users/@me/relationships/{user_id}` — remove a friendship, cancel a
    /// pending request, or unblock a user.
    pub async fn remove_relationship(&self, user_id: &Snowflake) -> Result<()> {
        let path = format!("users/@me/relationships/{}", user_id);
        self.0.delete::<()>(&path).await
    }

    /// `POST /users/@me/guilds/{guild_id}` — leave the given guild.
    pub async fn leave_guild(&self, guild_id: &Snowflake) -> Result<()> {
        let path = format!("users/@me/guilds/{}", guild_id);
        self.0
            .send_json(reqwest::Method::DELETE, &path, &serde_json::json!({}))
            .await
    }

    /// `GET /users/@me/mentions` — recent messages that mentioned the current
    /// user. Fluxer has no dedicated read-state endpoint; the inbox/unread
    /// badges are derived from this mentions list. We group the returned
    /// messages by `channel_id` into `ReadState` entries (mention_count + the
    /// newest message id) so the existing `ReadStateStore` can drive badges
    /// and the inbox view unchanged.
    ///
    /// The server returns a bare array of message objects.
    pub async fn read_state(&self) -> Result<Vec<crate::models::ReadState>> {
        let msgs: Vec<crate::models::Message> = self.0.get("users/@me/mentions").await?;
        // Group mentions by channel, keeping the newest message id + a count.
        let mut by_channel: std::collections::HashMap<
            crate::models::Snowflake,
            crate::models::ReadState,
        > = std::collections::HashMap::new();
        for m in msgs {
            let entry = by_channel.entry(m.channel_id.clone()).or_insert_with(|| {
                crate::models::ReadState {
                    id: m.channel_id.clone(),
                    mention_count: 0,
                    last_message_id: None,
                    last_pin_timestamp: None,
                }
            });
            entry.mention_count += 1;
            // Keep the newest message id (lexicographic snowflake ordering ≈
            // chronological since snowflakes are time-based).
            match &entry.last_message_id {
                None => entry.last_message_id = Some(m.id.clone()),
                Some(cur) if &m.id > cur => entry.last_message_id = Some(m.id.clone()),
                _ => {}
            }
        }
        Ok(by_channel.into_values().collect())
    }

    /// `GET /premium/state` — the current user's subscription state. Returned as
    /// raw JSON (the shape is large + loosely-typed; the UI reads the fields it
    /// renders defensively).
    pub async fn premium_state(&self) -> Result<serde_json::Value> {
        self.0.get("premium/state").await
    }

    /// `POST /users/@me/themes` — save a custom theme (a raw CSS override).
    /// Returns the created theme record.
    pub async fn save_theme(&self, css: &str) -> Result<serde_json::Value> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            css: &'a str,
        }
        self.0
            .send_json(reqwest::Method::POST, "users/@me/themes", &Body { css })
            .await
    }
}
