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

    /// `PUT /users/@me/relationships/{user_id}` with `{type: 2}` — block a user.
    pub async fn block_user(&self, user_id: &Snowflake) -> Result<serde_json::Value> {
        let path = format!("users/@me/relationships/{}", user_id);
        self.0
            .send_json(reqwest::Method::PUT, &path, &serde_json::json!({ "type": 2 }))
            .await
    }

    /// `POST /users/@me/relationships` — send a friend request by username
    /// (optionally with a discriminator).
    pub async fn add_friend_by_username(
        &self,
        username: &str,
        discriminator: Option<&str>,
    ) -> Result<serde_json::Value> {
        self.0
            .send_json(
                reqwest::Method::POST,
                "users/@me/relationships",
                &serde_json::json!({ "username": username, "discriminator": discriminator }),
            )
            .await
    }

    /// `GET /users/{user_id}/profile` — a user's rich profile (mutual guilds/
    /// friends, connections, badges, bio).
    pub async fn profile(&self, user_id: &Snowflake) -> Result<serde_json::Value> {
        let path = format!("users/{}/profile", user_id);
        self.0.get(&path).await
    }

    /// `GET /users/@me/notes/{user_id}` — the private note on a user.
    pub async fn get_note(&self, user_id: &Snowflake) -> Result<serde_json::Value> {
        let path = format!("users/@me/notes/{}", user_id);
        self.0.get(&path).await
    }

    /// `PUT /users/@me/notes/{user_id}` — set the private note on a user. 204.
    pub async fn set_note(&self, user_id: &Snowflake, note: &str) -> Result<()> {
        let path = format!("users/@me/notes/{}", user_id);
        self.0
            .send_json(reqwest::Method::PUT, &path, &serde_json::json!({ "note": note }))
            .await
    }

    /// `GET /users/@me/sudo/mfa-methods` — current MFA status
    /// (`{ totp, webauthn, has_mfa }`).
    pub async fn mfa_methods(&self) -> Result<serde_json::Value> {
        self.0.get("users/@me/sudo/mfa-methods").await
    }

    /// `POST /users/@me/mfa/totp/enable` — enable TOTP. The client generates the
    /// `secret` (base32), shows it to the user, and sends it back with a current
    /// `code` from the authenticator. Returns `{ backup_codes }`. `password` is
    /// omitted from the body when `None` (never sent as null).
    pub async fn enable_totp(
        &self,
        secret: &str,
        code: &str,
        password: Option<&str>,
    ) -> Result<serde_json::Value> {
        let mut body = serde_json::json!({ "secret": secret, "code": code });
        if let Some(p) = password {
            body["password"] = serde_json::Value::String(p.to_string());
        }
        self.0
            .send_json(reqwest::Method::POST, "users/@me/mfa/totp/enable", &body)
            .await
    }

    /// `POST /users/@me/mfa/totp/disable` — disable TOTP with a current `code`.
    pub async fn disable_totp(
        &self,
        code: &str,
        password: Option<&str>,
    ) -> Result<serde_json::Value> {
        let mut body = serde_json::json!({ "code": code });
        if let Some(p) = password {
            body["password"] = serde_json::Value::String(p.to_string());
        }
        self.0
            .send_json(reqwest::Method::POST, "users/@me/mfa/totp/disable", &body)
            .await
    }

    /// `POST /users/@me/mfa/backup-codes` — (re)generate backup codes. Returns
    /// `{ backup_codes }`.
    pub async fn regenerate_backup_codes(
        &self,
        regenerate: bool,
        password: Option<&str>,
    ) -> Result<serde_json::Value> {
        let mut body = serde_json::json!({ "regenerate": regenerate });
        if let Some(p) = password {
            body["password"] = serde_json::Value::String(p.to_string());
        }
        self.0
            .send_json(reqwest::Method::POST, "users/@me/mfa/backup-codes", &body)
            .await
    }

    /// `POST /read-states/ack-bulk` — mark multiple channels read at once
    /// (`read_states` = `[{channel_id, message_id}]`). 204.
    pub async fn ack_bulk(&self, read_states: &serde_json::Value) -> Result<()> {
        self.0
            .send_json(
                reqwest::Method::POST,
                "read-states/ack-bulk",
                &serde_json::json!({ "read_states": read_states }),
            )
            .await
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

    /// `PATCH /users/@me/settings` — partial update of the current user's
    /// settings (e.g. `{"render_spoilers": 1}`). Loosely typed on both sides:
    /// the settings object is large and the UI reads it defensively.
    pub async fn update_settings(&self, patch: &serde_json::Value) -> Result<serde_json::Value> {
        self.0
            .send_json(reqwest::Method::PATCH, "users/@me/settings", patch)
            .await
    }

    /// `PATCH /users/@me` — partial update of the current user's account /
    /// profile (e.g. `{"bio": "...", "pronouns": "..."}`). Loosely typed;
    /// returns the updated user object as JSON.
    pub async fn update_current(&self, patch: &serde_json::Value) -> Result<serde_json::Value> {
        self.0
            .send_json(reqwest::Method::PATCH, "users/@me", patch)
            .await
    }

    /// `GET /auth/sessions` — the account's active login sessions.
    pub async fn auth_sessions(&self) -> Result<serde_json::Value> {
        self.0.get("auth/sessions").await
    }

    /// `POST /auth/sessions/logout` — revoke the given sessions (by id-hash).
    /// Requires the account password. Returns 204 No Content.
    pub async fn logout_sessions(
        &self,
        session_id_hashes: &[String],
        password: &str,
    ) -> Result<()> {
        self.0
            .send_json(
                reqwest::Method::POST,
                "auth/sessions/logout",
                &serde_json::json!({ "session_id_hashes": session_id_hashes, "password": password }),
            )
            .await
    }

    /// `GET /users/@me/mobile-devices` — registered mobile push devices
    /// (`{ devices: [...] }`).
    pub async fn mobile_devices(&self) -> Result<serde_json::Value> {
        self.0.get("users/@me/mobile-devices").await
    }

    /// `DELETE /users/@me/mobile-devices/{device_id}` — remove a mobile device.
    pub async fn delete_mobile_device(&self, device_id: &str) -> Result<serde_json::Value> {
        let path = format!("users/@me/mobile-devices/{}", device_id);
        self.0.send_empty(reqwest::Method::DELETE, &path).await
    }

    /// `GET /users/@me/saved-messages` — the current user's bookmarks.
    pub async fn saved_messages(
        &self,
        limit: Option<i32>,
    ) -> Result<Vec<crate::models::SavedMessageEntry>> {
        let path = match limit {
            Some(n) => format!("users/@me/saved-messages?limit={}", n),
            None => "users/@me/saved-messages".to_string(),
        };
        self.0.get(&path).await
    }

    /// `POST /users/@me/saved-messages` — bookmark a message. The server
    /// confirms via a SAVED_MESSAGE_CREATE gateway event (not the response).
    pub async fn save_message(
        &self,
        channel_id: &Snowflake,
        message_id: &Snowflake,
    ) -> Result<()> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            channel_id: &'a Snowflake,
            message_id: &'a Snowflake,
        }
        self.0
            .send_json(
                reqwest::Method::POST,
                "users/@me/saved-messages",
                &Body {
                    channel_id,
                    message_id,
                },
            )
            .await
    }

    /// `DELETE /users/@me/saved-messages/{message_id}` — remove a bookmark.
    pub async fn unsave_message(&self, message_id: &Snowflake) -> Result<()> {
        self.0
            .delete::<()>(&format!("users/@me/saved-messages/{}", message_id))
            .await
    }

    /// `GET /users/@me/scheduled-messages` — the user's pending scheduled
    /// messages.
    pub async fn scheduled_messages(&self) -> Result<Vec<crate::models::ScheduledMessage>> {
        self.0.get("users/@me/scheduled-messages").await
    }

    /// `GET /users/@me/scheduled-messages/{id}` — one scheduled message.
    pub async fn get_scheduled_message(
        &self,
        id: &Snowflake,
    ) -> Result<crate::models::ScheduledMessage> {
        self.0
            .get(&format!("users/@me/scheduled-messages/{}", id))
            .await
    }

    /// `PATCH /users/@me/scheduled-messages/{id}` — replace a scheduled
    /// message's content and/or delivery time.
    pub async fn update_scheduled_message(
        &self,
        id: &Snowflake,
        req: &crate::api::messages::ScheduleMessage,
    ) -> Result<crate::models::ScheduledMessage> {
        self.0
            .send_json(
                reqwest::Method::PATCH,
                &format!("users/@me/scheduled-messages/{}", id),
                req,
            )
            .await
    }

    /// `DELETE /users/@me/scheduled-messages/{id}` — cancel delivery.
    pub async fn cancel_scheduled_message(&self, id: &Snowflake) -> Result<()> {
        self.0
            .delete::<()>(&format!("users/@me/scheduled-messages/{}", id))
            .await
    }
}
