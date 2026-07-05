// SPDX-License-Identifier: AGPL-3.0-or-later

//! Non-Linux stub for the Linux screen-capture surface.
//!
//! The real backend (PipeWire + xdg-desktop-portal) only exists on Linux. On
//! other targets the crate still compiles as an `rlib` so it can be a workspace
//! member; every entry point reports "unsupported platform".

const UNSUPPORTED: &str = "fluxer_linux_screen_capture is only supported on Linux";
const BACKEND: &str = "linux-pipewire-portal";

#[derive(Clone, Debug)]
pub struct LinuxScreenCaptureSource {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub app_name: Option<String>,
    pub bundle_id: Option<String>,
    pub target_pid: Option<u32>,
}

#[derive(Clone, Debug)]
pub struct Capabilities {
    pub process: bool,
    pub system: bool,
}

#[derive(Clone, Debug)]
pub struct Availability {
    pub available: bool,
    pub backend: String,
    pub reason: Option<String>,
    pub detail: Option<String>,
    pub portal_version: Option<u32>,
    pub capabilities: Capabilities,
}

#[derive(Clone, Debug)]
pub struct BackendInfo {
    pub backend: String,
    pub supported: bool,
    pub reason: String,
    pub portal_version: Option<u32>,
    pub pipewire_reachable: bool,
}

#[derive(Clone, Debug)]
pub struct ScreenCaptureStartResult {
    pub width: u32,
    pub height: u32,
    pub frame_rate: u32,
    pub pixel_format: String,
}

#[derive(Clone, Copy, Debug)]
pub struct ScreenCaptureRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Default)]
pub struct ScreenCaptureStartOptions {
    pub show_cursor_clicks: Option<bool>,
    pub capture_rect: Option<ScreenCaptureRect>,
    pub color_range: Option<String>,
    pub color_space: Option<String>,
}

#[derive(Clone, Debug)]
pub struct FrameSinkDiagnostics {
    pub accepted: f64,
    pub coalesced: f64,
    pub rejected: f64,
    pub media_frames_dropped_without_sink: f64,
}

#[derive(Clone, Debug, Default)]
pub struct ScreenCaptureDiagnostics {
    pub backend: Option<String>,
    pub active_strategy: Option<String>,
}

pub fn get_backend_info() -> BackendInfo {
    BackendInfo {
        backend: BACKEND.to_string(),
        supported: false,
        reason: UNSUPPORTED.to_string(),
        portal_version: None,
        pipewire_reachable: false,
    }
}

pub fn get_availability() -> Availability {
    Availability {
        available: false,
        backend: BACKEND.to_string(),
        reason: Some("unsupported-platform".to_string()),
        detail: None,
        portal_version: None,
        capabilities: Capabilities {
            process: false,
            system: false,
        },
    }
}

pub fn list_sources() -> Result<Vec<LinuxScreenCaptureSource>, String> {
    Ok(Vec::new())
}

pub struct ScreenCapture {
    _private: (),
}

impl ScreenCapture {
    /// Constructing a capture session is unsupported off Linux.
    pub fn new() -> Result<Self, String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn set_lifecycle_callback<F>(&self, _callback: F)
    where
        F: Fn(String, String) + Send + Sync + 'static,
    {
    }

    pub fn set_frame_sink_handle(
        &self,
        _sink: std::sync::Arc<fluxer_screen_frame_bus::NativeScreenFrameSinkHandleRef>,
    ) {
    }

    pub fn start(
        &self,
        _source_id: String,
        _source_kind: String,
        _width: u32,
        _height: u32,
        _frame_rate: u32,
        _capture_id: Option<String>,
        _capture_options: Option<ScreenCaptureStartOptions>,
    ) -> Result<ScreenCaptureStartResult, String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn stop(&self) -> Result<(), String> {
        Ok(())
    }

    pub fn get_diagnostics(&self) -> Option<ScreenCaptureDiagnostics> {
        None
    }

    pub fn get_frame_sink_diagnostics(&self) -> FrameSinkDiagnostics {
        FrameSinkDiagnostics {
            accepted: 0.0,
            coalesced: 0.0,
            rejected: 0.0,
            media_frames_dropped_without_sink: 0.0,
        }
    }
}
