// SPDX-License-Identifier: AGPL-3.0-or-later

use fluxer_audio_apm::{ApmConfigBuilder, AudioProcessor, StubAudioProcessor};
use fluxer_audio_mix::{AUDIO_OUTPUT_FRAMES, AudioMixSession, SourceRing};
use fluxer_rt_thread::TickInfo;
use serde_json::json;

use super::ScenarioReport;

const TONE_AMPLITUDE: i16 = 8_000;
const TONE_SAMPLE_RATE_HZ: u32 = 48_000;
const TONE_FREQUENCY_HZ: u32 = 440;
const TONE_TICK_COUNT: u64 = 4;
const APM_SAMPLE_RATE_HZ: u32 = 48_000;
const APM_CHANNELS: u16 = 1;
const APM_FRAME_SAMPLES: usize = 480;

pub fn run(_args: &[&str]) -> Result<ScenarioReport, ScenarioReport> {
    assert_eq!(APM_FRAME_SAMPLES, 480, "APM 10 ms @ 48 kHz invariant");
    let measurements = match drive_pipeline() {
        Ok(m) => m,
        Err(reason) => {
            return Err(ScenarioReport::fail(
                "audio_capture_to_mix",
                json!({"reason": reason}),
                Vec::new(),
            ));
        }
    };
    let mut assertions = Vec::new();
    if measurements.tone_mix_peak < (TONE_AMPLITUDE as i64) / 4 {
        return Err(ScenarioReport::fail(
            "audio_capture_to_mix",
            serde_json::to_value(&measurements).unwrap_or(json!({})),
            vec!["tone peak below quarter-amplitude floor".to_string()],
        ));
    }
    assertions.push("tone present in mix output above quarter-amplitude floor".to_string());
    if measurements.apm_capture_frames_processed == 0 {
        return Err(ScenarioReport::fail(
            "audio_capture_to_mix",
            serde_json::to_value(&measurements).unwrap_or(json!({})),
            vec!["APM processed zero capture frames".to_string()],
        ));
    }
    assertions.push("APM processed at least one capture frame".to_string());
    if measurements.mix_ticks_completed != TONE_TICK_COUNT {
        return Err(ScenarioReport::fail(
            "audio_capture_to_mix",
            serde_json::to_value(&measurements).unwrap_or(json!({})),
            vec![format!(
                "expected {} mix ticks, observed {}",
                TONE_TICK_COUNT, measurements.mix_ticks_completed
            )],
        ));
    }
    assertions.push("mix session completed the full tick schedule".to_string());
    Ok(ScenarioReport::pass(
        "audio_capture_to_mix",
        serde_json::to_value(&measurements).unwrap_or(json!({})),
        assertions,
    ))
}

#[derive(Debug, serde::Serialize)]
struct Measurements {
    tone_mix_peak: i64,
    tone_mix_rms: i64,
    mix_ticks_completed: u64,
    apm_capture_frames_processed: u64,
    source_ring_pushed_total: u64,
    source_ring_drained_total: u64,
    sample_rate_hz: u32,
    tone_frequency_hz: u32,
}

fn drive_pipeline() -> Result<Measurements, String> {
    let (mut producer, consumer) = SourceRing::create(8192, TONE_SAMPLE_RATE_HZ)
        .map_err(|err| format!("ring create failed: {err:?}"))?;
    let pushed_per_tick = AUDIO_OUTPUT_FRAMES;
    let mut phase: u32 = 0;
    let mut apm_buffer: Vec<i16> = vec![0i16; APM_FRAME_SAMPLES];
    let apm_config = ApmConfigBuilder::new()
        .aec(false)
        .ns(false)
        .agc(false)
        .build();
    let mut apm = StubAudioProcessor::new(apm_config, APM_SAMPLE_RATE_HZ, APM_CHANNELS)
        .map_err(|err| format!("apm init failed: {err:?}"))?;
    let mut source_ring_pushed_total: u64 = 0;
    for _ in 0..TONE_TICK_COUNT {
        let tone = generate_tone_chunk(pushed_per_tick, &mut phase);
        assert_eq!(tone.len(), pushed_per_tick, "tone chunk length");
        let mut apm_offset: usize = 0;
        while apm_offset + APM_FRAME_SAMPLES <= tone.len() {
            apm_buffer.copy_from_slice(&tone[apm_offset..apm_offset + APM_FRAME_SAMPLES]);
            let _ = apm
                .process_capture_frame(&mut apm_buffer, APM_SAMPLE_RATE_HZ, APM_CHANNELS)
                .map_err(|err| format!("apm process failed: {err:?}"))?;
            apm_offset += APM_FRAME_SAMPLES;
        }
        let pushed = producer.try_push_slice(&tone);
        assert_eq!(pushed, tone.len(), "ring must accept full tone chunk");
        source_ring_pushed_total = source_ring_pushed_total.saturating_add(pushed as u64);
    }
    let mut session = AudioMixSession::new(vec![consumer], AUDIO_OUTPUT_FRAMES)
        .map_err(|err| format!("mix init failed: {err:?}"))?;
    let mut peak_observed: i64 = 0;
    let mut accumulator_sq: u64 = 0;
    let mut counted: u64 = 0;
    for tick_index in 0..TONE_TICK_COUNT {
        let tick = synthetic_tick(tick_index);
        let _ = session.tick(tick);
        let output = session.last_output();
        for sample in output.iter() {
            let abs = (*sample as i64).abs();
            if abs > peak_observed {
                peak_observed = abs;
            }
            let sq = (*sample as i64).saturating_mul(*sample as i64);
            accumulator_sq = accumulator_sq.saturating_add(sq as u64);
            counted = counted.saturating_add(1);
        }
    }
    let rms = accumulator_sq.checked_div(counted).unwrap_or(0).isqrt() as i64;
    Ok(Measurements {
        tone_mix_peak: peak_observed,
        tone_mix_rms: rms,
        mix_ticks_completed: session.ticks_completed(),
        apm_capture_frames_processed: apm.capture_frames_processed(),
        source_ring_pushed_total,
        source_ring_drained_total: 0,
        sample_rate_hz: TONE_SAMPLE_RATE_HZ,
        tone_frequency_hz: TONE_FREQUENCY_HZ,
    })
}

fn generate_tone_chunk(samples: usize, phase: &mut u32) -> Vec<i16> {
    assert!(samples > 0, "tone chunk samples positive");
    assert!(samples <= 1 << 14, "tone chunk within sanity cap");
    let mut out = Vec::with_capacity(samples);
    let period_samples = TONE_SAMPLE_RATE_HZ / TONE_FREQUENCY_HZ;
    assert!(period_samples > 0, "period must be positive");
    for _ in 0..samples {
        let progress = (*phase as f32) / (period_samples as f32);
        let radians = progress * std::f32::consts::TAU;
        let value = (radians.sin() * TONE_AMPLITUDE as f32) as i16;
        out.push(value);
        *phase = phase.wrapping_add(1);
        if *phase >= period_samples {
            *phase = 0;
        }
    }
    assert_eq!(out.len(), samples, "tone chunk length post-condition");
    out
}

fn synthetic_tick(index: u64) -> TickInfo {
    let scheduled_ns = index.saturating_mul(21_333_333);
    TickInfo {
        tick_index: index,
        scheduled_ns,
        actual_ns: scheduled_ns,
        lag_ns: 0,
    }
}
