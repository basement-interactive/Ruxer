// SPDX-License-Identifier: AGPL-3.0-or-later

#[tokio::main]
async fn main() {
    if let Err(error) = fluxer_ci::run().await {
        eprintln!("{error:?}");
        std::process::exit(1);
    }
}
