// SPDX-License-Identifier: AGPL-3.0-or-later

pub mod audio_capture_to_mix;
pub mod encoder_handoff_dryrun;
pub mod ffi_airlock_negative;
pub mod gpu_device_loss_recovery;
pub mod screen_capture_to_pool;

use serde::Serialize;

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Serialize)]
pub struct ScenarioReport {
    pub schema: u32,
    pub scenario: &'static str,
    pub platform: &'static str,
    pub status: &'static str,
    pub measurements: serde_json::Value,
    pub assertions: Vec<String>,
}

impl ScenarioReport {
    pub fn pass(
        scenario: &'static str,
        measurements: serde_json::Value,
        assertions: Vec<String>,
    ) -> Self {
        let report = Self {
            schema: SCHEMA_VERSION,
            scenario,
            platform: current_platform(),
            status: "pass",
            measurements,
            assertions,
        };
        assert_eq!(report.status, "pass", "pass constructor status invariant");
        assert_eq!(report.schema, SCHEMA_VERSION, "schema version stable");
        report
    }

    pub fn fail(
        scenario: &'static str,
        measurements: serde_json::Value,
        assertions: Vec<String>,
    ) -> Self {
        let report = Self {
            schema: SCHEMA_VERSION,
            scenario,
            platform: current_platform(),
            status: "fail",
            measurements,
            assertions,
        };
        assert_eq!(report.status, "fail", "fail constructor status invariant");
        assert_eq!(report.schema, SCHEMA_VERSION, "schema version stable");
        report
    }
}

impl std::fmt::Display for ScenarioReport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let serialised = serde_json::to_string(self).map_err(|_| std::fmt::Error)?;
        f.write_str(&serialised)
    }
}

pub const fn current_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "unknown"
    }
}
