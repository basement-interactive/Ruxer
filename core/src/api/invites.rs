//! Invite endpoints (`/invites/{code}`).

use crate::error::Result;
use crate::http::Http;
use crate::models::{Channel, Guild, Invite, Snowflake};

/// Invite lookup + acceptance.
#[derive(Clone, Debug)]
pub struct Invites(pub Http);

/// The result of accepting an invite: the server returns the joined guild (for
/// guild invites) or the channel (for group-DM invites, rare). One of the two
/// is `Some`.
#[derive(Debug, Clone)]
pub enum JoinedTarget {
    Guild(Guild),
    Channel(Channel),
}

impl Invites {
    /// `GET /invites/{code}` — fetch an invite by its code, with the guild +
    /// channel previews. Used by the "join by invite" modal to show a preview
    /// before the user confirms.
    pub async fn fetch(&self, code: &str) -> Result<Invite> {
        let path = format!("invites/{}", code);
        self.0.get(&path).await
    }

    /// `POST /invites/{code}` — accept an invite. The server returns the
    /// joined guild (guild invites) or channel (group-DM invites). We try the
    /// guild shape first, then the channel shape, since the response type
    /// depends on the invite target.
    pub async fn accept(&self, code: &str) -> Result<JoinedTarget> {
        let path = format!("invites/{}", code);
        // Try guild first.
        match self.0.send_json::<_, Guild>(reqwest::Method::POST, &path, &serde_json::json!({})).await {
            Ok(g) => Ok(JoinedTarget::Guild(g)),
            Err(guild_err) => {
                // Fall back to channel. If this also fails, surface the
                // original guild error (more likely for a guild invite).
                match self.0.send_json::<_, Channel>(reqwest::Method::POST, &path, &serde_json::json!({})).await {
                    Ok(c) => Ok(JoinedTarget::Channel(c)),
                    Err(_) => Err(guild_err),
                }
            }
        }
    }

    /// `POST /channels/{channel_id}/invites` — create an invite for a channel.
    /// `max_age` is in seconds (0 = never); `max_uses` is 0 for unlimited.
    pub async fn create_for_channel(
        &self,
        channel_id: &Snowflake,
        max_age: Option<i32>,
        max_uses: Option<i32>,
    ) -> Result<Invite> {
        let path = format!("channels/{}/invites", channel_id);
        #[derive(serde::Serialize)]
        struct Body {
            #[serde(skip_serializing_if = "Option::is_none")]
            max_age: Option<i32>,
            #[serde(skip_serializing_if = "Option::is_none")]
            max_uses: Option<i32>,
        }
        self.0
            .send_json(
                reqwest::Method::POST,
                &path,
                &Body { max_age, max_uses },
            )
            .await
    }

    /// `DELETE /invites/{code}` — revoke an invite (guild admin only).
    pub async fn revoke(&self, code: &str) -> Result<Invite> {
        let path = format!("invites/{}", code);
        self.0.delete::<Invite>(&path).await
    }

    /// `GET /guilds/{guild_id}/invites` — list a guild's invites (admin only).
    pub async fn list_for_guild(&self, guild_id: &Snowflake) -> Result<Vec<Invite>> {
        let path = format!("guilds/{}/invites", guild_id);
        self.0.get(&path).await
    }

    /// `GET /channels/{channel_id}/invites` — list a channel's invites.
    pub async fn list_for_channel(&self, channel_id: &Snowflake) -> Result<Vec<Invite>> {
        let path = format!("channels/{}/invites", channel_id);
        self.0.get(&path).await
    }
}