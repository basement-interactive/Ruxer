// SPDX-License-Identifier: AGPL-3.0-or-later

#![deny(warnings)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::panic)]
#![deny(clippy::too_many_lines)]

mod scenarios;

use std::process::ExitCode;

const USAGE: &str = "usage: integration-driver <scenario> [args...]\n\
                     scenarios:\n  \
                     audio-capture-to-mix\n  \
                     screen-capture-to-pool\n  \
                     gpu-device-loss-recovery\n  \
                     encoder-handoff-dryrun\n  \
                     ffi-airlock-negative [invalid-sample-rate|valid-baseline]\n";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    assert!(!args.is_empty(), "argv must contain program name");
    if args.len() < 2 {
        eprintln!("{}", USAGE);
        return ExitCode::from(64);
    }
    let scenario = args[1].as_str();
    let tail: Vec<&str> = args[2..].iter().map(String::as_str).collect();
    let result = match scenario {
        "audio-capture-to-mix" => scenarios::audio_capture_to_mix::run(&tail),
        "screen-capture-to-pool" => scenarios::screen_capture_to_pool::run(&tail),
        "gpu-device-loss-recovery" => scenarios::gpu_device_loss_recovery::run(&tail),
        "encoder-handoff-dryrun" => scenarios::encoder_handoff_dryrun::run(&tail),
        "ffi-airlock-negative" => scenarios::ffi_airlock_negative::run(&tail),
        other => {
            eprintln!("unknown scenario {other}\n{USAGE}");
            return ExitCode::from(64);
        }
    };
    match result {
        Ok(report) => {
            println!("{}", report);
            ExitCode::SUCCESS
        }
        Err(report) => {
            println!("{}", report);
            ExitCode::from(1)
        }
    }
}
