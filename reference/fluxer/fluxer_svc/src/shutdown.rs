// SPDX-License-Identifier: AGPL-3.0-or-later

use std::time::Duration;

pub const DEFAULT_DRAIN_TIMEOUT: Duration = Duration::from_secs(20);

pub async fn wait_for_shutdown() {
    let ctrl_c = tokio::signal::ctrl_c();

    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut sigterm =
            signal(SignalKind::terminate()).expect("failed to install SIGTERM handler");
        tokio::select! {
            _ = ctrl_c => {
                tracing::info!("received SIGINT, beginning shutdown");
            }
            _ = sigterm.recv() => {
                tracing::info!("received SIGTERM, beginning shutdown");
            }
        }
    }

    #[cfg(not(unix))]
    {
        ctrl_c.await.ok();
        tracing::info!("received SIGINT, beginning shutdown");
    }
}

pub async fn drain_with_timeout<F: std::future::Future<Output = ()>>(
    quiesce: F,
    timeout: Duration,
) {
    match tokio::time::timeout(timeout, quiesce).await {
        Ok(()) => {
            tracing::info!("graceful drain completed");
        }
        Err(_) => {
            tracing::warn!(
                timeout_secs = timeout.as_secs(),
                "drain timeout exceeded, proceeding with shutdown"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn drain_completes_immediately_when_quiesce_is_instant() {
        drain_with_timeout(async {}, Duration::from_secs(5)).await;
    }

    #[tokio::test]
    async fn drain_times_out_when_quiesce_never_finishes() {
        let start = tokio::time::Instant::now();
        drain_with_timeout(futures::future::pending(), Duration::from_millis(50)).await;
        let elapsed = start.elapsed();
        assert!(
            elapsed >= Duration::from_millis(50),
            "drain returned before timeout: {elapsed:?}"
        );
        assert!(
            elapsed < Duration::from_millis(200),
            "drain took too long after timeout: {elapsed:?}"
        );
    }
}
