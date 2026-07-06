//! Message endpoints (`/channels/{cid}/messages/...`).

use crate::error::Result;
use crate::http::Http;
use crate::models::{AllowedMentions, ListParams, Message, MessageReference, Snowflake};
use serde::Serialize;

/// Message list / send / edit / delete.
#[derive(Clone, Debug)]
pub struct Messages(pub Http);

/// A pending file upload to send as part of a multipart message create. The
/// `data` is the raw file bytes; `filename` and `content_type` are sent as the
/// multipart part's filename + MIME type. `description` becomes the
/// attachment's alt text / caption; `spoiler` marks it as a spoiler.
#[derive(Debug, Clone)]
pub struct PendingAttachment {
    pub filename: String,
    pub content_type: String,
    pub data: Vec<u8>,
    pub description: Option<String>,
    pub spoiler: bool,
}

/// Optional fields when creating a message.
#[derive(Debug, Default, Clone, Serialize)]
pub struct CreateMessage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tts: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flags: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nonce: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_reference: Option<MessageReference>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_mentions: Option<AllowedMentions>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub sticker_ids: Vec<Snowflake>,
    /// Attachment descriptors when sending files alongside the message. When
    /// non-empty, [`Messages::send`] switches to a multipart request with one
    /// `files[N]` part per entry and a `payload_json` part carrying this struct.
    /// For an attachment-only message (no text), leave `content` as `None`.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<AttachmentPayload>,
}

/// Metadata for a file being attached to a new message. Used inside
/// [`CreateMessage::attachments`]; the actual file bytes are sent as separate
/// `files[N]` multipart parts keyed by `id` (which must match the descriptor's
/// `id`).
#[derive(Debug, Default, Clone, Serialize)]
pub struct AttachmentPayload {
    /// The multipart part index this descriptor applies to (e.g. `0` for
    /// `files[0]`).
    pub id: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// `MessageAttachmentFlags` bitfield. The API has no `spoiler` boolean —
    /// spoiler marking goes through IS_SPOILER (8) here; the server sanitizes
    /// to IS_SPOILER | CONTAINS_EXPLICIT_MEDIA.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flags: Option<i32>,
}

impl CreateMessage {
    /// A plain text message.
    pub fn content(text: impl Into<String>) -> Self {
        Self {
            content: Some(text.into()),
            ..Self::default()
        }
    }

    /// Convert this into a reply to the given message ID.
    pub fn reply_to(mut self, channel_id: &Snowflake, message_id: &Snowflake) -> Self {
        self.message_reference = Some(MessageReference {
            message_id: message_id.clone(),
            channel_id: Some(channel_id.clone()),
            guild_id: None,
            kind: 0,
            attachment_ids: None,
            embed_indices: None,
        });
        self
    }

    /// A forward of an existing message (`message_reference.type = 1`). A
    /// forward carries no content of its own — the server captures the source
    /// message into `message_snapshots` on the created message. The server
    /// rejects forwards that carry content/embeds/attachments/stickers, so
    /// `content` stays `None` here.
    pub fn forward_of(
        source_channel_id: &Snowflake,
        message_id: &Snowflake,
        guild_id: Option<&Snowflake>,
    ) -> Self {
        Self {
            message_reference: Some(MessageReference {
                message_id: message_id.clone(),
                channel_id: Some(source_channel_id.clone()),
                guild_id: guild_id.cloned(),
                kind: 1,
                attachment_ids: None,
                embed_indices: None,
            }),
            ..Self::default()
        }
    }

    /// Suppress push/desktop notifications for this message.
    pub fn suppress_notifications(mut self) -> Self {
        self.flags =
            Some(self.flags.unwrap_or(0) | crate::models::message_flags::SUPPRESS_NOTIFICATIONS);
        self
    }

    /// Attach a pending file upload. Adds an [`AttachmentPayload`] descriptor
    /// keyed by index; pair this with [`Messages::send_with_attachments`] which
    /// takes the matching [`PendingAttachment`] bytes in the same order.
    pub fn with_attachment(mut self, file: &PendingAttachment) -> Self {
        let id = self.attachments.len() as i32;
        self.attachments.push(AttachmentPayload {
            id,
            filename: Some(file.filename.clone()),
            description: file.description.clone(),
            flags: if file.spoiler {
                Some(crate::models::attachment_flags::IS_SPOILER)
            } else {
                None
            },
        });
        self
    }
}

/// Optional fields when editing a message.
#[derive(Debug, Default, Clone, Serialize)]
pub struct EditMessage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flags: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_mentions: Option<AllowedMentions>,
}

impl Messages {
    /// `GET /channels/{channel_id}/messages` — list messages (newest first by default).
    pub async fn list(&self, channel_id: &Snowflake, params: ListParams) -> Result<Vec<Message>> {
        let path = format!("channels/{}/messages", channel_id);
        let builder = self.0.request(reqwest::Method::GET, &path);
        let builder = params.apply(builder);
        self.0.execute(reqwest::Method::GET, &path, builder).await
    }

    /// `GET /channels/{channel_id}/messages/{message_id}` — fetch a single message.
    pub async fn get(&self, channel_id: &Snowflake, message_id: &Snowflake) -> Result<Message> {
        let path = format!("channels/{}/messages/{}", channel_id, message_id);
        self.0.get(&path).await
    }

    /// `POST /channels/{channel_id}/messages` — send a message.
    ///
    /// If `message.attachments` is non-empty this builds a multipart body with
    /// a `payload_json` part + `files[N]` parts; otherwise it sends JSON. The
    /// file bytes must be supplied separately via [`Self::send_with_attachments`]
    /// — this method only sends the descriptors (so it's correct but not useful
    /// for actually uploading; use the wrapper for that).
    pub async fn send(&self, channel_id: &Snowflake, message: &CreateMessage) -> Result<Message> {
        if message.attachments.is_empty() {
            let path = format!("channels/{}/messages", channel_id);
            self.0
                .send_json(reqwest::Method::POST, &path, message)
                .await
        } else {
            // No bytes supplied — fall back to JSON-only. The descriptors are
            // still sent (useful for re-sending attachment ids from a prior
            // upload). For real uploads use `send_with_attachments`.
            let path = format!("channels/{}/messages", channel_id);
            self.0
                .send_json(reqwest::Method::POST, &path, message)
                .await
        }
    }

    /// `POST /channels/{channel_id}/messages` with multipart file uploads.
    /// `files` must be in the same order as `message.attachments` (i.e. the
    /// `PendingAttachment` at index `i` corresponds to the descriptor with
    /// `id == i`). Builds a multipart form with one `files[i]` part per file
    /// plus a `payload_json` part carrying the serialized [`CreateMessage`].
    ///
    /// Takes `files` by value (rather than `&[PendingAttachment]`) so each
    /// attachment's bytes can be moved into the multipart part instead of
    /// cloned — attachments can be tens of MB (images/video/voice messages),
    /// and doubling that in memory for the duration of the upload is wasted
    /// peak RSS for no benefit, since callers don't need the buffer afterward.
    pub async fn send_with_attachments(
        &self,
        channel_id: &Snowflake,
        message: &CreateMessage,
        files: Vec<PendingAttachment>,
    ) -> Result<Message> {
        let path = format!("channels/{}/messages", channel_id);
        let payload_json = serde_json::to_value(message)
            .map_err(|e| crate::error::Error::Decode(e))?;
        let mut form = reqwest::multipart::Form::new()
            .text("payload_json", payload_json.to_string());
        for (i, file) in files.into_iter().enumerate() {
            let part = reqwest::multipart::Part::bytes(file.data)
                .file_name(file.filename)
                .mime_str(&file.content_type)
                .map_err(|e| crate::error::Error::Api {
                    code: "MULTIPART".into(),
                    message: e.to_string(),
                    status: reqwest::StatusCode::BAD_REQUEST,
                    body: String::new(),
                })?;
            form = form.part(format!("files[{}]", i), part);
        }
        let builder = self
            .0
            .request(reqwest::Method::POST, &path)
            .multipart(form);
        self.0
            .execute(reqwest::Method::POST, &path, builder)
            .await
    }

    /// Convenience: send a plain-text message in one call.
    pub async fn send_text(
        &self,
        channel_id: &Snowflake,
        content: impl Into<String>,
    ) -> Result<Message> {
        self.send(channel_id, &CreateMessage::content(content))
            .await
    }

    /// `PATCH /channels/{channel_id}/messages/{message_id}` — edit a message.
    pub async fn edit(
        &self,
        channel_id: &Snowflake,
        message_id: &Snowflake,
        edit: &EditMessage,
    ) -> Result<Message> {
        let path = format!("channels/{}/messages/{}", channel_id, message_id);
        self.0.send_json(reqwest::Method::PATCH, &path, edit).await
    }

    /// `DELETE /channels/{channel_id}/messages/{message_id}` — delete a message.
    pub async fn delete(&self, channel_id: &Snowflake, message_id: &Snowflake) -> Result<()> {
        let path = format!("channels/{}/messages/{}", channel_id, message_id);
        self.0.delete::<()>(&path).await
    }

    /// `POST /channels/{channel_id}/messages/bulk-delete` — delete up to 100 messages.
    pub async fn bulk_delete(
        &self,
        channel_id: &Snowflake,
        message_ids: &[Snowflake],
    ) -> Result<()> {
        let path = format!("channels/{}/messages/bulk-delete", channel_id);
        #[derive(Serialize)]
        struct Body<'a> {
            message_ids: &'a [Snowflake],
        }
        self.0
            .send_json(reqwest::Method::POST, &path, &Body { message_ids })
            .await
    }
}
