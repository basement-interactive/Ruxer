// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::types::{ApiUserPartial, User, UserPartial, UserRequest, UserResponse};
#[cfg(feature = "scylla")]
use chrono::{DateTime, NaiveDate, Utc};
use fluxer_svc::shard::ShardService;
use fluxer_svc::transport::NatsTransport;
use fluxer_svc::{postgres, postgres::KeyPart};
use futures::stream::{self, StreamExt};
use moka::future::Cache;
#[cfg(feature = "scylla")]
use scylla::DeserializeRow;
#[cfg(feature = "scylla")]
use scylla::client::session::Session;
#[cfg(feature = "scylla")]
use scylla::statement::prepared::PreparedStatement;
#[cfg(feature = "scylla")]
use scylla::value::MaybeEmpty;
use serde::Deserialize;
use std::sync::Arc;
use std::time::Duration;

#[cfg(feature = "scylla")]
type OptionalTimestamp = Option<MaybeEmpty<DateTime<Utc>>>;
#[cfg(feature = "scylla")]
type OptionalDate = Option<MaybeEmpty<NaiveDate>>;

#[cfg(feature = "scylla")]
const FULL_USER_COLUMNS: &str = "\
    user_id, username, discriminator, bot, system, \
    email, email_verified, email_bounced, \
    authenticator_types, \
    avatar_hash, avatar_color, banner_hash, banner_color, \
    bio, accent_color, date_of_birth, locale, \
    flags, premium_flags, global_name, pronouns, \
    traits, premium_type, premium_since, \
    premium_until, premium_gift_extension_ends_at, \
    premium_lifetime_sequence, premium_billing_cycle, \
    premium_will_cancel, premium_onboarding_dismissed_at, \
    has_ever_purchased, stripe_subscription_id, stripe_customer_id, \
    gift_inventory_server_seq, gift_inventory_client_seq, \
    suspicious_activity_flags, terms_agreed_at, privacy_agreed_at, \
    last_active_at, last_active_ip, \
    temp_banned_until, pending_deletion_at, \
    pending_bulk_message_deletion_at, \
    pending_bulk_message_deletion_channel_count, \
    pending_bulk_message_deletion_message_count, \
    password_last_changed_at, acls, \
    deletion_reason_code, deletion_public_reason, deletion_audit_log_reason, \
    first_refund_at, version, has_verified_phone, \
    premium_grace_ends_at, mention_flags, \
    last_voice_activity_sharing_change_at, \
    timezone, timezone_privacy_flags";
const USER_BATCH_SIZE: usize = 128;
const USER_BATCH_CONCURRENCY: usize = 8;
const FLUXER_SYSTEM_USER_ID: i64 = 0;
const FLUXER_SYSTEM_USERNAME: &str = "Fluxer";
const FLUXER_SYSTEM_DISCRIMINATOR: i32 = 0;
const USER_FLAG_STAFF: i64 = 1;

pub struct UsersShard {
    storage: UsersStorage,
    cache: Cache<i64, Option<User>>,
    transport: NatsTransport,
}

#[derive(Clone)]
enum UsersStorage {
    Postgres(PostgresUsersStorage),
    #[cfg(feature = "scylla")]
    Scylla(ScyllaUsersStorage),
}

#[derive(Clone)]
struct PostgresUsersStorage {
    kv: postgres::KvClient,
}

#[cfg(feature = "scylla")]
#[derive(Clone)]
struct ScyllaUsersStorage {
    db: Arc<Session>,
    stmt_full: PreparedStatement,
    stmt_full_batch: PreparedStatement,
}

#[cfg(feature = "scylla")]
#[derive(Debug, DeserializeRow)]
struct FullUserDbRow {
    user_id: i64,
    username: String,
    discriminator: i32,
    bot: Option<bool>,
    system: Option<bool>,
    email: Option<String>,
    email_verified: Option<bool>,
    email_bounced: Option<bool>,
    authenticator_types: Option<std::collections::HashSet<i32>>,
    avatar_hash: Option<String>,
    avatar_color: Option<i32>,
    banner_hash: Option<String>,
    banner_color: Option<i32>,
    bio: Option<String>,
    accent_color: Option<i32>,
    date_of_birth: OptionalDate,
    locale: Option<String>,
    flags: Option<i64>,
    premium_flags: Option<i32>,
    global_name: Option<String>,
    pronouns: Option<String>,
    traits: Option<std::collections::HashSet<String>>,
    premium_type: Option<i32>,
    premium_since: OptionalTimestamp,
    premium_until: OptionalTimestamp,
    premium_gift_extension_ends_at: OptionalTimestamp,
    premium_lifetime_sequence: Option<i32>,
    premium_billing_cycle: Option<String>,
    premium_will_cancel: Option<bool>,
    premium_onboarding_dismissed_at: OptionalTimestamp,
    has_ever_purchased: Option<bool>,
    stripe_subscription_id: Option<String>,
    stripe_customer_id: Option<String>,
    gift_inventory_server_seq: Option<i32>,
    gift_inventory_client_seq: Option<i32>,
    suspicious_activity_flags: Option<i32>,
    terms_agreed_at: OptionalTimestamp,
    privacy_agreed_at: OptionalTimestamp,
    last_active_at: OptionalTimestamp,
    last_active_ip: Option<String>,
    temp_banned_until: OptionalTimestamp,
    pending_deletion_at: OptionalTimestamp,
    pending_bulk_message_deletion_at: OptionalTimestamp,
    pending_bulk_message_deletion_channel_count: Option<i32>,
    pending_bulk_message_deletion_message_count: Option<i32>,
    password_last_changed_at: OptionalTimestamp,
    acls: Option<std::collections::HashSet<String>>,
    deletion_reason_code: Option<i32>,
    deletion_public_reason: Option<String>,
    deletion_audit_log_reason: Option<String>,
    first_refund_at: OptionalTimestamp,
    version: Option<i32>,
    has_verified_phone: Option<bool>,
    premium_grace_ends_at: OptionalTimestamp,
    mention_flags: Option<i32>,
    last_voice_activity_sharing_change_at: OptionalTimestamp,
    timezone: Option<String>,
    timezone_privacy_flags: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct FullUserKvRow {
    user_id: i64,
    username: String,
    discriminator: i32,
    bot: Option<bool>,
    system: Option<bool>,
    email: Option<String>,
    email_verified: Option<bool>,
    email_bounced: Option<bool>,
    authenticator_types: Option<Vec<i32>>,
    avatar_hash: Option<String>,
    avatar_color: Option<i32>,
    banner_hash: Option<String>,
    banner_color: Option<i32>,
    bio: Option<String>,
    accent_color: Option<i32>,
    date_of_birth: Option<String>,
    locale: Option<String>,
    flags: Option<i64>,
    premium_flags: Option<i32>,
    global_name: Option<String>,
    pronouns: Option<String>,
    traits: Option<Vec<String>>,
    premium_type: Option<i32>,
    premium_since: Option<i64>,
    premium_until: Option<i64>,
    premium_gift_extension_ends_at: Option<i64>,
    premium_lifetime_sequence: Option<i32>,
    premium_billing_cycle: Option<String>,
    premium_will_cancel: Option<bool>,
    premium_onboarding_dismissed_at: Option<i64>,
    has_ever_purchased: Option<bool>,
    stripe_subscription_id: Option<String>,
    stripe_customer_id: Option<String>,
    gift_inventory_server_seq: Option<i32>,
    gift_inventory_client_seq: Option<i32>,
    suspicious_activity_flags: Option<i32>,
    terms_agreed_at: Option<i64>,
    privacy_agreed_at: Option<i64>,
    last_active_at: Option<i64>,
    last_active_ip: Option<String>,
    temp_banned_until: Option<i64>,
    pending_deletion_at: Option<i64>,
    pending_bulk_message_deletion_at: Option<i64>,
    pending_bulk_message_deletion_channel_count: Option<i32>,
    pending_bulk_message_deletion_message_count: Option<i32>,
    password_last_changed_at: Option<i64>,
    acls: Option<Vec<String>>,
    deletion_reason_code: Option<i32>,
    deletion_public_reason: Option<String>,
    deletion_audit_log_reason: Option<String>,
    first_refund_at: Option<i64>,
    version: Option<i32>,
    has_verified_phone: Option<bool>,
    premium_grace_ends_at: Option<i64>,
    mention_flags: Option<i32>,
    last_voice_activity_sharing_change_at: Option<i64>,
    timezone: Option<String>,
    timezone_privacy_flags: Option<i32>,
}

impl UsersShard {
    pub fn new_postgres(
        kv: postgres::KvClient,
        transport: NatsTransport,
        max_entries: u64,
        ttl: Duration,
    ) -> anyhow::Result<Self> {
        let cache = Cache::builder()
            .max_capacity(max_entries)
            .time_to_live(ttl)
            .build();

        Ok(Self {
            storage: UsersStorage::Postgres(PostgresUsersStorage { kv }),
            cache,
            transport,
        })
    }

    #[cfg(feature = "scylla")]
    pub async fn new_scylla(
        db: Arc<Session>,
        transport: NatsTransport,
        max_entries: u64,
        ttl: Duration,
    ) -> anyhow::Result<Self> {
        let stmt_full = db
            .prepare(format!(
                "SELECT {FULL_USER_COLUMNS} FROM users WHERE user_id = ? LIMIT 1"
            ))
            .await?;
        let stmt_full_batch = db
            .prepare(format!(
                "SELECT {FULL_USER_COLUMNS} FROM users WHERE user_id IN ?"
            ))
            .await?;
        let cache = Cache::builder()
            .max_capacity(max_entries)
            .time_to_live(ttl)
            .build();

        Ok(Self {
            storage: UsersStorage::Scylla(ScyllaUsersStorage {
                db,
                stmt_full,
                stmt_full_batch,
            }),
            cache,
            transport,
        })
    }

    async fn get_full_user(&self, user_id: i64) -> anyhow::Result<Option<User>> {
        if user_id == FLUXER_SYSTEM_USER_ID {
            return Ok(Some(fluxer_system_user()));
        }
        let storage = self.storage.clone();
        self.cache
            .try_get_with(
                user_id,
                async move { storage.fetch_full_user(user_id).await },
            )
            .await
            .map_err(|e: Arc<anyhow::Error>| anyhow::anyhow!("{e}"))
    }

    async fn get_partial_user(&self, user_id: i64) -> anyhow::Result<Option<UserPartial>> {
        Ok(self.get_full_user(user_id).await?.map(|u| u.to_partial()))
    }

    async fn get_partial_users(&self, user_ids: Vec<i64>) -> anyhow::Result<Vec<UserPartial>> {
        let mut user_ids = user_ids;
        user_ids.sort_unstable();
        user_ids.dedup();
        let mut partials = Vec::new();
        let mut misses = Vec::new();
        for user_id in user_ids {
            if user_id == FLUXER_SYSTEM_USER_ID {
                partials.push(fluxer_system_user().to_partial());
                continue;
            }
            match self.cache.get(&user_id).await {
                Some(Some(user)) => partials.push(user.to_partial()),
                Some(None) => {}
                None => misses.push(user_id),
            }
        }
        if misses.is_empty() {
            return Ok(partials);
        }
        let batches = misses
            .chunks(USER_BATCH_SIZE)
            .map(<[i64]>::to_vec)
            .collect::<Vec<_>>();
        let fetched_batches = stream::iter(batches)
            .map(|batch| async move { self.fetch_user_batch(batch).await })
            .buffer_unordered(USER_BATCH_CONCURRENCY)
            .collect::<Vec<_>>()
            .await;
        for fetched in fetched_batches {
            partials.extend(fetched?.into_iter().map(|user| user.to_partial()));
        }
        Ok(partials)
    }

    async fn get_api_partial_user(
        &self,
        user_id: String,
    ) -> anyhow::Result<Option<ApiUserPartial>> {
        let user_id = parse_user_id(&user_id)?;
        Ok(self
            .get_partial_user(user_id)
            .await?
            .map(|u| u.to_api_partial()))
    }

    async fn get_api_partial_users(
        &self,
        user_ids: Vec<String>,
    ) -> anyhow::Result<Vec<ApiUserPartial>> {
        let user_ids = user_ids
            .iter()
            .map(|user_id| parse_user_id(user_id))
            .collect::<anyhow::Result<Vec<_>>>()?;
        Ok(self
            .get_partial_users(user_ids)
            .await?
            .into_iter()
            .map(|partial| partial.to_api_partial())
            .collect())
    }

    async fn fetch_user_batch(&self, user_ids: Vec<i64>) -> anyhow::Result<Vec<User>> {
        let mut users = Vec::new();
        let user_ids = user_ids
            .into_iter()
            .filter(|user_id| {
                if *user_id == FLUXER_SYSTEM_USER_ID {
                    users.push(fluxer_system_user());
                    false
                } else {
                    true
                }
            })
            .collect::<Vec<_>>();
        if user_ids.is_empty() {
            return Ok(users);
        }
        let fetched_users = match self.storage.fetch_user_batch(user_ids.clone()).await {
            Ok(users) => users,
            Err(_) => {
                users.extend(self.fetch_user_batch_individually(user_ids).await?);
                return Ok(users);
            }
        };
        let found_ids = fetched_users
            .iter()
            .map(|user| user.user_id)
            .collect::<std::collections::HashSet<_>>();
        for user in &fetched_users {
            self.cache.insert(user.user_id, Some(user.clone())).await;
        }
        for user_id in user_ids {
            if !found_ids.contains(&user_id) {
                self.cache.insert(user_id, None).await;
            }
        }
        users.extend(fetched_users);
        Ok(users)
    }

    async fn fetch_user_batch_individually(&self, user_ids: Vec<i64>) -> anyhow::Result<Vec<User>> {
        let users = stream::iter(user_ids)
            .map(|user_id| async move { self.get_full_user(user_id).await })
            .buffer_unordered(USER_BATCH_CONCURRENCY)
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .flatten()
            .collect();
        Ok(users)
    }
}

impl UsersStorage {
    async fn fetch_full_user(&self, user_id: i64) -> anyhow::Result<Option<User>> {
        match self {
            UsersStorage::Postgres(storage) => storage.fetch_full_user(user_id).await,
            #[cfg(feature = "scylla")]
            UsersStorage::Scylla(storage) => storage.fetch_full_user(user_id).await,
        }
    }

    async fn fetch_user_batch(&self, user_ids: Vec<i64>) -> anyhow::Result<Vec<User>> {
        match self {
            UsersStorage::Postgres(storage) => storage.fetch_user_batch(user_ids).await,
            #[cfg(feature = "scylla")]
            UsersStorage::Scylla(storage) => storage.fetch_user_batch(user_ids).await,
        }
    }
}

impl PostgresUsersStorage {
    async fn fetch_full_user(&self, user_id: i64) -> anyhow::Result<Option<User>> {
        let key = postgres::kv_key(&[KeyPart::BigInt(user_id)])?;
        let Some(row) = self.kv.get_row("users", &key).await? else {
            return Ok(None);
        };
        decode_postgres_user(row).map(Some)
    }

    async fn fetch_user_batch(&self, user_ids: Vec<i64>) -> anyhow::Result<Vec<User>> {
        let keys = user_ids
            .iter()
            .map(|user_id| postgres::kv_key(&[KeyPart::BigInt(*user_id)]))
            .collect::<anyhow::Result<Vec<_>>>()?;
        let rows = self.kv.get_rows("users", &keys).await?;
        rows.into_iter()
            .map(|(_, row)| decode_postgres_user(row))
            .collect()
    }
}

#[cfg(feature = "scylla")]
impl ScyllaUsersStorage {
    async fn fetch_full_user(&self, user_id: i64) -> anyhow::Result<Option<User>> {
        let result = self.db.execute_unpaged(&self.stmt_full, (user_id,)).await?;
        let rows = result.into_rows_result()?;
        let user = rows.maybe_first_row::<FullUserDbRow>()?.map(Into::into);
        Ok(user)
    }

    async fn fetch_user_batch(&self, user_ids: Vec<i64>) -> anyhow::Result<Vec<User>> {
        let result = self
            .db
            .execute_unpaged(&self.stmt_full_batch, (user_ids,))
            .await?;
        let rows = result.into_rows_result()?;
        let rows: Vec<FullUserDbRow> = rows.rows::<FullUserDbRow>()?.collect::<Result<_, _>>()?;
        Ok(rows.into_iter().map(User::from).collect::<Vec<_>>())
    }
}

fn decode_postgres_user(row: serde_json::Value) -> anyhow::Result<User> {
    let row = postgres::decode_row_dates_as_millis(row)?;
    let row: FullUserKvRow = serde_json::from_value(row)?;
    Ok(row.into())
}

fn fluxer_system_user() -> User {
    User {
        user_id: FLUXER_SYSTEM_USER_ID,
        username: FLUXER_SYSTEM_USERNAME.to_owned(),
        discriminator: FLUXER_SYSTEM_DISCRIMINATOR,
        bot: Some(true),
        system: Some(true),
        email: None,
        email_verified: None,
        email_bounced: None,
        authenticator_types: Vec::new(),
        avatar_hash: None,
        avatar_color: None,
        banner_hash: None,
        banner_color: None,
        bio: None,
        accent_color: None,
        date_of_birth: None,
        locale: None,
        flags: Some(USER_FLAG_STAFF),
        premium_flags: None,
        global_name: None,
        pronouns: None,
        traits: Vec::new(),
        premium_type: None,
        premium_since: None,
        premium_until: None,
        premium_gift_extension_ends_at: None,
        premium_lifetime_sequence: None,
        premium_billing_cycle: None,
        premium_will_cancel: None,
        premium_onboarding_dismissed_at: None,
        has_ever_purchased: None,
        stripe_subscription_id: None,
        stripe_customer_id: None,
        gift_inventory_server_seq: None,
        gift_inventory_client_seq: None,
        suspicious_activity_flags: None,
        terms_agreed_at: None,
        privacy_agreed_at: None,
        last_active_at: None,
        last_active_ip: None,
        temp_banned_until: None,
        pending_deletion_at: None,
        pending_bulk_message_deletion_at: None,
        pending_bulk_message_deletion_channel_count: None,
        pending_bulk_message_deletion_message_count: None,
        password_last_changed_at: None,
        acls: Vec::new(),
        deletion_reason_code: None,
        deletion_public_reason: None,
        deletion_audit_log_reason: None,
        first_refund_at: None,
        version: 1,
        has_verified_phone: None,
        premium_grace_ends_at: None,
        mention_flags: None,
        last_voice_activity_sharing_change_at: None,
        timezone: None,
        timezone_privacy_flags: None,
    }
}

impl ShardService for UsersShard {
    type Request = UserRequest;
    type Response = UserResponse;

    fn service_name(&self) -> &str {
        "users"
    }

    async fn handle(&self, request: UserRequest) -> anyhow::Result<UserResponse> {
        match request {
            UserRequest::GetById { user_id } => match self.get_full_user(user_id).await? {
                Some(user) => Ok(UserResponse::Found(user)),
                None => Ok(UserResponse::NotFound),
            },
            UserRequest::GetPartialById { user_id } => {
                match self.get_partial_user(user_id).await? {
                    Some(partial) => Ok(UserResponse::FoundPartial(partial)),
                    None => Ok(UserResponse::NotFound),
                }
            }
            UserRequest::GetPartialsByIds { user_ids } => Ok(UserResponse::FoundPartials(
                self.get_partial_users(user_ids).await?,
            )),
            UserRequest::GetApiPartialById { user_id } => {
                match self.get_api_partial_user(user_id).await? {
                    Some(partial) => Ok(UserResponse::FoundApiPartial(partial)),
                    None => Ok(UserResponse::NotFound),
                }
            }
            UserRequest::GetApiPartialsByIds { user_ids } => Ok(UserResponse::FoundApiPartials(
                self.get_api_partial_users(user_ids).await?,
            )),
            UserRequest::Invalidate { user_id } => {
                self.cache.invalidate(&user_id).await;
                let subject = format!("svc.users.invalidate.{user_id}");
                self.transport.publish(&subject, &[]).await?;
                Ok(UserResponse::Invalidated)
            }
        }
    }
}

fn parse_user_id(user_id: &str) -> anyhow::Result<i64> {
    user_id
        .parse::<i64>()
        .map_err(|error| anyhow::anyhow!("invalid user id {user_id}: {error}"))
}

#[cfg(feature = "scylla")]
fn optional_timestamp_millis(value: OptionalTimestamp) -> Option<i64> {
    value.and_then(|maybe: MaybeEmpty<DateTime<Utc>>| match maybe {
        MaybeEmpty::Empty => None,
        MaybeEmpty::Value(dt) => Some(dt.timestamp_millis()),
    })
}

#[cfg(feature = "scylla")]
fn optional_date_string(value: OptionalDate) -> Option<String> {
    value.and_then(|maybe: MaybeEmpty<NaiveDate>| match maybe {
        MaybeEmpty::Empty => None,
        MaybeEmpty::Value(d) => Some(d.to_string()),
    })
}

#[cfg(feature = "scylla")]
impl From<FullUserDbRow> for User {
    fn from(row: FullUserDbRow) -> Self {
        Self {
            user_id: row.user_id,
            username: row.username,
            discriminator: row.discriminator,
            bot: row.bot,
            system: row.system,
            email: row.email,
            email_verified: row.email_verified,
            email_bounced: row.email_bounced,
            authenticator_types: row
                .authenticator_types
                .map(|s| s.into_iter().collect())
                .unwrap_or_default(),
            avatar_hash: row.avatar_hash,
            avatar_color: row.avatar_color,
            banner_hash: row.banner_hash,
            banner_color: row.banner_color,
            bio: row.bio,
            accent_color: row.accent_color,
            date_of_birth: optional_date_string(row.date_of_birth),
            locale: row.locale,
            flags: row.flags,
            premium_flags: row.premium_flags,
            global_name: row.global_name,
            pronouns: row.pronouns,
            traits: row
                .traits
                .map(|s| s.into_iter().collect())
                .unwrap_or_default(),
            premium_type: row.premium_type,
            premium_since: optional_timestamp_millis(row.premium_since),
            premium_until: optional_timestamp_millis(row.premium_until),
            premium_gift_extension_ends_at: optional_timestamp_millis(
                row.premium_gift_extension_ends_at,
            ),
            premium_lifetime_sequence: row.premium_lifetime_sequence,
            premium_billing_cycle: row.premium_billing_cycle,
            premium_will_cancel: row.premium_will_cancel,
            premium_onboarding_dismissed_at: optional_timestamp_millis(
                row.premium_onboarding_dismissed_at,
            ),
            has_ever_purchased: row.has_ever_purchased,
            stripe_subscription_id: row.stripe_subscription_id,
            stripe_customer_id: row.stripe_customer_id,
            gift_inventory_server_seq: row.gift_inventory_server_seq,
            gift_inventory_client_seq: row.gift_inventory_client_seq,
            suspicious_activity_flags: row.suspicious_activity_flags,
            terms_agreed_at: optional_timestamp_millis(row.terms_agreed_at),
            privacy_agreed_at: optional_timestamp_millis(row.privacy_agreed_at),
            last_active_at: optional_timestamp_millis(row.last_active_at),
            last_active_ip: row.last_active_ip,
            temp_banned_until: optional_timestamp_millis(row.temp_banned_until),
            pending_deletion_at: optional_timestamp_millis(row.pending_deletion_at),
            pending_bulk_message_deletion_at: optional_timestamp_millis(
                row.pending_bulk_message_deletion_at,
            ),
            pending_bulk_message_deletion_channel_count: row
                .pending_bulk_message_deletion_channel_count,
            pending_bulk_message_deletion_message_count: row
                .pending_bulk_message_deletion_message_count,
            password_last_changed_at: optional_timestamp_millis(row.password_last_changed_at),
            acls: row
                .acls
                .map(|s| s.into_iter().collect())
                .unwrap_or_default(),
            deletion_reason_code: row.deletion_reason_code,
            deletion_public_reason: row.deletion_public_reason,
            deletion_audit_log_reason: row.deletion_audit_log_reason,
            first_refund_at: optional_timestamp_millis(row.first_refund_at),
            version: row.version.unwrap_or_default(),
            has_verified_phone: row.has_verified_phone,
            premium_grace_ends_at: optional_timestamp_millis(row.premium_grace_ends_at),
            mention_flags: row.mention_flags,
            last_voice_activity_sharing_change_at: optional_timestamp_millis(
                row.last_voice_activity_sharing_change_at,
            ),
            timezone: row.timezone,
            timezone_privacy_flags: row.timezone_privacy_flags,
        }
    }
}

impl From<FullUserKvRow> for User {
    fn from(row: FullUserKvRow) -> Self {
        Self {
            user_id: row.user_id,
            username: row.username,
            discriminator: row.discriminator,
            bot: row.bot,
            system: row.system,
            email: row.email,
            email_verified: row.email_verified,
            email_bounced: row.email_bounced,
            authenticator_types: row.authenticator_types.unwrap_or_default(),
            avatar_hash: row.avatar_hash,
            avatar_color: row.avatar_color,
            banner_hash: row.banner_hash,
            banner_color: row.banner_color,
            bio: row.bio,
            accent_color: row.accent_color,
            date_of_birth: row.date_of_birth,
            locale: row.locale,
            flags: row.flags,
            premium_flags: row.premium_flags,
            global_name: row.global_name,
            pronouns: row.pronouns,
            traits: row.traits.unwrap_or_default(),
            premium_type: row.premium_type,
            premium_since: row.premium_since,
            premium_until: row.premium_until,
            premium_gift_extension_ends_at: row.premium_gift_extension_ends_at,
            premium_lifetime_sequence: row.premium_lifetime_sequence,
            premium_billing_cycle: row.premium_billing_cycle,
            premium_will_cancel: row.premium_will_cancel,
            premium_onboarding_dismissed_at: row.premium_onboarding_dismissed_at,
            has_ever_purchased: row.has_ever_purchased,
            stripe_subscription_id: row.stripe_subscription_id,
            stripe_customer_id: row.stripe_customer_id,
            gift_inventory_server_seq: row.gift_inventory_server_seq,
            gift_inventory_client_seq: row.gift_inventory_client_seq,
            suspicious_activity_flags: row.suspicious_activity_flags,
            terms_agreed_at: row.terms_agreed_at,
            privacy_agreed_at: row.privacy_agreed_at,
            last_active_at: row.last_active_at,
            last_active_ip: row.last_active_ip,
            temp_banned_until: row.temp_banned_until,
            pending_deletion_at: row.pending_deletion_at,
            pending_bulk_message_deletion_at: row.pending_bulk_message_deletion_at,
            pending_bulk_message_deletion_channel_count: row
                .pending_bulk_message_deletion_channel_count,
            pending_bulk_message_deletion_message_count: row
                .pending_bulk_message_deletion_message_count,
            password_last_changed_at: row.password_last_changed_at,
            acls: row.acls.unwrap_or_default(),
            deletion_reason_code: row.deletion_reason_code,
            deletion_public_reason: row.deletion_public_reason,
            deletion_audit_log_reason: row.deletion_audit_log_reason,
            first_refund_at: row.first_refund_at,
            version: row.version.unwrap_or_default(),
            has_verified_phone: row.has_verified_phone,
            premium_grace_ends_at: row.premium_grace_ends_at,
            mention_flags: row.mention_flags,
            last_voice_activity_sharing_change_at: row.last_voice_activity_sharing_change_at,
            timezone: row.timezone,
            timezone_privacy_flags: row.timezone_privacy_flags,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn fluxer_system_user_partial_is_virtual_id_zero() {
        let partial = fluxer_system_user().to_partial();

        assert_eq!(partial.user_id, 0);
        assert_eq!(partial.username, "Fluxer");
        assert_eq!(partial.discriminator, 0);
        assert_eq!(partial.global_name, None);
        assert_eq!(partial.bot, Some(true));
        assert_eq!(partial.system, Some(true));
        assert_eq!(partial.flags, Some(USER_FLAG_STAFF));
        assert_eq!(partial.avatar_hash, None);
        assert_eq!(partial.avatar_color, None);
    }

    #[test]
    fn postgres_user_decoder_maps_tagged_kv_payload() {
        let user = decode_postgres_user(json!({
            "user_id": {"__fluxer_type": "bigint", "value": "42"},
            "username": "ada",
            "discriminator": 7,
            "authenticator_types": {"__fluxer_type": "set", "value": [1, 2]},
            "traits": {"__fluxer_type": "set", "value": ["founder"]},
            "acls": {"__fluxer_type": "set", "value": ["admin"]},
            "flags": {"__fluxer_type": "bigint", "value": "9007199254740991"},
            "date_of_birth": {"__fluxer_type": "local_date", "value": "1815-12-10"},
            "premium_since": {"__fluxer_type": "date", "value": "2026-06-15T12:34:56.789Z"},
            "version": 3
        }))
        .unwrap();

        assert_eq!(user.user_id, 42);
        assert_eq!(user.username, "ada");
        assert_eq!(user.discriminator, 7);
        assert_eq!(user.authenticator_types, vec![1, 2]);
        assert_eq!(user.traits, vec!["founder"]);
        assert_eq!(user.acls, vec!["admin"]);
        assert_eq!(user.flags, Some(9_007_199_254_740_991));
        assert_eq!(user.date_of_birth.as_deref(), Some("1815-12-10"));
        assert_eq!(user.premium_since, Some(1_781_526_896_789));
        assert_eq!(user.version, 3);
    }
}
