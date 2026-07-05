// SPDX-License-Identifier: AGPL-3.0-or-later

use serde_json::json;
use std::fmt;
use std::panic::{AssertUnwindSafe, catch_unwind};

use super::ScenarioReport;

const VALID_SAMPLE_RATE_HZ: u32 = 48_000;
const INVALID_SAMPLE_RATE_HZ: u32 = 44_100;
const VALID_CHANNELS: u32 = 1;
const VALID_FRAME_BYTES: u32 = 960;
const VALID_TIMESTAMP_NS: u64 = 1_000_000;
const AUDIO_FRAME_BYTES_MAX: u32 = 1 << 20;
const AUDIO_SAMPLE_RATES_HZ: [u32; 3] = [16_000, 32_000, 48_000];
const AUDIO_CHANNELS_VALID: [u32; 2] = [1, 2];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct VoiceEngineV2AudioFrameInvariants {
    sample_rate_hz: u32,
    num_channels: u32,
    frame_bytes: u32,
    timestamp_ns: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum VoiceEngineV2AssertError {
    FrameBytesOutOfRange { bytes: u32, max: u32 },
    SampleRateInvalid { hz: u32 },
    ChannelsInvalid { channels: u32 },
    TimestampRegressed { previous_ns: u64, received_ns: u64 },
}

impl fmt::Display for VoiceEngineV2AssertError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::FrameBytesOutOfRange { bytes, max } => {
                write!(
                    formatter,
                    "AudioFrameBytesOutOfRange: audio frame bytes {bytes} not in (0, {max}]"
                )
            }
            Self::SampleRateInvalid { hz } => {
                write!(
                    formatter,
                    "AudioSampleRateInvalid: audio sample rate {hz} not in [16000, 32000, 48000]"
                )
            }
            Self::ChannelsInvalid { channels } => {
                write!(
                    formatter,
                    "AudioChannelsInvalid: audio channels {channels} not in [1, 2]"
                )
            }
            Self::TimestampRegressed {
                previous_ns,
                received_ns,
            } => {
                write!(
                    formatter,
                    "AudioTimestampRegressed: audio timestamp {received_ns} did not exceed previous {previous_ns}"
                )
            }
        }
    }
}

fn check_audio_frame_invariants(
    frame: VoiceEngineV2AudioFrameInvariants,
    previous_timestamp_ns: Option<u64>,
) -> Result<(), VoiceEngineV2AssertError> {
    if frame.frame_bytes == 0 || frame.frame_bytes > AUDIO_FRAME_BYTES_MAX {
        return Err(VoiceEngineV2AssertError::FrameBytesOutOfRange {
            bytes: frame.frame_bytes,
            max: AUDIO_FRAME_BYTES_MAX,
        });
    }
    if !AUDIO_SAMPLE_RATES_HZ.contains(&frame.sample_rate_hz) {
        return Err(VoiceEngineV2AssertError::SampleRateInvalid {
            hz: frame.sample_rate_hz,
        });
    }
    if !AUDIO_CHANNELS_VALID.contains(&frame.num_channels) {
        return Err(VoiceEngineV2AssertError::ChannelsInvalid {
            channels: frame.num_channels,
        });
    }
    if let Some(previous_ns) = previous_timestamp_ns
        && frame.timestamp_ns <= previous_ns
    {
        return Err(VoiceEngineV2AssertError::TimestampRegressed {
            previous_ns,
            received_ns: frame.timestamp_ns,
        });
    }
    Ok(())
}

#[allow(clippy::panic)]
fn assert_audio_frame_invariants(
    frame: VoiceEngineV2AudioFrameInvariants,
    previous_timestamp_ns: Option<u64>,
) {
    let result = check_audio_frame_invariants(frame, previous_timestamp_ns);
    if let Err(err) = result {
        panic!("{err}");
    }
}

pub fn run(args: &[&str]) -> Result<ScenarioReport, ScenarioReport> {
    let prior_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_info| {}));
    let result = run_inner(args);
    std::panic::set_hook(prior_hook);
    result
}

fn run_inner(args: &[&str]) -> Result<ScenarioReport, ScenarioReport> {
    let mode = args.first().copied().unwrap_or("invalid-sample-rate");
    let measurements = match mode {
        "invalid-sample-rate" => exercise_invalid_sample_rate(),
        "valid-baseline" => exercise_valid_baseline(),
        other => {
            return Err(ScenarioReport::fail(
                "ffi_airlock_negative",
                json!({"reason": format!("unknown mode: {other}")}),
                Vec::new(),
            ));
        }
    };
    match measurements {
        Ok(m) => Ok(ScenarioReport::pass(
            "ffi_airlock_negative",
            serde_json::to_value(&m).unwrap_or(json!({})),
            m.assertions,
        )),
        Err(report) => Err(report),
    }
}

#[derive(Debug, serde::Serialize)]
struct Measurements {
    mode: &'static str,
    panic_observed: bool,
    panic_message: Option<String>,
    valid_baseline_passed: bool,
    #[serde(skip_serializing)]
    assertions: Vec<String>,
}

fn exercise_invalid_sample_rate() -> Result<Measurements, ScenarioReport> {
    let frame = VoiceEngineV2AudioFrameInvariants {
        sample_rate_hz: INVALID_SAMPLE_RATE_HZ,
        num_channels: VALID_CHANNELS,
        frame_bytes: VALID_FRAME_BYTES,
        timestamp_ns: VALID_TIMESTAMP_NS,
    };
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        assert_audio_frame_invariants(frame, None);
    }));
    match outcome {
        Ok(()) => Err(ScenarioReport::fail(
            "ffi_airlock_negative",
            json!({"mode": "invalid-sample-rate", "panic_observed": false}),
            vec!["receive-side assertion failed to panic on invalid sample rate".to_string()],
        )),
        Err(payload) => {
            let message = panic_payload_to_string(&payload);
            if !message.contains("AudioSampleRateInvalid")
                && !message.contains("not in [16000, 32000, 48000]")
            {
                return Err(ScenarioReport::fail(
                    "ffi_airlock_negative",
                    json!({"mode": "invalid-sample-rate", "panic_observed": true, "panic_message": message}),
                    vec!["panic message did not mention AudioSampleRateInvalid".to_string()],
                ));
            }
            let assertions = vec![
                "receive-side assertion panicked as expected".to_string(),
                "panic message names AudioSampleRateInvalid".to_string(),
            ];
            Ok(Measurements {
                mode: "invalid-sample-rate",
                panic_observed: true,
                panic_message: Some(message),
                valid_baseline_passed: false,
                assertions,
            })
        }
    }
}

fn exercise_valid_baseline() -> Result<Measurements, ScenarioReport> {
    let frame = VoiceEngineV2AudioFrameInvariants {
        sample_rate_hz: VALID_SAMPLE_RATE_HZ,
        num_channels: VALID_CHANNELS,
        frame_bytes: VALID_FRAME_BYTES,
        timestamp_ns: VALID_TIMESTAMP_NS,
    };
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        assert_audio_frame_invariants(frame, None);
    }));
    match outcome {
        Ok(()) => {
            let assertions = vec!["valid-frame baseline did not panic".to_string()];
            Ok(Measurements {
                mode: "valid-baseline",
                panic_observed: false,
                panic_message: None,
                valid_baseline_passed: true,
                assertions,
            })
        }
        Err(payload) => Err(ScenarioReport::fail(
            "ffi_airlock_negative",
            json!({
                "mode": "valid-baseline",
                "panic_observed": true,
                "panic_message": panic_payload_to_string(&payload),
            }),
            vec!["valid baseline frame must not panic".to_string()],
        )),
    }
}

fn panic_payload_to_string(payload: &Box<dyn std::any::Any + Send>) -> String {
    if let Some(s) = payload.downcast_ref::<&'static str>() {
        return (*s).to_string();
    }
    if let Some(s) = payload.downcast_ref::<String>() {
        return s.clone();
    }
    "<non-string panic payload>".to_string()
}
