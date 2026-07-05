//! Minimal end-to-end example: log in, look yourself up, list your guilds and DMs,
//! send a message, and react to it.
//!
//! Configure via `.env` (see `.env.example`). Variables:
//!   - `FLUXER_TOKEN`          required — session / bot / bearer token
//!   - `FLUXER_TOKEN_TYPE`     required — `session` | `bot` | `bearer` (default: `session`)
//!   - `FLUXER_TARGET_CHANNEL` optional — channel ID to send a test message + reaction
//!   - `FLUXER_API_BASE`       optional — override REST base URL (self-hosted)
//!   - `FLUXER_GATEWAY_URL`    optional — override gateway WebSocket URL

use fluxer::{AuthToken, Error, FluxerClient, ReactionTarget};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load variables from `.env` if present. Falls back to the real environment.
    let _ = dotenvy::dotenv();

    let token = std::env::var("FLUXER_TOKEN").expect("set FLUXER_TOKEN in .env or environment");
    let token_type = std::env::var("FLUXER_TOKEN_TYPE")
        .unwrap_or_else(|_| "session".into())
        .trim()
        .to_lowercase();
    let auth = match token_type.as_str() {
        "session" => AuthToken::session(token),
        "bot" => AuthToken::bot(token),
        "bearer" => AuthToken::bearer(token),
        other => panic!("FLUXER_TOKEN_TYPE={other:?} is invalid; use session, bot, or bearer"),
    };
    println!("auth scheme: {token_type}");

    let mut builder = FluxerClient::builder(auth);
    if let Ok(base) = std::env::var("FLUXER_API_BASE") {
        if !base.trim().is_empty() {
            builder = builder.base_url(base);
        }
    }
    let client = builder.build()?;

    // Who am I? This is the first authenticated call, so a bad token fails here.
    let me = match client.users().current().await {
        Ok(me) => me,
        Err(Error::Api { code, status, .. })
            if status.as_u16() == 401 || code == "UNAUTHORIZED" || code == "INVALID_AUTH_TOKEN" =>
        {
            eprintln!("Authentication failed ({}).", status);
            eprintln!("Check that FLUXER_TOKEN is correct and that FLUXER_TOKEN_TYPE matches:");
            eprintln!("  bot     -> Authorization: Bot <token>     (developer portal bot token)");
            eprintln!(
                "  session -> Authorization: <token>         (user session token from login)"
            );
            eprintln!("  bearer  -> Authorization: Bearer <token>  (OAuth2 access token)");
            return Err("unauthorized".into());
        }
        Err(e) => return Err(e.into()),
    };
    println!(
        "logged in as {} ({})",
        me.user.tag(),
        me.user.display_name()
    );

    // List guilds.
    let guilds = client.users().guilds().await?;
    println!("{} guild(s):", guilds.len());
    for g in &guilds {
        println!("  - {} ({})", g.name, g.id);
    }

    // List DM channels.
    let dms = client.users().private_channels().await?;
    println!("{} DM channel(s):", dms.len());
    for c in &dms {
        let label = c.name.clone().unwrap_or_else(|| {
            c.recipients
                .iter()
                .map(|u| u.username.clone())
                .collect::<Vec<_>>()
                .join(", ")
        });
        println!("  - {} ({}, kind={})", label, c.id, c.kind);
    }

    // If a target channel ID is provided, send a message and react to it.
    if let Ok(target) = std::env::var("FLUXER_TARGET_CHANNEL") {
        if !target.trim().is_empty() {
            let sent = client
                .messages()
                .send_text(&target, "Hello from fluxer-rust!")
                .await?;
            println!("sent message {} in {}", sent.id, target);

            client
                .reactions()
                .add(&target, &sent.id, &ReactionTarget::Unicode("👍".into()))
                .await?;
            println!("reacted 👍");
        }
    }

    Ok(())
}
