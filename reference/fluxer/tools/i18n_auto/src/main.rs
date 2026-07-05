// SPDX-License-Identifier: AGPL-3.0-or-later

use std::process::ExitCode;

fn main() -> ExitCode {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    match fluxer_i18n_auto::auto::auto_main(&args) {
        Ok(code) => ExitCode::from(code),
        Err(error) => {
            eprintln!("{error:#}");
            ExitCode::from(1)
        }
    }
}
