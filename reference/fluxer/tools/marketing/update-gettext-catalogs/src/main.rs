// SPDX-License-Identifier: AGPL-3.0-or-later

use anyhow::Result;
use fluxer_marketing_update_gettext_catalogs::{find_marketing_root, update_catalogs};
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
        .unwrap_or_else(|| "fluxer-marketing-update-gettext-catalogs".to_owned());

    let root = match (args.next(), args.next()) {
        (None, None) => find_marketing_root(&env::current_dir()?)?,
        (Some(root), None) => PathBuf::from(root),
        _ => {
            eprintln!("usage: {program} [marketing_root]");
            process::exit(1);
        }
    };

    update_catalogs(&root)
}
