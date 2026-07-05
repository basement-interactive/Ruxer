// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::desktop::build_desktop;
use crate::proc::{RunOptions, run_command};
use anyhow::Result;
use std::env;
use std::path::Path;

const DEFAULT_TEST_WORKSPACE_CONCURRENCY: &str = "2";
const DEFAULT_API_TEST_WORKERS: &str = "2";

fn task_run(args: &[&str]) -> Result<()> {
    run_command(
        args,
        RunOptions {
            load_default_env: false,
            ..RunOptions::default()
        },
    )
    .map(drop)
}

fn test_env() -> Vec<(String, Option<String>)> {
    let nats_url = env::var("FLUXER_NATS_URL").unwrap_or_else(|_| default_test_nats_url());
    let api_workers =
        env::var("API_TEST_MAX_WORKERS").unwrap_or_else(|_| DEFAULT_API_TEST_WORKERS.to_owned());
    vec![
        ("FLUXER_NATS_URL".to_owned(), Some(nats_url.clone())),
        (
            "FLUXER_NATS_CORE_URL".to_owned(),
            Some(env::var("FLUXER_NATS_CORE_URL").unwrap_or_else(|_| nats_url.clone())),
        ),
        (
            "FLUXER_NATS_JETSTREAM_URL".to_owned(),
            Some(env::var("FLUXER_NATS_JETSTREAM_URL").unwrap_or_else(|_| nats_url.clone())),
        ),
        ("API_TEST_MAX_WORKERS".to_owned(), Some(api_workers.clone())),
        (
            "API_TEST_MAX_CONCURRENCY".to_owned(),
            Some(env::var("API_TEST_MAX_CONCURRENCY").unwrap_or(api_workers)),
        ),
    ]
}

fn default_test_nats_url() -> String {
    let host = if Path::new("/.dockerenv").exists() {
        "nats"
    } else {
        "127.0.0.1"
    };
    format!("nats://{host}:4222")
}

fn run_generators(for_typecheck: bool) -> Result<()> {
    task_run(&["pnpm", "--filter", "@fluxer/config", "generate"])?;
    task_run(&["pnpm", "--filter", "@fluxer/schema", "generate"])?;
    if for_typecheck {
        task_run(&["pnpm", "--filter", "@fluxer/i18n", "generate:types"])?;
    }
    task_run(&["pnpm", "--filter", "fluxer_app", "i18n:compile"])
}

pub fn run_typecheck() -> Result<i32> {
    run_generators(true)?;
    task_run(&["pnpm", "-r", "--if-present", "typecheck"])?;
    Ok(0)
}

pub fn run_test() -> Result<i32> {
    run_generators(false)?;
    let workspace_concurrency = env::var("PNPM_TEST_WORKSPACE_CONCURRENCY")
        .unwrap_or_else(|_| DEFAULT_TEST_WORKSPACE_CONCURRENCY.to_owned());
    let env = test_env();
    run_command(
        &[
            "pnpm",
            "-r",
            &format!("--workspace-concurrency={workspace_concurrency}"),
            "--filter",
            "!fluxer_api",
            "--filter",
            "!fluxer",
            "--if-present",
            "test",
        ],
        RunOptions {
            env: env.clone(),
            load_default_env: false,
            ..RunOptions::default()
        },
    )?;
    run_command(
        &["pnpm", "--filter", "fluxer_api", "test"],
        RunOptions {
            env,
            load_default_env: false,
            ..RunOptions::default()
        },
    )?;
    Ok(0)
}

pub fn run_build() -> Result<i32> {
    run_generators(false)?;
    task_run(&["pnpm", "--filter", "fluxer_app", "build"])?;
    build_desktop(false)?;
    Ok(0)
}

pub fn run_knip() -> Result<i32> {
    task_run(&["pnpm", "--filter", "fluxer_app", "i18n:compile"])?;
    task_run(&["pnpm", "exec", "knip"])?;
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_nats_url_switches_inside_container() {
        let expected_host = if Path::new("/.dockerenv").exists() {
            "nats"
        } else {
            "127.0.0.1"
        };
        assert_eq!(
            default_test_nats_url(),
            format!("nats://{expected_host}:4222")
        );
    }
}
