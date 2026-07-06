//! Channel endpoints (`/channels/{id}`, typing, pins, group DM recipients).

use crate::error::Result;
use crate::http::Http;
use crate::models::{Channel, Message, Snowflake};

/// Channel-level operations other than message sending and reactions.
#[derive(Clone, Debug)]
pub struct Channels(pub Http);

impl Channels {
    /// `GET /channels/{channel_id}` — fetch a channel object.
    pub async fn get(&self, channel_id: &Snowflake) -> Result<Channel> {
        let path = format!("channels/{}", channel_id);
        self.0.get(&path).await
    }

    /// `DELETE /channels/{channel_id}` — delete a channel (guild channels) or leave a
    /// group DM. The body matches `SudoVerificationSchema` but is allowed to be empty.
    pub async fn delete(&self, channel_id: &Snowflake) -> Result<()> {
        let path = format!("channels/{}", channel_id);
        self.0
            .send_json(reqwest::Method::DELETE, &path, &serde_json::json!({}))
            .await
    }

    /// `POST /guilds/{guild_id}/channels` — create a channel in a guild. The
    /// caller picks the channel type via `kind` (use [`crate::models::channel_type`]).
    pub async fn create(
        &self,
        guild_id: &Snowflake,
        name: &str,
        kind: i32,
        parent_id: Option<&Snowflake>,
        topic: Option<&str>,
    ) -> Result<Channel> {
        let path = format!("guilds/{}/channels", guild_id);
        #[derive(serde::Serialize)]
        struct Body<'a> {
            name: &'a str,
            #[serde(rename = "type")]
            kind: i32,
            #[serde(skip_serializing_if = "Option::is_none")]
            parent_id: Option<&'a Snowflake>,
            #[serde(skip_serializing_if = "Option::is_none")]
            topic: Option<&'a str>,
        }
        self.0
            .send_json(
                reqwest::Method::POST,
                &path,
                &Body {
                    name,
                    kind,
                    parent_id,
                    topic,
                },
            )
            .await
    }

    /// `PATCH /channels/{channel_id}` — edit a channel's name/topic/parent.
    pub async fn edit(
        &self,
        channel_id: &Snowflake,
        name: Option<&str>,
        topic: Option<&str>,
        parent_id: Option<&Snowflake>,
    ) -> Result<Channel> {
        let path = format!("channels/{}", channel_id);
        #[derive(serde::Serialize)]
        struct Body<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            name: Option<&'a str>,
            #[serde(skip_serializing_if = "Option::is_none")]
            topic: Option<&'a str>,
            #[serde(skip_serializing_if = "Option::is_none")]
            parent_id: Option<&'a Snowflake>,
        }
        self.0
            .send_json(
                reqwest::Method::PATCH,
                &path,
                &Body {
                    name,
                    topic,
                    parent_id,
                },
            )
            .await
    }

    /// `GET /channels/{channel_id}/rtc-regions` — available voice regions
    /// (`[{ id, name, emoji }]`).
    pub async fn rtc_regions(&self, channel_id: &Snowflake) -> Result<serde_json::Value> {
        let path = format!("channels/{}/rtc-regions", channel_id);
        self.0.get(&path).await
    }

    /// `PATCH /channels/{channel_id}/call` — set the call's preferred voice
    /// region (None = automatic). Returns 204 No Content.
    pub async fn set_call_region(
        &self,
        channel_id: &Snowflake,
        region: Option<&str>,
    ) -> Result<()> {
        let path = format!("channels/{}/call", channel_id);
        self.0
            .send_json(
                reqwest::Method::PATCH,
                &path,
                &serde_json::json!({ "region": region }),
            )
            .await
    }

    /// `GET /channels/{channel_id}/call` — the DM/group call state.
    pub async fn get_call(&self, channel_id: &Snowflake) -> Result<serde_json::Value> {
        let path = format!("channels/{}/call", channel_id);
        self.0.get(&path).await
    }

    /// `POST /channels/{channel_id}/call/ring` — ring the given recipients (or
    /// all if None). 204 No Content.
    pub async fn ring_call(
        &self,
        channel_id: &Snowflake,
        recipients: Option<&[Snowflake]>,
    ) -> Result<()> {
        let path = format!("channels/{}/call/ring", channel_id);
        self.0
            .send_json(reqwest::Method::POST, &path, &serde_json::json!({ "recipients": recipients }))
            .await
    }

    /// `POST /channels/{channel_id}/call/stop-ringing` — stop ringing. 204.
    pub async fn stop_ringing(
        &self,
        channel_id: &Snowflake,
        recipients: Option<&[Snowflake]>,
    ) -> Result<()> {
        let path = format!("channels/{}/call/stop-ringing", channel_id);
        self.0
            .send_json(reqwest::Method::POST, &path, &serde_json::json!({ "recipients": recipients }))
            .await
    }

    /// `POST /channels/{channel_id}/call/end` — end the call. 204.
    pub async fn end_call(&self, channel_id: &Snowflake) -> Result<()> {
        let path = format!("channels/{}/call/end", channel_id);
        self.0
            .send_json(reqwest::Method::POST, &path, &serde_json::json!({}))
            .await
    }

    /// `PATCH /channels/{channel_id}` — set slowmode (`rate_limit_per_user`,
    /// seconds) and/or the NSFW flag. Returns the updated channel.
    pub async fn set_options(
        &self,
        channel_id: &Snowflake,
        rate_limit_per_user: Option<i32>,
        nsfw: Option<bool>,
    ) -> Result<Channel> {
        let path = format!("channels/{}", channel_id);
        #[derive(serde::Serialize)]
        struct Body {
            #[serde(skip_serializing_if = "Option::is_none")]
            rate_limit_per_user: Option<i32>,
            #[serde(skip_serializing_if = "Option::is_none")]
            nsfw: Option<bool>,
        }
        self.0
            .send_json(reqwest::Method::PATCH, &path, &Body { rate_limit_per_user, nsfw })
            .await
    }

    /// `POST /channels/{channel_id}/typing` — broadcast a typing indicator (lasts ~10s).
    pub async fn trigger_typing(&self, channel_id: &Snowflake) -> Result<()> {
        let path = format!("channels/{}/typing", channel_id);
        self.0.send_empty(reqwest::Method::POST, &path).await
    }

    /// `GET /channels/{channel_id}/messages/pins` — list pinned messages.
    ///
    /// The Fluxer API wraps the pinned messages in a `{ items: [{ message, pinned_at }], has_more }`
    /// envelope. This method deserializes that envelope and returns just the messages in pin order.
    pub async fn pinned_messages(&self, channel_id: &Snowflake) -> Result<Vec<Message>> {
        let path = format!("channels/{}/messages/pins", channel_id);
        #[derive(serde::Deserialize)]
        struct PinItem {
            message: Message,
            #[allow(dead_code)]
            pinned_at: Option<String>,
        }
        #[derive(serde::Deserialize)]
        struct PinsResponse {
            items: Vec<PinItem>,
            #[allow(dead_code)]
            has_more: Option<bool>,
        }
        let resp: PinsResponse = self.0.get(&path).await?;
        Ok(resp.items.into_iter().map(|i| i.message).collect())
    }

    /// `PUT /channels/{channel_id}/pins/{message_id}` — pin a message.
    pub async fn pin(&self, channel_id: &Snowflake, message_id: &Snowflake) -> Result<()> {
        let path = format!("channels/{}/pins/{}", channel_id, message_id);
        self.0.send_empty(reqwest::Method::PUT, &path).await
    }

    /// `DELETE /channels/{channel_id}/pins/{message_id}` — unpin a message.
    pub async fn unpin(&self, channel_id: &Snowflake, message_id: &Snowflake) -> Result<()> {
        let path = format!("channels/{}/pins/{}", channel_id, message_id);
        self.0.delete::<()>(&path).await
    }

    /// `PUT /channels/{channel_id}/recipients/{user_id}` — add a recipient to a group DM.
    pub async fn add_recipient(&self, channel_id: &Snowflake, user_id: &Snowflake) -> Result<()> {
        let path = format!("channels/{}/recipients/{}", channel_id, user_id);
        self.0.send_empty(reqwest::Method::PUT, &path).await
    }

    /// `DELETE /channels/{channel_id}/recipients/{user_id}` — remove a recipient from a
    /// group DM. For leaving yourself, see [`Channels::delete`].
    pub async fn remove_recipient(
        &self,
        channel_id: &Snowflake,
        user_id: &Snowflake,
    ) -> Result<()> {
        let path = format!("channels/{}/recipients/{}", channel_id, user_id);
        self.0
            .send_json(reqwest::Method::DELETE, &path, &serde_json::json!({}))
            .await
    }

    /// `POST /channels/{channel_id}/messages/{message_id}/ack` — acknowledge
    /// that the user has read up to `message_id` in `channel_id`. The server
    /// updates the user's read state and clears unread/mention badges for that
    /// channel. Call this when the user views a channel and on each new
    /// `MESSAGE_CREATE` in the active channel.
    pub async fn ack_message(
        &self,
        channel_id: &Snowflake,
        message_id: &Snowflake,
    ) -> Result<()> {
        let path = format!(
            "channels/{}/messages/{}/ack",
            channel_id, message_id
        );
        self.0.send_empty(reqwest::Method::POST, &path).await
    }

    /// `POST /channels/{channel_id}/ack` — acknowledge the channel itself (mark
    /// every message in it as read). Use [`Self::ack_message`] for incremental
    /// reads; this is for "mark all as read" flows.
    pub async fn ack_channel(&self, channel_id: &Snowflake) -> Result<()> {
        let path = format!("channels/{}/ack", channel_id);
        self.0.send_empty(reqwest::Method::POST, &path).await
    }

    // --- Threads -----------------------------------------------------------

    /// `POST /channels/{channel_id}/threads` — start a thread on a message (or
    /// a channel-less thread when `message_id` is `None`). Returns the new
    /// thread channel object.
    pub async fn start_thread(
        &self,
        channel_id: &Snowflake,
        name: &str,
        message_id: Option<&Snowflake>,
        auto_archive_duration: Option<i32>,
    ) -> Result<Channel> {
        let path = format!("channels/{}/threads", channel_id);
        #[derive(serde::Serialize)]
        struct Body<'a> {
            name: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            message_id: Option<&'a Snowflake>,
            #[serde(skip_serializing_if = "Option::is_none")]
            auto_archive_duration: Option<i32>,
        }
        self.0
            .send_json(
                reqwest::Method::POST,
                &path,
                &Body {
                    name,
                    message_id,
                    auto_archive_duration,
                },
            )
            .await
    }

    /// `POST /channels/{channel_id}/messages/{message_id}/threads` — start a
    /// thread attached to a specific message.
    pub async fn start_thread_on_message(
        &self,
        channel_id: &Snowflake,
        message_id: &Snowflake,
        name: &str,
        auto_archive_duration: Option<i32>,
    ) -> Result<Channel> {
        let path = format!(
            "channels/{}/messages/{}/threads",
            channel_id, message_id
        );
        #[derive(serde::Serialize)]
        struct Body<'a> {
            name: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            auto_archive_duration: Option<i32>,
        }
        self.0
            .send_json(
                reqwest::Method::POST,
                &path,
                &Body {
                    name,
                    auto_archive_duration,
                },
            )
            .await
    }

    /// `GET /channels/{channel_id}/threads/active` — list active (not archived)
    /// threads in a guild channel. The server returns `{ threads, members }`
    /// where `members` is the current user's membership for each thread; we
    /// surface just the thread channels.
    pub async fn list_active_threads(&self, channel_id: &Snowflake) -> Result<Vec<Channel>> {
        let path = format!("channels/{}/threads/active", channel_id);
        #[derive(serde::Deserialize)]
        struct Resp {
            threads: Vec<Channel>,
        }
        let r: Resp = self.0.get(&path).await?;
        Ok(r.threads)
    }

    /// `PUT /channels/{channel_id}/thread-members/@me` — join a thread.
    pub async fn join_thread(&self, channel_id: &Snowflake) -> Result<()> {
        let path = format!("channels/{}/thread-members/@me", channel_id);
        self.0.send_empty(reqwest::Method::PUT, &path).await
    }

    /// `DELETE /channels/{channel_id}/thread-members/@me` — leave a thread.
    pub async fn leave_thread(&self, channel_id: &Snowflake) -> Result<()> {
        let path = format!("channels/{}/thread-members/@me", channel_id);
        self.0.send_empty(reqwest::Method::DELETE, &path).await
    }

    /// `GET /channels/{channel_id}/webhooks` — list webhooks for a channel.
    pub async fn webhooks(&self, channel_id: &Snowflake) -> Result<Vec<serde_json::Value>> {
        let path = format!("channels/{}/webhooks", channel_id);
        self.0.get(&path).await
    }

    /// `POST /channels/{channel_id}/webhooks` — create a webhook. `avatar` is an
    /// optional base64 data URI.
    pub async fn create_webhook(
        &self,
        channel_id: &Snowflake,
        name: &str,
        avatar: Option<&str>,
    ) -> Result<serde_json::Value> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            name: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            avatar: Option<&'a str>,
        }
        let path = format!("channels/{}/webhooks", channel_id);
        self.0
            .send_json(reqwest::Method::POST, &path, &Body { name, avatar })
            .await
    }

    /// `PATCH /webhooks/{webhook_id}` — update a webhook's name/avatar/channel.
    pub async fn update_webhook(
        &self,
        webhook_id: &Snowflake,
        name: Option<&str>,
        avatar: Option<&str>,
        channel_id: Option<&Snowflake>,
    ) -> Result<serde_json::Value> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            name: Option<&'a str>,
            #[serde(skip_serializing_if = "Option::is_none")]
            avatar: Option<&'a str>,
            #[serde(skip_serializing_if = "Option::is_none")]
            channel_id: Option<&'a Snowflake>,
        }
        let path = format!("webhooks/{}", webhook_id);
        self.0
            .send_json(
                reqwest::Method::PATCH,
                &path,
                &Body {
                    name,
                    avatar,
                    channel_id,
                },
            )
            .await
    }

    /// `DELETE /webhooks/{webhook_id}` — delete a webhook.
    pub async fn delete_webhook(&self, webhook_id: &Snowflake) -> Result<()> {
        let path = format!("webhooks/{}", webhook_id);
        self.0.delete::<()>(&path).await
    }
}
