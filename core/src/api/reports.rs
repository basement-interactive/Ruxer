//! Abuse reporting: report a message, user, or guild for moderation review.
//!
//! Each endpoint is a simple `POST /reports/{kind}` taking the target id(s) plus
//! a category string. Categories are validated server-side; the client passes
//! them through as free strings (see the UI for the allowed set per kind).

use crate::http::Http;
use crate::models::Snowflake;
use crate::Result;

#[derive(Clone, Debug)]
pub struct Reports(pub Http);

impl Reports {
    /// `POST /reports/message` — report a message.
    pub async fn message(
        &self,
        channel_id: &Snowflake,
        message_id: &Snowflake,
        category: &str,
    ) -> Result<()> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            channel_id: &'a Snowflake,
            message_id: &'a Snowflake,
            category: &'a str,
        }
        self.0
            .send_json(
                reqwest::Method::POST,
                "reports/message",
                &Body {
                    channel_id,
                    message_id,
                    category,
                },
            )
            .await
    }

    /// `POST /reports/user` — report a user, optionally scoped to a guild.
    pub async fn user(
        &self,
        user_id: &Snowflake,
        category: &str,
        guild_id: Option<&Snowflake>,
    ) -> Result<()> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            user_id: &'a Snowflake,
            category: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            guild_id: Option<&'a Snowflake>,
        }
        self.0
            .send_json(
                reqwest::Method::POST,
                "reports/user",
                &Body {
                    user_id,
                    category,
                    guild_id,
                },
            )
            .await
    }

    /// `POST /reports/guild` — report a guild.
    pub async fn guild(
        &self,
        guild_id: &Snowflake,
        category: &str,
        invite_code: Option<&str>,
    ) -> Result<()> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            guild_id: &'a Snowflake,
            category: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            invite_code: Option<&'a str>,
        }
        self.0
            .send_json(
                reqwest::Method::POST,
                "reports/guild",
                &Body {
                    guild_id,
                    category,
                    invite_code,
                },
            )
            .await
    }
}
