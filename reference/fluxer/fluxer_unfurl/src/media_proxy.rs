// SPDX-License-Identifier: AGPL-3.0-or-later

use serde::{Deserialize, Serialize};
use std::time::Duration;
use url::Url;

const METADATA_TIMEOUT: Duration = Duration::from_secs(5);
const EXTERNAL_PROXY_VERSION_PREFIX: &str = "v2/";

pub struct MediaProxyClient {
    http_client: reqwest::Client,
    endpoint: String,
    public_endpoint: String,
    secret_key: String,
}

#[derive(Debug, Clone, Serialize)]
struct MetadataRequest<'a> {
    #[serde(rename = "type")]
    req_type: &'a str,
    url: &'a str,
    version: u8,
    nsfw: &'a str,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct MediaMetadata {
    pub format: String,
    pub content_type: String,
    pub content_hash: String,
    pub size: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration: Option<f64>,
    pub placeholder: Option<String>,
    pub animated: Option<bool>,
    pub nsfw: bool,
    pub nsfw_probability: Option<f64>,
}

pub fn embed_media_flags(meta: &MediaMetadata) -> u32 {
    let mut flags = 0;
    if meta.nsfw {
        flags |= 1 << 4;
    }
    if meta.animated.unwrap_or(false) {
        flags |= 1 << 5;
    }
    flags
}

impl MediaProxyClient {
    pub fn new_with_public_endpoint(
        endpoint: &str,
        secret_key: &str,
        public_endpoint: Option<&str>,
        http_client: reqwest::Client,
    ) -> Self {
        Self {
            http_client,
            endpoint: endpoint.trim_end_matches('/').to_owned(),
            public_endpoint: public_endpoint
                .unwrap_or(endpoint)
                .trim_end_matches('/')
                .to_owned(),
            secret_key: secret_key.to_owned(),
        }
    }

    pub async fn get_metadata(&self, url: &str, nsfw_mode: &str) -> anyhow::Result<MediaMetadata> {
        let body = MetadataRequest {
            req_type: "external",
            url,
            version: 2,
            nsfw: nsfw_mode,
        };

        let resp = self
            .http_client
            .post(format!("{}/_metadata", self.endpoint))
            .header("content-type", "application/json")
            .bearer_auth(&self.secret_key)
            .timeout(METADATA_TIMEOUT)
            .json(&body)
            .send()
            .await;

        let resp =
            resp.map_err(|err| anyhow::anyhow!("media proxy request failed for {url}: {err}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            let snippet: String = body.chars().take(256).collect();
            return Err(anyhow::anyhow!(
                "media proxy metadata request failed for {url}: status={} body={}",
                status.as_u16(),
                snippet
            ));
        }

        resp.json::<MediaMetadata>()
            .await
            .map_err(|err| anyhow::anyhow!("failed to parse media proxy metadata for {url}: {err}"))
    }

    pub fn nsfw_mode_str(mode: crate::types::NsfwMode) -> &'static str {
        match mode {
            crate::types::NsfwMode::Block => "block",
            crate::types::NsfwMode::Flag => "flag",
            crate::types::NsfwMode::Allow => "allow",
        }
    }

    pub fn external_proxy_url(&self, input_url: &str) -> Option<String> {
        if input_url == self.public_endpoint
            || input_url.starts_with(&format!("{}/", self.public_endpoint))
        {
            return Some(input_url.to_owned());
        }
        let parsed = Url::parse(input_url).ok()?;
        let encoded = base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            parsed.as_str(),
        );
        let path = format!("{EXTERNAL_PROXY_VERSION_PREFIX}{encoded}");
        let signature = create_signature(&path, &self.secret_key);
        Some(format!(
            "{}/external/{}/{}",
            self.public_endpoint, signature, path
        ))
    }
}

fn create_signature(input: &str, secret: &str) -> String {
    use hmac::{Hmac, KeyInit, Mac};
    let mut mac =
        Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes()).expect("hmac accepts any key size");
    mac.update(input.as_bytes());
    base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        mac.finalize().into_bytes(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_trailing_slash_stripped() {
        let client = reqwest::Client::new();
        let mp = MediaProxyClient::new_with_public_endpoint(
            "http://localhost:8000/",
            "secret",
            None,
            client,
        );
        assert_eq!(mp.endpoint, "http://localhost:8000");
        assert_eq!(mp.public_endpoint, "http://localhost:8000");
    }

    #[test]
    fn nsfw_mode_strings() {
        assert_eq!(
            MediaProxyClient::nsfw_mode_str(crate::types::NsfwMode::Block),
            "block"
        );
        assert_eq!(
            MediaProxyClient::nsfw_mode_str(crate::types::NsfwMode::Allow),
            "allow"
        );
        assert_eq!(
            MediaProxyClient::nsfw_mode_str(crate::types::NsfwMode::Flag),
            "flag"
        );
    }

    #[test]
    fn external_proxy_url_uses_public_endpoint_and_v2_path() {
        let client = reqwest::Client::new();
        let mp = MediaProxyClient::new_with_public_endpoint(
            "http://media-proxy:8080/",
            "secret",
            Some("https://media.example.test/"),
            client,
        );
        let proxy = mp
            .external_proxy_url("https://pbs.twimg.com/media/a.jpg?name=orig")
            .expect("proxy url");

        assert!(proxy.starts_with("https://media.example.test/external/"));
        assert!(proxy.contains("/v2/"));

        let encoded = proxy.rsplit('/').next().expect("encoded path segment");
        let decoded =
            base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, encoded)
                .expect("valid base64");
        assert_eq!(
            String::from_utf8(decoded).expect("utf8"),
            "https://pbs.twimg.com/media/a.jpg?name=orig"
        );
        assert_eq!(
            mp.external_proxy_url("https://media.example.test/external/already"),
            Some("https://media.example.test/external/already".to_owned())
        );
    }
}
