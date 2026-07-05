// SPDX-License-Identifier: AGPL-3.0-or-later

use anyhow::Result;
use fluxer_content_update_frozen_snapshot::generate_snapshot_source;
use std::env;
use std::path::PathBuf;
use std::process;

fn main() {
    if let Err(err) = run() {
        eprintln!("error: {err:#}");
        process::exit(1);
    }
}

fn run() -> Result<()> {
    let mut args = env::args_os();
    let program = args
        .next()
        .and_then(|value| PathBuf::from(value).file_name().map(|name| name.to_owned()))
        .and_then(|name| name.into_string().ok())
        .unwrap_or_else(|| "fluxer-content-update-frozen-snapshot".to_owned());

    let Some(static_dir) = args.next() else {
        eprintln!("usage: {program} <static_dir>");
        process::exit(1);
    };
    if args.next().is_some() {
        eprintln!("usage: {program} <static_dir>");
        process::exit(1);
    }

    let output = generate_snapshot_source(&PathBuf::from(static_dir))?;
    print!("{output}");
    Ok(())
}
