//! Shared types passed across the Tauri command boundary.

use serde::{Deserialize, Serialize};

/// A pending attachment the frontend wants to send with a message. The path
/// points to a local file picked via the file dialog.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AttachmentInput {
    pub path: String,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default)]
    pub spoiler: bool,
}

/// Payload emitted on the `gateway` Tauri event channel.
#[derive(Debug, Clone, Serialize)]
pub struct GatewayEventPayload {
    pub name: String,
    pub data: serde_json::Value,
}