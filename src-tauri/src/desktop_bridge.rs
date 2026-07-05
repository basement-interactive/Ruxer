//! Backend commands that back the `window.electron` shim (see
//! `web`/reference `desktop-tauri-shim.ts`). These provide the small set of
//! native capabilities the reference client expects from an Electron preload
//! bridge, mapped onto Tauri. Anything the shim calls that is not implemented
//! here degrades gracefully on the JS side (the shim swallows missing-command
//! errors), so this module only needs the load-bearing pieces.

use serde::Serialize;
use tauri::AppHandle;

/// Subset of the reference `DesktopInfo` the app reads at startup. The shim
/// fills the rest with inert defaults.
#[derive(Serialize)]
pub struct DesktopInfo {
    pub version: String,
    pub channel: String,
    pub os: String,
    pub os_version: String,
    pub arch: String,
}

#[tauri::command]
pub fn desktop_info() -> DesktopInfo {
    let os = if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    };
    let arch = if cfg!(target_arch = "x86_64") {
        "x64"
    } else if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        std::env::consts::ARCH
    };
    DesktopInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        channel: "stable".to_string(),
        os: os.to_string(),
        os_version: String::new(),
        arch: arch.to_string(),
    }
}

/// Return the deep link the app was launched with, if any.
#[tauri::command]
pub fn desktop_initial_deep_link(app: AppHandle) -> Option<String> {
    use tauri_plugin_deep_link::DeepLinkExt;
    app.deep_link()
        .get_current()
        .ok()
        .flatten()
        .and_then(|urls| urls.into_iter().next())
        .map(|u| u.to_string())
}

/// The global key hook (PTT/mute/deafen) is already wired via
/// `setup_global_shortcuts`, which registers shortcuts and emits events the
/// frontend listens for. These commands exist so the shim's start/stop calls
/// resolve; the actual hotkeys are managed by the global-shortcut plugin.
#[tauri::command]
pub fn desktop_global_hook_start() -> bool {
    true
}

#[tauri::command]
pub fn desktop_global_hook_stop() {}

/// Enumerate native desktop sources (monitors + windows) for the in-app screen
/// share picker. Runs the Win32 enumeration on a blocking thread so GDI calls
/// don't stall the async runtime.
#[tauri::command]
pub async fn desktop_get_sources(
    types: Vec<String>,
    list_only: Option<bool>,
) -> Result<Vec<crate::screen_sources::DesktopSource>, String> {
    let list_only = list_only.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || crate::screen_sources::get_sources(&types, list_only))
        .await
        .map_err(|e| e.to_string())
}

/// Record the source the picker chose. Capture is performed by the webview via
/// getUserMedia({chromeMediaSource:'desktop'}) with the launch-time
/// `--auto-select-desktop-capture-source` selecting the source; per-source
/// runtime targeting isn't yet supported (WebView2 can't rewrite launch flags),
/// so this is currently advisory.
#[tauri::command]
pub fn desktop_select_capture_source(source_id: String) {
    tracing::debug!("screen-share source selected: {source_id}");
}

/// Start native capture (Windows.Graphics.Capture video + WASAPI-loopback
/// audio) of the picked source. Frames are streamed to the webview over the
/// local proxy's `/__cap/v` and `/__cap/a` WebSockets; the frontend's
/// getDisplayMedia override reassembles them into a MediaStream. This is what
/// lets screen share skip the WebView2 "Choose what to share" dialog AND carry
/// system audio (neither is possible via WebView2 getDisplayMedia).
#[tauri::command]
pub async fn native_capture_start(
    source_id: String,
    fps: Option<u32>,
    max_width: Option<u32>,
    audio: Option<bool>,
) -> Result<(), String> {
    let fps = fps.unwrap_or(30).clamp(1, 60);
    let max_width = max_width.unwrap_or(1920);
    let want_audio = audio.unwrap_or(true);
    // The capture threads block on Win32/WGC/WASAPI, so spin them up off the
    // async runtime.
    tauri::async_runtime::spawn_blocking(move || {
        crate::capture::start(&source_id, fps, max_width, want_audio)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stop native capture and release its threads.
#[tauri::command]
pub fn native_capture_stop() {
    crate::capture::stop();
}

/// Toggle the webview inspector. Bound to F12 / Ctrl+Shift+I by the shim;
/// available in release builds via tauri's `devtools` feature.
#[tauri::command]
pub fn desktop_toggle_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

/// Restart the app. Used by the shim after an AppImage update is installed:
/// unlike the Windows MSI path (whose installer exits/relaunches the app
/// itself), the Linux updater just swaps the AppImage file on disk — the
/// running process stays on the OLD version until something restarts it.
/// Tauri's restart handles the AppImage re-exec (APPIMAGE env) correctly.
#[tauri::command]
pub fn desktop_relaunch(app: tauri::AppHandle) {
    app.restart();
}

/// One GPU adapter, in the shape of the reference client's `GpuDeviceInfo`
/// (`types/electron.d.ts`). The client feeds this into
/// `GpuEncoderCapabilities.reportFromGpuInfo` to classify the GPU family and
/// decide which screen-share codecs have hardware encoders — without it the
/// codec picker assumes no hardware and publishes software AV1 (CPU libaom),
/// which is what made screen share slow and blurry.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuDeviceInfo {
    pub active: bool,
    pub vendor_id: u32,
    pub device_id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vendor_name: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_string: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dedicated_video_memory: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shared_system_memory: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub adapter_luid: Option<String>,
    pub headless: bool,
    pub source: &'static str,
}

/// Reference `GpuInfo` envelope.
#[derive(Serialize)]
pub struct GpuInfo {
    pub devices: Vec<GpuDeviceInfo>,
    #[serde(rename = "nativeSource")]
    pub native_source: &'static str,
}

fn gpu_vendor_name(vendor_id: u32) -> Option<&'static str> {
    match vendor_id {
        0x10de => Some("NVIDIA"),
        0x1002 => Some("AMD"),
        0x8086 => Some("Intel"),
        0x106b => Some("Apple"),
        _ => None,
    }
}

/// Enumerate GPU adapters for the shim's `getGpuInfo` (DXGI on Windows,
/// /sys/class/drm on Linux).
#[tauri::command]
pub async fn desktop_get_gpu_info() -> Result<GpuInfo, String> {
    tauri::async_runtime::spawn_blocking(gpu_info_native)
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn gpu_info_native() -> Result<GpuInfo, String> {
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE,
    };

    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }.map_err(|e| e.to_string())?;
    let mut devices = Vec::new();
    let mut index = 0u32;
    while let Ok(adapter) = unsafe { factory.EnumAdapters1(index) } {
        index += 1;
        let Ok(desc) = (unsafe { adapter.GetDesc1() }) else {
            continue;
        };
        // Skip WARP/Basic Render Driver — it would misclassify as "no GPU".
        if desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 {
            continue;
        }
        let device_string = String::from_utf16_lossy(&desc.Description)
            .trim_end_matches('\0')
            .to_string();
        let headless = unsafe { adapter.EnumOutputs(0) }.is_err();
        devices.push(GpuDeviceInfo {
            active: false,
            vendor_id: desc.VendorId,
            device_id: desc.DeviceId,
            vendor_name: gpu_vendor_name(desc.VendorId),
            device_string: (!device_string.is_empty()).then_some(device_string),
            dedicated_video_memory: Some(desc.DedicatedVideoMemory as u64),
            shared_system_memory: Some(desc.SharedSystemMemory as u64),
            adapter_luid: Some(format!(
                "{}:{}",
                desc.AdapterLuid.HighPart, desc.AdapterLuid.LowPart
            )),
            headless,
            source: "dxgi",
        });
    }
    if devices.is_empty() {
        return Err("no hardware GPU adapters found".into());
    }
    // The adapter driving a display is the one WebView2 encodes on.
    let active = devices.iter().position(|d| !d.headless).unwrap_or(0);
    devices[active].active = true;
    Ok(GpuInfo {
        devices,
        native_source: "dxgi",
    })
}

/// Linux: enumerate GPUs from /sys/class/drm (`cardN/device/{vendor,device}`).
/// PCI vendor/device ids are enough for the client's GPU-family classifier;
/// a card with a connected connector (`cardN-*/status == "connected"`) is the
/// one driving a display.
#[cfg(target_os = "linux")]
fn gpu_info_native() -> Result<GpuInfo, String> {
    use std::fs;
    use std::path::Path;

    fn read_hex(path: &Path) -> Option<u32> {
        let s = fs::read_to_string(path).ok()?;
        u32::from_str_radix(s.trim().trim_start_matches("0x"), 16).ok()
    }

    fn has_connected_output(card: &str) -> bool {
        let Ok(entries) = fs::read_dir("/sys/class/drm") else {
            return false;
        };
        let prefix = format!("{card}-");
        entries.filter_map(|e| e.ok()).any(|e| {
            e.file_name().to_string_lossy().starts_with(&prefix)
                && fs::read_to_string(e.path().join("status"))
                    .map(|s| s.trim() == "connected")
                    .unwrap_or(false)
        })
    }

    let entries = fs::read_dir("/sys/class/drm").map_err(|e| e.to_string())?;
    let mut cards: Vec<_> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name();
            let name = name.to_string_lossy();
            name.starts_with("card") && !name.contains('-')
        })
        .collect();
    cards.sort_by_key(|e| e.file_name());

    let mut devices = Vec::new();
    for card in cards {
        let dev = card.path().join("device");
        let Some(vendor_id) = read_hex(&dev.join("vendor")) else {
            continue;
        };
        let Some(device_id) = read_hex(&dev.join("device")) else {
            continue;
        };
        let card_name = card.file_name().to_string_lossy().into_owned();
        devices.push(GpuDeviceInfo {
            active: false,
            vendor_id,
            device_id,
            vendor_name: gpu_vendor_name(vendor_id),
            device_string: None,
            dedicated_video_memory: None,
            shared_system_memory: None,
            adapter_luid: None,
            headless: !has_connected_output(&card_name),
            source: "linux-sysfs",
        });
    }
    if devices.is_empty() {
        return Err("no GPU adapters found in /sys/class/drm".into());
    }
    let active = devices.iter().position(|d| !d.headless).unwrap_or(0);
    devices[active].active = true;
    Ok(GpuInfo {
        devices,
        native_source: "linux-sysfs",
    })
}

#[cfg(not(any(windows, target_os = "linux")))]
fn gpu_info_native() -> Result<GpuInfo, String> {
    Err("gpu info not implemented on this platform".into())
}

/// Download a file (message attachment / image) the reference client asks us to
/// save. The shim's `downloadFile` invokes this — it was previously MISSING, so
/// Tauri rejected "command not found", the shim swallowed it, and downloads
/// silently no-oped. Fetches the URL with a plain reqwest GET (Rust-side, so no
/// CORS/webview constraint — the client already appends any `?download=true`),
/// then shows a native save dialog defaulting to Downloads and writes the bytes.
/// Returns the saved path, or `None` if the user cancels the dialog.
#[tauri::command]
pub async fn desktop_download_file(
    app: AppHandle,
    url: String,
    suggested_name: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    // Fetch the bytes first (fail fast if the URL is bad before prompting).
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("http client: {e}"))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("download request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download failed: HTTP {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("read download body: {e}"))?;

    // Pick a save location — native dialog, defaulting to the Downloads dir with
    // the suggested filename. `blocking_save_file` must run off the async
    // runtime's worker (it pumps a nested event loop), so do it on a blocking
    // thread.
    let download_dir = dirs::download_dir();
    let name = if suggested_name.is_empty() {
        "download".to_string()
    } else {
        suggested_name
    };
    let dialog = app.dialog().clone();
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        let mut builder = dialog.file().set_file_name(&name);
        if let Some(dir) = download_dir {
            builder = builder.set_directory(dir);
        }
        builder.blocking_save_file()
    })
    .await
    .map_err(|e| format!("save dialog task: {e}"))?;

    let Some(path) = chosen else {
        return Ok(None); // user cancelled
    };
    // FilePath → a real filesystem path we can write to.
    let path_buf = path
        .into_path()
        .map_err(|e| format!("resolve save path: {e}"))?;
    std::fs::write(&path_buf, &bytes).map_err(|e| format!("write file: {e}"))?;
    Ok(Some(path_buf.to_string_lossy().into_owned()))
}
