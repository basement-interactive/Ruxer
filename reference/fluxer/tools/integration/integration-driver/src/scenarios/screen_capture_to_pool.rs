// SPDX-License-Identifier: AGPL-3.0-or-later

use fluxer_screen_frame_bus::frame_pool::{CpuFrameBuilder, FramePool};
use serde_json::json;

use super::ScenarioReport;

const FRAME_WIDTH_PX: u32 = 1920;
const FRAME_HEIGHT_PX: u32 = 1080;
const FRAME_BYTES_PER_PIXEL: u32 = 4;
const STEADY_STATE_FRAMES: u32 = 64;

pub fn run(_args: &[&str]) -> Result<ScenarioReport, ScenarioReport> {
    let bytes_per_slot = (FRAME_WIDTH_PX as usize)
        .saturating_mul(FRAME_HEIGHT_PX as usize)
        .saturating_mul(FRAME_BYTES_PER_PIXEL as usize);
    assert!(bytes_per_slot > 0, "bytes per slot positive");
    assert!(
        bytes_per_slot <= 1 << 28,
        "bytes per slot within sanity cap"
    );
    let pool = CpuFrameBuilder::build_pool(bytes_per_slot).map_err(|err| {
        ScenarioReport::fail(
            "screen_capture_to_pool",
            json!({"reason": format!("pool init failed: {err:?}")}),
            Vec::new(),
        )
    })?;
    let measurements = drive_steady_state(&pool);
    let mut assertions = Vec::new();
    if measurements.steady_state_skipped != 0 {
        return Err(ScenarioReport::fail(
            "screen_capture_to_pool",
            serde_json::to_value(&measurements).unwrap_or(json!({})),
            vec![format!(
                "steady state should not skip; observed {} skips",
                measurements.steady_state_skipped
            )],
        ));
    }
    assertions.push("FramePool steady state shows zero skips".to_string());
    if measurements.in_flight_after_release != 0 {
        return Err(ScenarioReport::fail(
            "screen_capture_to_pool",
            serde_json::to_value(&measurements).unwrap_or(json!({})),
            vec![format!(
                "expected in-flight to drop to zero after release; observed {}",
                measurements.in_flight_after_release
            )],
        ));
    }
    assertions.push("PooledFrame Drop returns slot to free list".to_string());
    if measurements.acquired_total_post_run < STEADY_STATE_FRAMES as u64 {
        return Err(ScenarioReport::fail(
            "screen_capture_to_pool",
            serde_json::to_value(&measurements).unwrap_or(json!({})),
            vec!["acquired_total below expected".to_string()],
        ));
    }
    assertions.push("acquired_total matches steady-state frame count".to_string());
    Ok(ScenarioReport::pass(
        "screen_capture_to_pool",
        serde_json::to_value(&measurements).unwrap_or(json!({})),
        assertions,
    ))
}

#[derive(Debug, serde::Serialize)]
struct Measurements {
    pool_capacity: usize,
    steady_state_frames: u32,
    steady_state_skipped: u64,
    acquired_total_post_run: u64,
    in_flight_after_release: u64,
    bytes_per_slot: usize,
}

fn drive_steady_state(pool: &FramePool) -> Measurements {
    let capacity = pool.capacity();
    assert!(capacity > 0, "pool capacity positive");
    let baseline_skipped = pool.skipped_total();
    for _ in 0..STEADY_STATE_FRAMES {
        let pooled = pool
            .try_acquire()
            .expect("steady-state acquire must succeed since prior frame dropped");
        let _ = pooled.slot_index();
    }
    let in_flight = pool.currently_in_flight();
    let skipped = pool.skipped_total().saturating_sub(baseline_skipped);
    Measurements {
        pool_capacity: capacity,
        steady_state_frames: STEADY_STATE_FRAMES,
        steady_state_skipped: skipped,
        acquired_total_post_run: pool.acquired_total(),
        in_flight_after_release: in_flight,
        bytes_per_slot: ((FRAME_WIDTH_PX as usize)
            .saturating_mul(FRAME_HEIGHT_PX as usize)
            .saturating_mul(FRAME_BYTES_PER_PIXEL as usize)),
    }
}
