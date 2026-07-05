// SPDX-License-Identifier: AGPL-3.0-or-later

use fluxer_gpu_rebuild::{GpuLossCallback, GpuLossRegistry};
use fluxer_nv12_gpu_pack::Nv12Packer;
use fluxer_screen_frame_bus::gpu_loss::{
    WgpuStagingBackend, WgpuStagingConfig, try_acquire_device,
};
use serde_json::json;

use super::ScenarioReport;

const PACKER_MAX_WIDTH: u32 = 1280;
const PACKER_MAX_HEIGHT: u32 = 720;
const STAGING_BYTE_LEN: u64 = 64 * 1024;

pub fn run(_args: &[&str]) -> Result<ScenarioReport, ScenarioReport> {
    let (device, queue, _instance) = acquire_gpu_context()?;
    let measurements = drive_rebuild(&device, &queue).map_err(|reason| {
        ScenarioReport::fail(
            "gpu_device_loss_recovery",
            json!({"reason": reason}),
            Vec::new(),
        )
    })?;
    let assertions = check_measurements(&measurements)?;
    Ok(ScenarioReport::pass(
        "gpu_device_loss_recovery",
        serde_json::to_value(&measurements).unwrap_or(json!({})),
        assertions,
    ))
}

fn acquire_gpu_context() -> Result<(wgpu::Device, wgpu::Queue, wgpu::Instance), ScenarioReport> {
    let acquired = std::panic::catch_unwind(std::panic::AssertUnwindSafe(try_acquire_device));
    match acquired {
        Ok(Some(triple)) => Ok(triple),
        Ok(None) => Err(ScenarioReport::fail(
            "gpu_device_loss_recovery",
            json!({"reason": "no wgpu adapter available"}),
            Vec::new(),
        )),
        Err(_) => Err(ScenarioReport::fail(
            "gpu_device_loss_recovery",
            json!({"reason": "wgpu adapter acquisition panicked"}),
            Vec::new(),
        )),
    }
}

fn check_measurements(measurements: &Measurements) -> Result<Vec<String>, ScenarioReport> {
    if measurements.released_count != 2 {
        return Err(fail_with(
            measurements,
            format!(
                "expected 2 release calls, observed {}",
                measurements.released_count
            ),
        ));
    }
    if measurements.rebuilt_count != 2 {
        return Err(fail_with(
            measurements,
            format!(
                "expected 2 rebuilt owners, observed {}",
                measurements.rebuilt_count
            ),
        ));
    }
    if measurements.failed_count != 0 {
        return Err(fail_with(
            measurements,
            format!(
                "expected 0 failures, observed {}",
                measurements.failed_count
            ),
        ));
    }
    if !measurements.packer_ready_after_rebuild {
        return Err(fail_with(
            measurements,
            "Nv12Packer not ready after rebuild".to_string(),
        ));
    }
    if !measurements.staging_ready_after_rebuild {
        return Err(fail_with(
            measurements,
            "WgpuStagingBackend not ready after rebuild".to_string(),
        ));
    }
    Ok(vec![
        "registry released both owners".to_string(),
        "registry rebuilt both owners".to_string(),
        "zero failures during rebuild walk".to_string(),
        "Nv12Packer reports is_ready true after rebuild".to_string(),
        "WgpuStagingBackend reports is_ready true after rebuild".to_string(),
    ])
}

fn fail_with(measurements: &Measurements, message: String) -> ScenarioReport {
    ScenarioReport::fail(
        "gpu_device_loss_recovery",
        serde_json::to_value(measurements).unwrap_or(json!({})),
        vec![message],
    )
}

#[derive(Debug, serde::Serialize)]
struct Measurements {
    released_count: u32,
    rebuilt_count: u32,
    failed_count: u32,
    vacant_count: u32,
    packer_ready_after_rebuild: bool,
    staging_ready_after_rebuild: bool,
    adapter_info: String,
}

fn drive_rebuild(device: &wgpu::Device, queue: &wgpu::Queue) -> Result<Measurements, String> {
    let registry = GpuLossRegistry::new();
    let packer = Box::new(Nv12Packer::new(device, PACKER_MAX_WIDTH, PACKER_MAX_HEIGHT));
    let staging = Box::new(WgpuStagingBackend::new(
        device,
        WgpuStagingConfig::new(STAGING_BYTE_LEN),
    ));
    let packer_built_before = GpuLossCallback::is_ready(packer.as_ref());
    let staging_built_before = GpuLossCallback::is_ready(staging.as_ref());
    assert!(packer_built_before, "packer must be ready before rebuild");
    assert!(staging_built_before, "staging must be ready before rebuild");
    let _packer_guard = registry.register(packer);
    let _staging_guard = registry.register(staging);
    let report = registry.handle_device_lost(device, queue);
    assert!(
        report.released_count as usize <= 2,
        "no more than two owners released"
    );
    let mut packer_ready = false;
    let mut staging_ready = false;
    for outcome in report.outcomes.iter() {
        match outcome {
            fluxer_gpu_rebuild::RebuildOutcome::Rebuilt { label, .. } => {
                if label.contains("nv12") {
                    packer_ready = true;
                }
                if label.contains("staging") {
                    staging_ready = true;
                }
            }
            fluxer_gpu_rebuild::RebuildOutcome::Failed { .. } => {
                return Err("rebuild outcome reported failure".to_string());
            }
            fluxer_gpu_rebuild::RebuildOutcome::Vacant { .. } => {}
        }
    }
    Ok(Measurements {
        released_count: report.released_count,
        rebuilt_count: report.rebuilt_count,
        failed_count: report.failed_count,
        vacant_count: report.vacant_count,
        packer_ready_after_rebuild: packer_ready,
        staging_ready_after_rebuild: staging_ready,
        adapter_info: format!("{:?}", device.limits().max_texture_dimension_2d),
    })
}
