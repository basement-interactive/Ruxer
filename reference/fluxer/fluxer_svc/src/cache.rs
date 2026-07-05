// SPDX-License-Identifier: AGPL-3.0-or-later

use moka::future::Cache;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

pub struct L1Cache<V> {
    cache: Cache<String, V>,
}

impl<V: Clone + Send + Sync + 'static> L1Cache<V> {
    pub fn new(max_entries: u64, ttl: Duration) -> Self {
        Self {
            cache: Cache::builder()
                .max_capacity(max_entries)
                .time_to_live(ttl)
                .build(),
        }
    }

    pub async fn get(&self, key: &str) -> Option<V> {
        self.cache.get(key).await
    }

    pub async fn insert(&self, key: &str, value: V) {
        self.cache.insert(key.to_owned(), value).await;
    }

    pub async fn invalidate(&self, key: &str) {
        self.cache.invalidate(key).await;
    }

    pub async fn get_or_try_insert_with<F, E>(&self, key: String, init: F) -> Result<V, Arc<E>>
    where
        F: Future<Output = Result<V, E>> + Send + 'static,
        E: Send + Sync + 'static,
    {
        self.cache.try_get_with(key, init).await
    }

    pub fn entry_count(&self) -> u64 {
        self.cache.entry_count()
    }
}
