// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::paths::ROOT;
use crate::proc::{RunOptions, run_command, wait_http};
use anyhow::{Context, Result, anyhow, bail};
use clap::Args;
use futures_util::{SinkExt, StreamExt};
use reqwest::{Client, Method, StatusCode};
use serde_json::{Value, json};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::net::TcpStream;
use tokio::time::{sleep, timeout as tokio_timeout};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};

const DEFAULT_API_URL: &str = "http://127.0.0.1:8088/api";
const DEFAULT_GATEWAY_URL: &str = "ws://127.0.0.1:8088/gateway?v=1&encoding=json";
const HAS_SESSION_STARTED: &str = "549755813888";
const DEFAULT_PASSWORD: &str = "T3st!VoiceIntegration12345";
const DEFAULT_NATIVE_SCREEN_CODECS: &str = "vp8,h264";

#[derive(Debug, Args)]
pub struct NativeVoiceItArgs {
    #[arg(long, env = "FLUXER_NATIVE_VOICE_IT_API_URL", default_value = DEFAULT_API_URL)]
    api_url: String,
    #[arg(
        long,
        env = "FLUXER_NATIVE_VOICE_IT_GATEWAY_URL",
        default_value = DEFAULT_GATEWAY_URL
    )]
    gateway_url: String,
    #[arg(long, env = "FLUXER_NATIVE_VOICE_IT_LIVEKIT_URL")]
    livekit_url: Option<String>,
    #[arg(long, default_value_t = 60)]
    wait_secs: u64,
    #[arg(long)]
    reset: bool,
    #[arg(long)]
    skip_native_media: bool,
    #[arg(long, env = "FLUXER_NATIVE_VOICE_IT_SCREEN_CODECS", default_value = DEFAULT_NATIVE_SCREEN_CODECS)]
    native_screen_codecs: String,
    #[arg(long)]
    native_strict: bool,
    #[arg(long)]
    native_duration_ms: Option<u64>,
    #[arg(long, default_value_t = 16)]
    stress_iterations: u32,
}

#[derive(Debug, Clone)]
struct Config {
    api_url: String,
    gateway_url: String,
    livekit_url: Option<String>,
    wait: Duration,
    reset: bool,
    skip_native_media: bool,
    native_screen_codecs: String,
    native_strict: bool,
    native_duration_ms: Option<u64>,
    stress_iterations: u32,
    test_harness_token: Option<String>,
}

#[derive(Debug, Clone)]
struct TestAccount {
    user_id: String,
    token: String,
    username: String,
}

#[derive(Debug, Clone)]
struct VoiceConnection {
    connection_id: String,
    identity: String,
    token: String,
    endpoint: String,
    version: u64,
}

#[derive(Debug)]
struct TestWorld {
    accounts: Vec<TestAccount>,
    guild_id: String,
    voice_channel_id: String,
    dm_channel_id: String,
    group_dm_channel_id: String,
}

#[derive(Debug)]
struct Api {
    client: Client,
    base_url: String,
    test_harness_token: Option<String>,
    client_ip: String,
}

type GatewayWs = WebSocketStream<MaybeTlsStream<TcpStream>>;

#[derive(Debug)]
struct GatewayClient {
    name: String,
    ws: GatewayWs,
    queued_dispatches: VecDeque<Value>,
}

#[derive(Debug)]
struct GatewayRolloutGuard {
    admin_token: String,
    previous_rollout: Value,
}

pub async fn run(args: NativeVoiceItArgs) -> Result<()> {
    let config = Config::from_args(args);
    let api = Api::new(&config)?;
    wait_http("Fluxer API", &api.url("/_health"), config.wait.as_secs()).await?;

    if config.reset {
        api.request(Method::POST, "/test/reset", None, Some(json!({})))
            .await
            .context("failed to reset test harness state")?;
    }

    let world = create_world(&api).await?;
    println!(
        "Native voice integration world: guild={} voice_channel={} dm={} gdm={} users={}",
        world.guild_id,
        world.voice_channel_id,
        world.dm_channel_id,
        world.group_dm_channel_id,
        world.accounts.len()
    );

    let rollout_guard = disable_gateway_voice_reconciliation_for_it(&api, &world.accounts[0])
        .await
        .context("failed to disable gateway voice reconciliation for native voice integration")?;
    let result = run_with_reconciliation_guard(&api, &config, &world).await;
    let restore_result = restore_gateway_rollout(&api, rollout_guard).await;
    match (result, restore_result) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(error), Ok(())) => Err(error),
        (Ok(()), Err(restore_error)) => Err(restore_error.context(
            "native voice integration passed but failed to restore gateway rollout config",
        )),
        (Err(error), Err(restore_error)) => {
            eprintln!(
                "Failed to restore gateway rollout config after native voice integration failure: {restore_error:#}"
            );
            Err(error)
        }
    }
}

async fn run_with_reconciliation_guard(
    api: &Api,
    config: &Config,
    world: &TestWorld,
) -> Result<()> {
    let mut gateways = connect_gateways(config, world).await?;
    let mut voice_connections = join_and_confirm_all(api, config, world, &mut gateways).await?;

    run_voice_mutation_scenarios(world, &mut gateways, &mut voice_connections).await?;
    run_private_call_scenarios(api, config, world, &mut gateways).await?;

    if !config.skip_native_media {
        run_native_livekit_harness(config, world, &voice_connections)?;
    } else {
        println!("Native LiveKit media harness skipped by --skip-native-media.");
    }

    run_disconnect_scenarios(world, &mut gateways, &voice_connections).await?;
    println!("Native voice backend integration checks passed.");
    Ok(())
}

async fn disable_gateway_voice_reconciliation_for_it(
    api: &Api,
    admin: &TestAccount,
) -> Result<GatewayRolloutGuard> {
    api.request(
        Method::POST,
        &format!("/test/users/{}/acls", admin.user_id),
        None,
        Some(json!({
            "acls": [
                "admin:authenticate",
                "instance:config:update",
                "instance:config:view",
            ],
        })),
    )
    .await
    .context("failed to grant native voice integration instance-config ACLs")?;

    let current = api
        .request(
            Method::POST,
            "/admin/instance-config/get",
            Some(&admin.token),
            None,
        )
        .await
        .context("failed to read gateway rollout config")?;
    let previous_rollout = current
        .get("gateway_rollout")
        .filter(|value| value.is_object())
        .cloned()
        .ok_or_else(|| anyhow!("admin instance-config response did not include gateway_rollout"))?;
    let mut disabled_rollout = previous_rollout.clone();
    let disabled_rollout_object = disabled_rollout
        .as_object_mut()
        .ok_or_else(|| anyhow!("gateway_rollout was not an object"))?;
    disabled_rollout_object.insert(
        "voice_reconciliation_v3_percentage".to_owned(),
        Value::from(0),
    );
    api.request(
        Method::POST,
        "/admin/instance-config/update",
        Some(&admin.token),
        Some(json!({"gateway_rollout": disabled_rollout})),
    )
    .await
    .context("failed to disable gateway voice reconciliation v3")?;
    sleep(Duration::from_millis(2500)).await;
    println!("Gateway voice reconciliation v3 disabled for native voice integration.");
    Ok(GatewayRolloutGuard {
        admin_token: admin.token.clone(),
        previous_rollout,
    })
}

async fn restore_gateway_rollout(api: &Api, guard: GatewayRolloutGuard) -> Result<()> {
    api.request(
        Method::POST,
        "/admin/instance-config/update",
        Some(&guard.admin_token),
        Some(json!({"gateway_rollout": guard.previous_rollout})),
    )
    .await
    .context("failed to restore previous gateway rollout config")?;
    println!("Gateway rollout config restored after native voice integration.");
    Ok(())
}

impl Config {
    fn from_args(args: NativeVoiceItArgs) -> Self {
        Self {
            api_url: args.api_url,
            gateway_url: args.gateway_url,
            livekit_url: args.livekit_url,
            wait: Duration::from_secs(args.wait_secs),
            reset: args.reset,
            skip_native_media: args.skip_native_media,
            native_screen_codecs: args.native_screen_codecs,
            native_strict: args.native_strict,
            native_duration_ms: args.native_duration_ms,
            stress_iterations: args.stress_iterations,
            test_harness_token: std::env::var("FLUXER_TEST_HARNESS_TOKEN")
                .ok()
                .filter(|value| !value.trim().is_empty()),
        }
    }
}

impl Api {
    fn new(config: &Config) -> Result<Self> {
        Ok(Self {
            client: Client::builder()
                .timeout(Duration::from_secs(20))
                .build()
                .context("failed to build HTTP client")?,
            base_url: config.api_url.trim_end_matches('/').to_owned(),
            test_harness_token: config.test_harness_token.clone(),
            client_ip: unique_client_ip(),
        })
    }

    fn url(&self, path: &str) -> String {
        format!("{}/{}", self.base_url, path.trim_start_matches('/'))
    }

    async fn request(
        &self,
        method: Method,
        path: &str,
        auth_token: Option<&str>,
        body: Option<Value>,
    ) -> Result<Value> {
        let (status, payload) = self
            .request_status(method.clone(), path, auth_token, body)
            .await?;
        if !status.is_success() {
            bail!("HTTP {method} {path} returned {status}: {payload}");
        }
        Ok(payload)
    }

    async fn request_status(
        &self,
        method: Method,
        path: &str,
        auth_token: Option<&str>,
        body: Option<Value>,
    ) -> Result<(StatusCode, Value)> {
        let mut attempt = 0;
        loop {
            let mut request = self.client.request(method.clone(), self.url(path));
            if let Some(token) = auth_token {
                request = request.header("authorization", token);
            }
            if let Some(token) = &self.test_harness_token {
                request = request.header("x-test-token", token);
            }
            request = request.header("x-forwarded-for", &self.client_ip);
            if let Some(body) = body.clone() {
                request = request.json(&body);
            }
            let response = request
                .send()
                .await
                .with_context(|| format!("HTTP {method} {path} failed"))?;
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let payload = parse_json_or_null(&text)
                .with_context(|| format!("failed to parse HTTP {method} {path}"))?;
            if status != StatusCode::TOO_MANY_REQUESTS || attempt >= 12 {
                return Ok((status, payload));
            }
            attempt += 1;
            let retry_after_ms = numeric_field(&payload, "retry_after")
                .unwrap_or(1000)
                .clamp(100, 5000);
            sleep(Duration::from_millis(retry_after_ms)).await;
        }
    }
}

impl GatewayClient {
    async fn connect(name: impl Into<String>, gateway_url: &str, token: &str) -> Result<Self> {
        let name = name.into();
        let (ws, _) = connect_async(gateway_url)
            .await
            .with_context(|| format!("{name}: failed to connect to gateway {gateway_url}"))?;
        let mut client = Self {
            name,
            ws,
            queued_dispatches: VecDeque::new(),
        };
        client.wait_for_opcode(10, Duration::from_secs(10)).await?;
        client
            .send_json(json!({
                "op": 2,
                "d": {
                    "token": token,
                    "properties": {
                        "os": std::env::consts::OS,
                        "browser": "fluxer-dev-native-voice-it",
                        "device": client.name,
                    },
                    "presence": null,
                    "ignored_events": [],
                    "flags": 0,
                },
            }))
            .await?;
        client
            .wait_for_dispatch("READY", Duration::from_secs(20), |_| true)
            .await
            .with_context(|| format!("{}: READY dispatch not received", client.name))?;
        Ok(client)
    }

    async fn send_json(&mut self, payload: Value) -> Result<()> {
        self.ws
            .send(Message::Text(payload.to_string().into()))
            .await
            .with_context(|| format!("{}: failed to send gateway frame", self.name))
    }

    async fn send_voice_update(&mut self, payload: Value) -> Result<()> {
        self.send_json(json!({"op": 4, "d": payload})).await
    }

    async fn wait_for_opcode(&mut self, opcode: i64, wait: Duration) -> Result<Value> {
        let deadline = tokio::time::Instant::now() + wait;
        loop {
            let frame = self.recv_json(deadline).await?;
            if frame.get("op").and_then(Value::as_i64) == Some(opcode) {
                return Ok(frame);
            }
            self.maybe_queue_dispatch(frame);
        }
    }

    async fn wait_for_dispatch<F>(
        &mut self,
        event: &str,
        wait: Duration,
        predicate: F,
    ) -> Result<Value>
    where
        F: Fn(&Value) -> bool,
    {
        if let Some(index) = self
            .queued_dispatches
            .iter()
            .position(|frame| dispatch_data(frame, event).map(&predicate).unwrap_or(false))
        {
            let frame = self
                .queued_dispatches
                .remove(index)
                .expect("queued dispatch index came from position");
            return Ok(frame.get("d").cloned().unwrap_or(Value::Null));
        }

        let deadline = tokio::time::Instant::now() + wait;
        loop {
            let frame = self.recv_json(deadline).await.with_context(|| {
                format!(
                    "{}: while waiting for {event}; queued_dispatches={}",
                    self.name,
                    self.queued_dispatch_summary()
                )
            })?;
            if let Some(data) = dispatch_data(&frame, event)
                && predicate(data)
            {
                return Ok(data.clone());
            }
            self.maybe_queue_dispatch(frame);
        }
    }

    async fn recv_json(&mut self, deadline: tokio::time::Instant) -> Result<Value> {
        loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                bail!("{}: timed out waiting for gateway frame", self.name);
            }
            let message = tokio_timeout(remaining, self.ws.next())
                .await
                .with_context(|| format!("{}: timed out waiting for gateway frame", self.name))?
                .ok_or_else(|| anyhow!("{}: gateway stream ended", self.name))?
                .with_context(|| format!("{}: gateway receive failed", self.name))?;
            match message {
                Message::Text(text) => {
                    return serde_json::from_str(text.as_ref())
                        .with_context(|| format!("{}: invalid gateway JSON: {text}", self.name));
                }
                Message::Binary(bytes) => {
                    return serde_json::from_slice(&bytes)
                        .with_context(|| format!("{}: invalid gateway binary JSON", self.name));
                }
                Message::Ping(bytes) => {
                    self.ws
                        .send(Message::Pong(bytes))
                        .await
                        .with_context(|| format!("{}: failed to send gateway pong", self.name))?;
                }
                Message::Pong(_) | Message::Frame(_) => {}
                Message::Close(close) => bail!("{}: gateway closed: {close:?}", self.name),
            }
        }
    }

    fn maybe_queue_dispatch(&mut self, frame: Value) {
        if frame.get("op").and_then(Value::as_i64) == Some(0) {
            self.queued_dispatches.push_back(frame);
        }
    }

    fn queued_dispatch_summary(&self) -> String {
        if self.queued_dispatches.is_empty() {
            return "[]".to_owned();
        }
        let entries = self
            .queued_dispatches
            .iter()
            .map(|frame| {
                let event = frame
                    .get("t")
                    .and_then(Value::as_str)
                    .unwrap_or("<missing>");
                let data = frame.get("d").unwrap_or(&Value::Null);
                let mutation = data
                    .get("mutation_id")
                    .and_then(Value::as_str)
                    .unwrap_or("-");
                let status = data.get("status").and_then(Value::as_str).unwrap_or("-");
                let error = data
                    .get("error_code")
                    .and_then(Value::as_str)
                    .unwrap_or("-");
                format!("{event}:mutation={mutation}:status={status}:error={error}")
            })
            .collect::<Vec<_>>();
        format!("[{}]", entries.join(", "))
    }
}

async fn create_world(api: &Api) -> Result<TestWorld> {
    let mut accounts = Vec::new();
    for role in ["publisher", "subscriber", "publisher2"] {
        accounts.push(create_account(api, role).await?);
    }

    let guild = api
        .request(
            Method::POST,
            "/guilds",
            Some(&accounts[0].token),
            Some(json!({"name": unique_name("Native Voice IT")})),
        )
        .await
        .context("failed to create integration guild")?;
    let guild_id = string_field(&guild, "id")?;

    let channel = api
        .request(
            Method::POST,
            &format!("/guilds/{guild_id}/channels"),
            Some(&accounts[0].token),
            Some(json!({"name": "native-voice-it", "type": 2})),
        )
        .await
        .context("failed to create integration voice channel")?;
    let voice_channel_id = string_field(&channel, "id")?;

    let invite = api
        .request(
            Method::POST,
            &format!("/channels/{voice_channel_id}/invites"),
            Some(&accounts[0].token),
            Some(json!({})),
        )
        .await
        .context("failed to create integration invite")?;
    let invite_code = string_field(&invite, "code")?;

    for account in accounts.iter().skip(1) {
        api.request(
            Method::POST,
            &format!("/invites/{invite_code}"),
            Some(&account.token),
            Some(Value::Null),
        )
        .await
        .with_context(|| format!("{} failed to accept guild invite", account.username))?;
    }

    let private_channels = api
        .request(
            Method::POST,
            &format!("/test/users/{}/private-channels", accounts[0].user_id),
            None,
            Some(json!({
                "dm_count": 1,
                "group_dm_count": 1,
                "recipients": [
                    accounts[1].user_id,
                    accounts[2].user_id,
                ],
            })),
        )
        .await
        .context("failed to seed integration private voice channels")?;
    let dm_channel_id = nested_string_field(&private_channels, "dms", 0, "channel_id")?;
    let group_dm_channel_id = nested_string_field(&private_channels, "group_dms", 0, "channel_id")?;

    Ok(TestWorld {
        accounts,
        guild_id,
        voice_channel_id,
        dm_channel_id,
        group_dm_channel_id,
    })
}

async fn create_account(api: &Api, role: &str) -> Result<TestAccount> {
    let username_prefix = match role {
        "publisher" => "vpub",
        "subscriber" => "vsub",
        "publisher2" => "vpub2",
        _ => "voice",
    };
    let username = unique_slug(username_prefix);
    let email = format!("{username}@example.com");
    let registration = api
        .request(
            Method::POST,
            "/auth/register",
            None,
            Some(json!({
                "email": email,
                "username": username,
                "global_name": role,
                "password": DEFAULT_PASSWORD,
                "date_of_birth": "1990-01-01",
                "consent": true,
            })),
        )
        .await
        .with_context(|| format!("{role}: failed to register account"))?;
    let user_id = string_field(&registration, "user_id")?;
    let token = string_field(&registration, "token")?;
    api.request(
        Method::PATCH,
        &format!("/test/users/{user_id}/flags"),
        None,
        Some(json!({"flags": HAS_SESSION_STARTED})),
    )
    .await
    .with_context(|| format!("{role}: failed to mark session started"))?;
    api.request(
        Method::POST,
        &format!("/test/users/{user_id}/security-flags"),
        None,
        Some(json!({
            "email_verified": true,
            "suspicious_activity_flags": 0,
        })),
    )
    .await
    .with_context(|| format!("{role}: failed to mark account verified"))?;
    Ok(TestAccount {
        user_id,
        token,
        username,
    })
}

async fn connect_gateways(config: &Config, world: &TestWorld) -> Result<Vec<GatewayClient>> {
    let mut clients = Vec::new();
    for account in &world.accounts {
        let client =
            GatewayClient::connect(&account.username, &config.gateway_url, &account.token).await?;
        clients.push(client);
    }
    sleep(Duration::from_millis(500)).await;
    Ok(clients)
}

async fn join_and_confirm_all(
    api: &Api,
    config: &Config,
    world: &TestWorld,
    gateways: &mut [GatewayClient],
) -> Result<Vec<VoiceConnection>> {
    let mut connections = Vec::new();
    for index in 0..world.accounts.len() {
        let self_stream = index == 0 || index == 2;
        let self_video = index == 0;
        let join_payload = json!({
            "guild_id": world.guild_id,
            "channel_id": world.voice_channel_id,
            "self_mute": false,
            "self_deaf": false,
            "self_video": self_video,
            "self_stream": self_stream,
            "is_mobile": false,
            "latitude": 59.3293,
            "longitude": 18.0686,
        });
        gateways[index].send_voice_update(join_payload).await?;
        let server = gateways[index]
            .wait_for_dispatch("VOICE_SERVER_UPDATE", config.wait, |data| {
                data.get("guild_id").and_then(Value::as_str) == Some(world.guild_id.as_str())
                    && data.get("channel_id").and_then(Value::as_str)
                        == Some(world.voice_channel_id.as_str())
                    && data.get("token").and_then(Value::as_str).is_some()
                    && data.get("endpoint").and_then(Value::as_str).is_some()
                    && data.get("connection_id").and_then(Value::as_str).is_some()
            })
            .await
            .with_context(|| {
                format!(
                    "{} did not receive VOICE_SERVER_UPDATE",
                    gateways[index].name
                )
            })?;
        let connection_id = string_field(&server, "connection_id")?;
        confirm_voice_connection(
            api,
            Some(&world.guild_id),
            &world.voice_channel_id,
            &connection_id,
        )
        .await?;
        let state = wait_for_voice_state_on_all(
            gateways,
            &connection_id,
            Some(&world.voice_channel_id),
            config.wait,
        )
        .await?;
        assert_bool_field(&state, "self_stream", self_stream)?;
        assert_bool_field(&state, "self_video", self_video)?;
        let user_id = world.accounts[index].user_id.clone();
        let identity = format!("user_{user_id}_{connection_id}");
        connections.push(VoiceConnection {
            connection_id,
            identity,
            token: string_field(&server, "token")?,
            endpoint: string_field(&server, "endpoint")?,
            version: numeric_field(&state, "version").unwrap_or(0),
        });
    }
    Ok(connections)
}

async fn confirm_voice_connection(
    api: &Api,
    guild_id: Option<&str>,
    channel_id: &str,
    connection_id: &str,
) -> Result<()> {
    for attempt in 0..20 {
        let mut body = json!({
            "channel_id": channel_id,
            "connection_id": connection_id,
        });
        if let Some(guild_id) = guild_id {
            body["guild_id"] = Value::from(guild_id.to_owned());
        }
        let (status, payload) = api
            .request_status(
                Method::POST,
                "/test/voice/confirm-connection",
                None,
                Some(body),
            )
            .await?;
        if status.is_success() && payload.get("success").and_then(Value::as_bool) == Some(true) {
            return Ok(());
        }
        if status == StatusCode::NOT_FOUND
            && payload.get("error").and_then(Value::as_str) == Some("pending_join_not_found")
            && attempt < 19
        {
            sleep(Duration::from_millis(250)).await;
            continue;
        }
        bail!("voice confirm failed for {connection_id}: HTTP {status} {payload}");
    }
    bail!("voice confirm failed for {connection_id}: pending join was not found after retries");
}

async fn run_voice_mutation_scenarios(
    world: &TestWorld,
    gateways: &mut [GatewayClient],
    connections: &mut [VoiceConnection],
) -> Result<()> {
    let publisher_stream_key = build_guild_stream_key(
        &world.guild_id,
        &world.voice_channel_id,
        &connections[0].connection_id,
    );
    let subscriber = 1;
    let subscriber_conn = connections[subscriber].connection_id.clone();
    let runtime_epoch = unique_slug("runtime");

    let watch_ack = send_mutation_and_wait(
        &mut gateways[subscriber],
        world,
        &subscriber_conn,
        "watch-publisher",
        &runtime_epoch,
        Some(connections[subscriber].version),
        json!({
            "self_mute": false,
            "self_deaf": false,
            "self_video": false,
            "self_stream": false,
            "viewer_stream_keys": [publisher_stream_key],
        }),
    )
    .await?;
    assert_ack_status(&watch_ack, "applied")?;
    assert_viewer_keys(
        &watch_ack["canonical_state"],
        &[publisher_stream_key.as_str()],
    )?;
    connections[subscriber].version = numeric_field(&watch_ack, "server_version").unwrap_or(1);
    wait_for_voice_state_on_all(
        gateways,
        &subscriber_conn,
        Some(&world.voice_channel_id),
        Duration::from_secs(10),
    )
    .await
    .context("watch mutation did not broadcast subscriber voice state")?;

    let preserve_ack = send_mutation_and_wait(
        &mut gateways[subscriber],
        world,
        &subscriber_conn,
        "preserve-watch-while-muted",
        &runtime_epoch,
        Some(connections[subscriber].version),
        json!({
            "self_mute": true,
            "self_deaf": false,
            "self_video": false,
            "self_stream": false,
        }),
    )
    .await?;
    assert_ack_status(&preserve_ack, "applied")?;
    assert_viewer_keys(
        &preserve_ack["canonical_state"],
        &[publisher_stream_key.as_str()],
    )?;
    assert_bool_field(&preserve_ack["canonical_state"], "self_mute", true)?;
    connections[subscriber].version =
        numeric_field(&preserve_ack, "server_version").unwrap_or(connections[subscriber].version);

    let clear_ack = send_mutation_and_wait(
        &mut gateways[subscriber],
        world,
        &subscriber_conn,
        "clear-watch",
        &runtime_epoch,
        Some(connections[subscriber].version),
        json!({
            "self_mute": true,
            "self_deaf": false,
            "self_video": false,
            "self_stream": false,
            "viewer_stream_keys": Value::Null,
        }),
    )
    .await?;
    assert_ack_status(&clear_ack, "applied")?;
    assert_viewer_keys(&clear_ack["canonical_state"], &[])?;
    connections[subscriber].version =
        numeric_field(&clear_ack, "server_version").unwrap_or(connections[subscriber].version);

    sleep(Duration::from_millis(1200)).await;
    let invalid_ack = send_mutation_and_wait(
        &mut gateways[subscriber],
        world,
        &subscriber_conn,
        "watch-missing-connection",
        &runtime_epoch,
        Some(connections[subscriber].version),
        json!({
            "self_mute": true,
            "self_deaf": false,
            "self_video": false,
            "self_stream": false,
            "viewer_stream_keys": [build_guild_stream_key(&world.guild_id, &world.voice_channel_id, "missing-connection")],
        }),
    )
    .await?;
    assert_ack_status(&invalid_ack, "rejected")?;
    assert_eq_field(&invalid_ack, "error_code", "VOICE_CONNECTION_NOT_FOUND")?;

    let stale_ack = send_mutation_and_wait(
        &mut gateways[subscriber],
        world,
        &subscriber_conn,
        "stale-base-version",
        &runtime_epoch,
        Some(0),
        json!({
            "self_mute": false,
            "self_deaf": false,
            "self_video": false,
            "self_stream": false,
        }),
    )
    .await?;
    assert_ack_status(&stale_ack, "rejected")?;
    assert_eq_field(&stale_ack, "error_code", "stale_base_version")?;

    sleep(Duration::from_millis(1200)).await;
    for index in 0..5 {
        let self_mute = index % 2 == 1;
        let mutation_id = format!("queued-mute-{index}");
        gateways[subscriber]
            .send_voice_update(voice_update_payload(
                world,
                &subscriber_conn,
                &mutation_id,
                &runtime_epoch,
                None,
                json!({
                    "self_mute": self_mute,
                    "self_deaf": false,
                    "self_video": false,
                    "self_stream": false,
                    "viewer_stream_keys": [],
                }),
            ))
            .await?;
    }
    let queued_ack = gateways[subscriber]
        .wait_for_dispatch("VOICE_STATE_ACK", Duration::from_secs(8), |data| {
            data.get("mutation_id").and_then(Value::as_str) == Some("queued-mute-4")
        })
        .await
        .context("final queued voice mutation was not acknowledged")?;
    assert_ack_status(&queued_ack, "applied")?;
    assert_bool_field(&queued_ack["canonical_state"], "self_mute", false)?;
    assert_viewer_keys(&queued_ack["canonical_state"], &[])?;
    connections[subscriber].version =
        numeric_field(&queued_ack, "server_version").unwrap_or(connections[subscriber].version);

    Ok(())
}

async fn run_private_call_scenarios(
    api: &Api,
    config: &Config,
    world: &TestWorld,
    gateways: &mut [GatewayClient],
) -> Result<()> {
    let dm_participants = [0usize, 1usize];
    let mut dm_connections = join_and_confirm_private_call(
        api,
        config,
        world,
        "DM",
        &world.dm_channel_id,
        &dm_participants,
        gateways,
    )
    .await?;
    run_private_watch_scenarios(
        "DM",
        &world.dm_channel_id,
        &dm_participants,
        gateways,
        &mut dm_connections,
    )
    .await?;
    run_private_stress_scenarios(
        config,
        "DM",
        &world.dm_channel_id,
        &dm_participants,
        gateways,
        &mut dm_connections,
    )
    .await?;
    disconnect_private_call(
        "DM",
        &world.dm_channel_id,
        &dm_participants,
        gateways,
        &dm_connections,
    )
    .await?;

    let gdm_participants = [0usize, 1usize, 2usize];
    let mut gdm_connections = join_and_confirm_private_call(
        api,
        config,
        world,
        "GDM",
        &world.group_dm_channel_id,
        &gdm_participants,
        gateways,
    )
    .await?;
    run_private_watch_scenarios(
        "GDM",
        &world.group_dm_channel_id,
        &gdm_participants,
        gateways,
        &mut gdm_connections,
    )
    .await?;
    run_private_stress_scenarios(
        config,
        "GDM",
        &world.group_dm_channel_id,
        &gdm_participants,
        gateways,
        &mut gdm_connections,
    )
    .await?;
    disconnect_private_call(
        "GDM",
        &world.group_dm_channel_id,
        &gdm_participants,
        gateways,
        &gdm_connections,
    )
    .await?;
    println!("Private DM/GDM voice backend integration checks passed.");
    Ok(())
}

async fn join_and_confirm_private_call(
    api: &Api,
    config: &Config,
    world: &TestWorld,
    label: &str,
    channel_id: &str,
    participant_indices: &[usize],
    gateways: &mut [GatewayClient],
) -> Result<Vec<VoiceConnection>> {
    let mut connections = Vec::new();
    for (position, gateway_index) in participant_indices.iter().copied().enumerate() {
        let self_stream = position == 0;
        let self_video = position == 0;
        gateways[gateway_index]
            .send_voice_update(json!({
                "guild_id": Value::Null,
                "channel_id": channel_id,
                "self_mute": false,
                "self_deaf": false,
                "self_video": self_video,
                "self_stream": self_stream,
                "is_mobile": position % 2 == 1,
                "latitude": 59.3293,
                "longitude": 18.0686,
            }))
            .await?;
        let server = gateways[gateway_index]
            .wait_for_dispatch("VOICE_SERVER_UPDATE", config.wait, |data| {
                data.get("channel_id").and_then(Value::as_str) == Some(channel_id)
                    && data.get("guild_id").map(Value::is_null).unwrap_or(true)
                    && data.get("token").and_then(Value::as_str).is_some()
                    && data.get("endpoint").and_then(Value::as_str).is_some()
                    && data.get("connection_id").and_then(Value::as_str).is_some()
            })
            .await
            .with_context(|| {
                format!(
                    "{} did not receive private {label} VOICE_SERVER_UPDATE",
                    gateways[gateway_index].name
                )
            })?;
        let connection_id = string_field(&server, "connection_id")?;
        confirm_voice_connection(api, None, channel_id, &connection_id).await?;
        let state = wait_for_voice_state_on_gateways_matching(
            gateways,
            participant_indices,
            &connection_id,
            Some(channel_id),
            config.wait,
            |_| true,
        )
        .await
        .with_context(|| {
            format!("{label} join did not broadcast VOICE_STATE_UPDATE for {connection_id}")
        })?;
        assert_bool_field(&state, "self_stream", self_stream)?;
        assert_bool_field(&state, "self_video", self_video)?;
        let account = &world.accounts[gateway_index];
        let identity = format!("user_{}_{}", account.user_id, connection_id);
        connections.push(VoiceConnection {
            connection_id,
            identity,
            token: string_field(&server, "token")?,
            endpoint: string_field(&server, "endpoint")?,
            version: numeric_field(&state, "version").unwrap_or(0),
        });
    }
    Ok(connections)
}

async fn run_private_watch_scenarios(
    label: &str,
    channel_id: &str,
    participant_indices: &[usize],
    gateways: &mut [GatewayClient],
    connections: &mut [VoiceConnection],
) -> Result<()> {
    if connections.len() < 2 || participant_indices.len() < 2 {
        bail!("{label} private watch scenario requires at least two participants");
    }
    let publisher_key = build_dm_stream_key(channel_id, &connections[0].connection_id);
    let subscriber_position = 1usize;
    let subscriber_gateway_index = participant_indices[subscriber_position];
    let subscriber_conn = connections[subscriber_position].connection_id.clone();

    gateways[subscriber_gateway_index]
        .send_voice_update(private_voice_update_payload(
            channel_id,
            &subscriber_conn,
            json!({
                "self_mute": false,
                "self_deaf": false,
                "self_video": false,
                "self_stream": false,
                "viewer_stream_keys": [publisher_key],
            }),
        ))
        .await?;
    let expected = vec![publisher_key.clone()];
    let state = wait_for_voice_state_on_gateways_matching(
        gateways,
        participant_indices,
        &subscriber_conn,
        Some(channel_id),
        Duration::from_secs(10),
        |data| viewer_keys_match(data, &expected),
    )
    .await
    .with_context(|| format!("{label} watch update did not broadcast watched stream key"))?;
    assert_viewer_key_strings(&state, &expected)?;

    gateways[subscriber_gateway_index]
        .send_voice_update(private_voice_update_payload(
            channel_id,
            &subscriber_conn,
            json!({
                "self_mute": true,
                "self_deaf": false,
                "self_video": false,
                "self_stream": false,
            }),
        ))
        .await?;
    let state = wait_for_voice_state_on_gateways_matching(
        gateways,
        participant_indices,
        &subscriber_conn,
        Some(channel_id),
        Duration::from_secs(10),
        |data| {
            viewer_keys_match(data, &expected)
                && data.get("self_mute").and_then(Value::as_bool) == Some(true)
        },
    )
    .await
    .with_context(|| format!("{label} mute update did not preserve private watch keys"))?;
    assert_bool_field(&state, "self_mute", true)?;
    assert_viewer_key_strings(&state, &expected)?;

    gateways[subscriber_gateway_index]
        .send_voice_update(private_voice_update_payload(
            channel_id,
            &subscriber_conn,
            json!({
                "self_mute": true,
                "self_deaf": false,
                "self_video": false,
                "self_stream": false,
                "viewer_stream_keys": Value::Null,
            }),
        ))
        .await?;
    let empty: Vec<String> = Vec::new();
    let state = wait_for_voice_state_on_gateways_matching(
        gateways,
        participant_indices,
        &subscriber_conn,
        Some(channel_id),
        Duration::from_secs(10),
        |data| viewer_keys_match(data, &empty),
    )
    .await
    .with_context(|| format!("{label} unwatch update did not clear private watch keys"))?;
    assert_viewer_key_strings(&state, &empty)?;
    Ok(())
}

async fn run_private_stress_scenarios(
    config: &Config,
    label: &str,
    channel_id: &str,
    participant_indices: &[usize],
    gateways: &mut [GatewayClient],
    connections: &mut [VoiceConnection],
) -> Result<()> {
    if config.stress_iterations == 0 {
        return Ok(());
    }
    if connections.len() < 2 || participant_indices.len() < 2 {
        bail!("{label} private stress scenario requires at least two participants");
    }
    let publisher_key = build_dm_stream_key(channel_id, &connections[0].connection_id);
    let subscriber_position = 1usize;
    let subscriber_gateway_index = participant_indices[subscriber_position];
    let subscriber_conn = connections[subscriber_position].connection_id.clone();
    for iteration in 0..config.stress_iterations {
        let expected_keys = if iteration % 3 == 0 {
            Vec::new()
        } else {
            vec![publisher_key.clone()]
        };
        let self_deaf = iteration % 4 == 0;
        let self_stream = iteration % 5 == 0;
        gateways[subscriber_gateway_index]
            .send_voice_update(private_voice_update_payload(
                channel_id,
                &subscriber_conn,
                json!({
                    "self_mute": iteration % 2 == 0,
                    "self_deaf": self_deaf,
                    "self_video": false,
                    "self_stream": self_stream,
                    "viewer_stream_keys": expected_keys,
                }),
            ))
            .await?;
        let state = wait_for_voice_state_on_gateways_matching(
            gateways,
            participant_indices,
            &subscriber_conn,
            Some(channel_id),
            Duration::from_secs(10),
            |data| {
                viewer_keys_match(data, &expected_keys)
                    && data.get("self_deaf").and_then(Value::as_bool) == Some(self_deaf)
                    && data.get("self_stream").and_then(Value::as_bool) == Some(self_stream)
            },
        )
        .await
        .with_context(|| {
            format!("{label} private stress iteration {iteration} did not converge")
        })?;
        assert_viewer_key_strings(&state, &expected_keys)?;
        assert_bool_field(&state, "self_deaf", self_deaf)?;
        assert_bool_field(&state, "self_stream", self_stream)?;
    }
    Ok(())
}

async fn disconnect_private_call(
    label: &str,
    channel_id: &str,
    participant_indices: &[usize],
    gateways: &mut [GatewayClient],
    connections: &[VoiceConnection],
) -> Result<()> {
    for (position, gateway_index) in participant_indices.iter().copied().enumerate().rev() {
        let connection = connections
            .get(position)
            .ok_or_else(|| anyhow!("{label} missing private connection at index {position}"))?;
        gateways[gateway_index]
            .send_voice_update(json!({
                "guild_id": Value::Null,
                "channel_id": Value::Null,
                "connection_id": connection.connection_id,
            }))
            .await?;
        wait_for_voice_state_on_gateways_matching(
            gateways,
            participant_indices,
            &connection.connection_id,
            None,
            Duration::from_secs(10),
            |_| true,
        )
        .await
        .with_context(|| {
            format!(
                "{label} private disconnect did not broadcast for channel {channel_id} connection {}",
                connection.connection_id
            )
        })?;
    }
    Ok(())
}

fn private_voice_update_payload(channel_id: &str, connection_id: &str, changes: Value) -> Value {
    let mut payload = json!({
        "guild_id": Value::Null,
        "channel_id": channel_id,
        "connection_id": connection_id,
        "self_mute": false,
        "self_deaf": false,
        "self_video": false,
        "self_stream": false,
        "is_mobile": false,
    });
    if let (Some(map), Some(changes)) = (payload.as_object_mut(), changes.as_object()) {
        for (key, value) in changes {
            map.insert(key.clone(), value.clone());
        }
    }
    payload
}

async fn run_disconnect_scenarios(
    world: &TestWorld,
    gateways: &mut [GatewayClient],
    connections: &[VoiceConnection],
) -> Result<()> {
    sleep(Duration::from_millis(1200)).await;
    gateways[0]
        .send_voice_update(json!({
            "guild_id": world.guild_id,
            "channel_id": Value::Null,
            "connection_id": connections[0].connection_id,
        }))
        .await?;
    wait_for_voice_state_on_all(
        gateways,
        &connections[0].connection_id,
        None,
        Duration::from_secs(10),
    )
    .await
    .context("publisher disconnect did not broadcast VOICE_STATE_UPDATE")?;

    let runtime_epoch = unique_slug("runtime-after-disconnect");
    let disconnected_key = build_guild_stream_key(
        &world.guild_id,
        &world.voice_channel_id,
        &connections[0].connection_id,
    );
    let ack = send_mutation_and_wait(
        &mut gateways[1],
        world,
        &connections[1].connection_id,
        "watch-disconnected-publisher",
        &runtime_epoch,
        None,
        json!({
            "self_mute": false,
            "self_deaf": false,
            "self_video": false,
            "self_stream": false,
            "viewer_stream_keys": [disconnected_key],
        }),
    )
    .await?;
    assert_ack_status(&ack, "rejected")?;
    assert_eq_field(&ack, "error_code", "VOICE_CONNECTION_NOT_FOUND")?;
    Ok(())
}

async fn send_mutation_and_wait(
    gateway: &mut GatewayClient,
    world: &TestWorld,
    connection_id: &str,
    mutation_id: &str,
    runtime_epoch: &str,
    base_version: Option<u64>,
    changes: Value,
) -> Result<Value> {
    gateway
        .send_voice_update(voice_update_payload(
            world,
            connection_id,
            mutation_id,
            runtime_epoch,
            base_version,
            changes,
        ))
        .await?;
    gateway
        .wait_for_dispatch("VOICE_STATE_ACK", Duration::from_secs(8), |data| {
            data.get("mutation_id").and_then(Value::as_str) == Some(mutation_id)
        })
        .await
        .with_context(|| format!("{mutation_id}: VOICE_STATE_ACK not received"))
}

fn voice_update_payload(
    world: &TestWorld,
    connection_id: &str,
    mutation_id: &str,
    runtime_epoch: &str,
    base_version: Option<u64>,
    changes: Value,
) -> Value {
    let mut payload = json!({
        "guild_id": world.guild_id,
        "channel_id": world.voice_channel_id,
        "connection_id": connection_id,
        "mutation_id": mutation_id,
        "runtime_epoch": runtime_epoch,
    });
    if let Some(base_version) = base_version {
        payload["base_version"] = Value::from(base_version);
    }
    if let (Some(map), Some(changes)) = (payload.as_object_mut(), changes.as_object()) {
        for (key, value) in changes {
            map.insert(key.clone(), value.clone());
        }
    }
    payload
}

async fn wait_for_voice_state_on_all(
    gateways: &mut [GatewayClient],
    connection_id: &str,
    expected_channel_id: Option<&str>,
    wait: Duration,
) -> Result<Value> {
    let indices = (0..gateways.len()).collect::<Vec<_>>();
    wait_for_voice_state_on_gateways_matching(
        gateways,
        &indices,
        connection_id,
        expected_channel_id,
        wait,
        |_| true,
    )
    .await
}

async fn wait_for_voice_state_on_gateways_matching<F>(
    gateways: &mut [GatewayClient],
    gateway_indices: &[usize],
    connection_id: &str,
    expected_channel_id: Option<&str>,
    wait: Duration,
    predicate: F,
) -> Result<Value>
where
    F: Fn(&Value) -> bool,
{
    let mut first = None;
    for index in gateway_indices {
        let gateway = gateways
            .get_mut(*index)
            .ok_or_else(|| anyhow!("gateway index {index} is out of range"))?;
        let state = gateway
            .wait_for_dispatch("VOICE_STATE_UPDATE", wait, |data| {
                voice_state_matches(data, connection_id, expected_channel_id) && predicate(data)
            })
            .await
            .with_context(|| {
                format!(
                    "{} did not receive VOICE_STATE_UPDATE for connection {connection_id}",
                    gateway.name
                )
            })?;
        if first.is_none() {
            first = Some(state);
        }
    }
    first.ok_or_else(|| anyhow!("no gateway clients were selected"))
}

fn run_native_livekit_harness(
    config: &Config,
    world: &TestWorld,
    connections: &[VoiceConnection],
) -> Result<()> {
    if connections.len() < 3 {
        bail!("native LiveKit harness requires publisher, subscriber, and secondary publisher");
    }
    let livekit_url = config
        .livekit_url
        .clone()
        .unwrap_or_else(|| connections[0].endpoint.clone());
    let room = format!(
        "guild_{}_channel_{}",
        world.guild_id, world.voice_channel_id
    );
    let report_path = native_report_path();
    let mut env = vec![
        ("LIVEKIT_URL".to_owned(), Some(livekit_url)),
        ("LIVEKIT_ROOM".to_owned(), Some(room)),
        (
            "LIVEKIT_PUBLISHER_TOKEN".to_owned(),
            Some(connections[0].token.clone()),
        ),
        (
            "LIVEKIT_PUBLISHER_IDENTITY".to_owned(),
            Some(connections[0].identity.clone()),
        ),
        (
            "LIVEKIT_SUBSCRIBER_TOKEN".to_owned(),
            Some(connections[1].token.clone()),
        ),
        (
            "LIVEKIT_SUBSCRIBER_IDENTITY".to_owned(),
            Some(connections[1].identity.clone()),
        ),
        (
            "LIVEKIT_SECONDARY_PUBLISHER_TOKEN".to_owned(),
            Some(connections[2].token.clone()),
        ),
        (
            "LIVEKIT_SECONDARY_PUBLISHER_IDENTITY".to_owned(),
            Some(connections[2].identity.clone()),
        ),
        (
            "LIVEKIT_SCREEN_CODECS".to_owned(),
            Some(config.native_screen_codecs.clone()),
        ),
        (
            "LIVEKIT_ENABLE_SECOND_PUBLISHER".to_owned(),
            Some("1".to_owned()),
        ),
        ("LIVEKIT_ENABLE_MICROPHONE".to_owned(), Some("1".to_owned())),
        (
            "LIVEKIT_SECOND_PUBLISHER_ENABLE_MICROPHONE".to_owned(),
            Some("1".to_owned()),
        ),
        (
            "LIVEKIT_ENABLE_SCREEN_AUDIO".to_owned(),
            Some("1".to_owned()),
        ),
        (
            "LIVEKIT_SECOND_PUBLISHER_ENABLE_SCREEN_AUDIO".to_owned(),
            Some("1".to_owned()),
        ),
        (
            "LIVEKIT_ENABLE_DATA_PACKET".to_owned(),
            Some("1".to_owned()),
        ),
        (
            "LIVEKIT_ENABLE_SUBSCRIPTION_CYCLE".to_owned(),
            Some("1".to_owned()),
        ),
        ("LIVEKIT_REQUIRED".to_owned(), Some("1".to_owned())),
        (
            "FLUXER_WEBRTC_SENDER_LIVEKIT_REQUIRED".to_owned(),
            Some("1".to_owned()),
        ),
        (
            "LIVEKIT_HARNESS_REPORT_PATH".to_owned(),
            Some(report_path.display().to_string()),
        ),
    ];
    if config.native_strict {
        env.push(("LIVEKIT_HARNESS_STRICT".to_owned(), Some("1".to_owned())));
    }
    if let Some(duration_ms) = config.native_duration_ms {
        env.push((
            "LIVEKIT_HARNESS_DURATION_MS".to_owned(),
            Some(duration_ms.to_string()),
        ));
    }
    println!(
        "Running native VoiceEngine LiveKit harness with backend-issued tokens; report={}",
        report_path.display()
    );
    run_command(
        &[
            "pnpm",
            "--dir",
            "fluxer_desktop/native/webrtc-sender",
            "run",
            "test:livekit",
        ],
        RunOptions {
            cwd: ROOT.as_path(),
            env,
            ..RunOptions::default()
        },
    )
    .map(drop)
}

fn native_report_path() -> PathBuf {
    ROOT.join(".fluxer/dev/native-voice-livekit-report.json")
}

fn parse_json_or_null(text: &str) -> Result<Value> {
    if text.trim().is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(text).context("response was not JSON")
}

fn dispatch_data<'a>(frame: &'a Value, event: &str) -> Option<&'a Value> {
    if frame.get("op").and_then(Value::as_i64) != Some(0) {
        return None;
    }
    if frame.get("t").and_then(Value::as_str) != Some(event) {
        return None;
    }
    frame.get("d")
}

fn voice_state_matches(
    data: &Value,
    connection_id: &str,
    expected_channel_id: Option<&str>,
) -> bool {
    if data.get("connection_id").and_then(Value::as_str) != Some(connection_id) {
        return false;
    }
    match expected_channel_id {
        Some(channel_id) => data.get("channel_id").and_then(Value::as_str) == Some(channel_id),
        None => data.get("channel_id").is_some_and(Value::is_null),
    }
}

fn build_guild_stream_key(guild_id: &str, channel_id: &str, connection_id: &str) -> String {
    format!("{guild_id}:{channel_id}:{connection_id}")
}

fn build_dm_stream_key(channel_id: &str, connection_id: &str) -> String {
    format!("dm:{channel_id}:{connection_id}")
}

fn string_field(value: &Value, field: &str) -> Result<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| anyhow!("missing string field {field} in {value}"))
}

fn nested_string_field(
    value: &Value,
    array_field: &str,
    index: usize,
    field: &str,
) -> Result<String> {
    value
        .get(array_field)
        .and_then(Value::as_array)
        .and_then(|values| values.get(index))
        .and_then(|item| item.get(field))
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| anyhow!("missing {array_field}[{index}].{field} in {value}"))
}

fn numeric_field(value: &Value, field: &str) -> Option<u64> {
    value.get(field).and_then(|value| match value {
        Value::Number(number) => number.as_u64(),
        Value::String(string) => string.parse().ok(),
        _ => None,
    })
}

fn assert_ack_status(ack: &Value, expected: &str) -> Result<()> {
    assert_eq_field(ack, "status", expected)
}

fn assert_eq_field(value: &Value, field: &str, expected: &str) -> Result<()> {
    let actual = value
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("missing string field {field} in {value}"))?;
    if actual != expected {
        bail!("expected {field}={expected}, got {actual}; payload={value}");
    }
    Ok(())
}

fn assert_bool_field(value: &Value, field: &str, expected: bool) -> Result<()> {
    let actual = value
        .get(field)
        .and_then(Value::as_bool)
        .ok_or_else(|| anyhow!("missing bool field {field} in {value}"))?;
    if actual != expected {
        bail!("expected {field}={expected}, got {actual}; payload={value}");
    }
    Ok(())
}

fn assert_viewer_keys(value: &Value, expected: &[&str]) -> Result<()> {
    let actual = value
        .get("viewer_stream_keys")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("missing viewer_stream_keys array in {value}"))?;
    let actual: Vec<&str> = actual.iter().filter_map(Value::as_str).collect();
    if actual != expected {
        bail!("expected viewer_stream_keys={expected:?}, got {actual:?}; payload={value}");
    }
    Ok(())
}

fn assert_viewer_key_strings(value: &Value, expected: &[String]) -> Result<()> {
    let actual = viewer_key_strings(value)
        .ok_or_else(|| anyhow!("missing viewer_stream_keys array in {value}"))?;
    if actual != expected {
        bail!("expected viewer_stream_keys={expected:?}, got {actual:?}; payload={value}");
    }
    Ok(())
}

fn viewer_keys_match(value: &Value, expected: &[String]) -> bool {
    viewer_key_strings(value).is_some_and(|actual| actual == expected)
}

fn viewer_key_strings(value: &Value) -> Option<Vec<String>> {
    value.get("viewer_stream_keys")?.as_array().map(|values| {
        values
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect()
    })
}

fn unique_name(prefix: &str) -> String {
    format!("{prefix} {}", unique_suffix())
}

fn unique_slug(prefix: &str) -> String {
    format!("{prefix}_{}", unique_suffix())
        .replace('-', "_")
        .to_lowercase()
}

fn unique_suffix() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("{}_{}", std::process::id(), millis)
}

fn unique_client_ip() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let fourth = (millis % 250) + 1;
    format!("198.51.100.{fourth}")
}
