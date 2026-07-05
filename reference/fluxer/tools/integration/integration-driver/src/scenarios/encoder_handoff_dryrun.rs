// SPDX-License-Identifier: AGPL-3.0-or-later

use fluxer_encoder_ring::{
    CpuMemcpyBackend, EncoderInputRing, RingError, TextureFormat, apply_dts_offset,
    compute_dts_offset_us,
};
use serde_json::json;

use super::ScenarioReport;

const FRAME_WIDTH_PX: u32 = 1280;
const FRAME_HEIGHT_PX: u32 = 720;
const RING_DEPTH_TARGET: u32 = 8;
const LAG_OVERSUBSCRIBE_COUNT: u32 = 4;
const FRAME_INTERVAL_US: u64 = 16_666;
const NUM_B_FRAMES: u32 = 2;
const FIRST_PTS_US: u64 = 0;

pub fn run(_args: &[&str]) -> Result<ScenarioReport, ScenarioReport> {
    let measurements = match drive_ring() {
        Ok(m) => m,
        Err(reason) => {
            return Err(ScenarioReport::fail(
                "encoder_handoff_dryrun",
                json!({"reason": reason}),
                Vec::new(),
            ));
        }
    };
    let mut assertions = Vec::new();
    if measurements.completed_count != RING_DEPTH_TARGET as u64 {
        return Err(ScenarioReport::fail(
            "encoder_handoff_dryrun",
            serde_json::to_value(&measurements).unwrap_or(json!({})),
            vec![format!(
                "expected {} completed slots, observed {}",
                RING_DEPTH_TARGET, measurements.completed_count
            )],
        ));
    }
    assertions.push("eight slots submitted and completed".to_string());
    if measurements.dropped_count != LAG_OVERSUBSCRIBE_COUNT as u64 {
        return Err(ScenarioReport::fail(
            "encoder_handoff_dryrun",
            serde_json::to_value(&measurements).unwrap_or(json!({})),
            vec![format!(
                "expected {} dropped under oversubscription, observed {}",
                LAG_OVERSUBSCRIBE_COUNT, measurements.dropped_count
            )],
        ));
    }
    assertions.push("oversubscribed submits report skip-don't-block drop counter".to_string());
    if measurements.dispatched_count != RING_DEPTH_TARGET as u64 {
        return Err(ScenarioReport::fail(
            "encoder_handoff_dryrun",
            serde_json::to_value(&measurements).unwrap_or(json!({})),
            vec![format!(
                "expected {} dispatched ready frames, observed {}",
                RING_DEPTH_TARGET, measurements.dispatched_count
            )],
        ));
    }
    assertions.push("dispatched_count equals submitted_count in steady state".to_string());
    if measurements.dts_first_frame > measurements.pts_first_frame {
        return Err(ScenarioReport::fail(
            "encoder_handoff_dryrun",
            serde_json::to_value(&measurements).unwrap_or(json!({})),
            vec!["first DTS must not exceed PTS".to_string()],
        ));
    }
    assertions.push("DTS offset is non-positive given B-frames".to_string());
    Ok(ScenarioReport::pass(
        "encoder_handoff_dryrun",
        serde_json::to_value(&measurements).unwrap_or(json!({})),
        assertions,
    ))
}

#[derive(Debug, serde::Serialize)]
struct Measurements {
    backend: &'static str,
    submitted_count: u64,
    completed_count: u64,
    dispatched_count: u64,
    dropped_count: u64,
    capacity: usize,
    pts_first_frame: u64,
    dts_first_frame: u64,
    dts_offset_us: i64,
    texture_skipped_frames: u32,
}

fn drive_ring() -> Result<Measurements, String> {
    let backend = CpuMemcpyBackend::new();
    let mut ring: EncoderInputRing<CpuMemcpyBackend> = EncoderInputRing::new(backend);
    ring.initialise(FRAME_WIDTH_PX, FRAME_HEIGHT_PX, TextureFormat::Nv12)
        .map_err(|err| format!("ring init failed: {err:?}"))?;
    assert_eq!(
        ring.capacity(),
        RING_DEPTH_TARGET as usize,
        "ring capacity invariant"
    );
    assert_eq!(
        ring.free_count(),
        RING_DEPTH_TARGET as usize,
        "fresh ring fully free"
    );
    for _ in 0..RING_DEPTH_TARGET {
        ring.submit(noop_fill)
            .map_err(|err| format!("first round submit failed: {err:?}"))?;
    }
    let mut texture_skipped_frames: u32 = 0;
    for _ in 0..LAG_OVERSUBSCRIBE_COUNT {
        match ring.submit(noop_fill) {
            Err(RingError::FullDropped { .. }) => {
                texture_skipped_frames = texture_skipped_frames.saturating_add(1);
            }
            Err(err) => return Err(format!("unexpected submit error: {err:?}")),
            Ok(()) => return Err("oversubscribed submit must drop".to_string()),
        }
    }
    let dts_offset_us = compute_dts_offset_us(FIRST_PTS_US, NUM_B_FRAMES, FRAME_INTERVAL_US);
    assert!(dts_offset_us <= 0, "dts offset non-positive");
    let pts_first_frame = FRAME_INTERVAL_US.saturating_mul(NUM_B_FRAMES as u64);
    let dts_first_frame = apply_dts_offset(pts_first_frame, dts_offset_us);
    let mut released_sequences: Vec<u64> = Vec::with_capacity(RING_DEPTH_TARGET as usize);
    while let Some(ready) = ring.poll_next_ready() {
        released_sequences.push(ready.sequence);
        ring.release_completed(ready)
            .map_err(|err| format!("release failed: {err:?}"))?;
    }
    assert_eq!(
        released_sequences.len(),
        RING_DEPTH_TARGET as usize,
        "expected all submitted frames to drain"
    );
    for (idx, seq) in released_sequences.iter().enumerate() {
        let expected = (idx + 1) as u64;
        assert_eq!(*seq, expected, "FIFO release order");
    }
    let metrics = ring.metrics();
    Ok(Measurements {
        backend: backend_label(),
        submitted_count: metrics.submitted_count,
        completed_count: metrics.completed_count,
        dispatched_count: metrics.dispatched_count,
        dropped_count: metrics.dropped_count,
        capacity: ring.capacity(),
        pts_first_frame,
        dts_first_frame,
        dts_offset_us,
        texture_skipped_frames,
    })
}

#[cfg(target_os = "windows")]
const fn backend_label() -> &'static str {
    "cpu_memcpy_with_d3d11_keyed_mutex_available"
}

#[cfg(not(target_os = "windows"))]
const fn backend_label() -> &'static str {
    "cpu_memcpy_backend"
}

fn noop_fill(_slot: &mut fluxer_encoder_ring::CpuSlotHandle) {}
