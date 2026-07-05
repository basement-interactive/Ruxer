//! Fluxer Build GUI — a small standalone Tauri app that drives release builds
//! of the main `fluxer-rust` Tauri app (Windows locally, Linux via WSL2) and
//! zips up the resulting bundles. Lives outside the main app's Cargo
//! workspace on purpose so its dependencies never affect that build.

mod builder;
mod publisher;
mod repo;
mod zipper;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;

/// Set while any build/zip task is running so a second one can't start
/// concurrently and stomp on the same target dir / log stream.
#[derive(Default)]
pub struct BusyGuard(Arc<AtomicBool>);

/// One line of task output, pushed to the frontend as a `build-log` event.
#[derive(Clone, serde::Serialize)]
struct LogLine {
    stream: &'static str, // "stdout" | "stderr" | "info" | "error"
    text: String,
}

/// Emitted once a task finishes (success or failure) as `build-done`.
#[derive(Clone, serde::Serialize)]
struct TaskDone {
    ok: bool,
    message: String,
}

fn emit_log(app: &tauri::AppHandle, stream: &'static str, text: impl Into<String>) {
    let _ = app.emit(
        "build-log",
        LogLine {
            stream,
            text: text.into(),
        },
    );
}

fn emit_done(app: &tauri::AppHandle, ok: bool, message: impl Into<String>) {
    let _ = app.emit(
        "build-done",
        TaskDone {
            ok,
            message: message.into(),
        },
    );
}

#[tauri::command]
fn detect_repo_root() -> Result<String, String> {
    repo::detect_repo_root().map(|p| p.display().to_string())
}

#[tauri::command]
fn check_wsl() -> bool {
    builder::wsl_available()
}

#[tauri::command]
async fn build_windows(
    app: tauri::AppHandle,
    state: tauri::State<'_, BusyGuard>,
    repo_root: String,
) -> Result<(), String> {
    run_exclusive(app, state, move |app| {
        builder::build_windows(&app, std::path::Path::new(&repo_root))
    })
    .await
}

#[tauri::command]
async fn build_linux(
    app: tauri::AppHandle,
    state: tauri::State<'_, BusyGuard>,
    repo_root: String,
) -> Result<(), String> {
    run_exclusive(app, state, move |app| {
        builder::build_linux_via_wsl(&app, std::path::Path::new(&repo_root))
    })
    .await
}

#[tauri::command]
async fn zip_release(
    app: tauri::AppHandle,
    state: tauri::State<'_, BusyGuard>,
    repo_root: String,
    platform: String,
) -> Result<(), String> {
    run_exclusive(app, state, move |app| {
        zipper::zip_release(&app, std::path::Path::new(&repo_root), &platform)
    })
    .await
}

#[tauri::command]
async fn publish_release(
    app: tauri::AppHandle,
    state: tauri::State<'_, BusyGuard>,
    repo_root: String,
) -> Result<(), String> {
    run_exclusive(app, state, move |app| {
        publisher::publish_release(&app, std::path::Path::new(&repo_root))
    })
    .await
}

/// Runs `task` on a blocking thread, guarded so only one task runs at a time,
/// and translates its `Result` into the `build-done` event + command error.
async fn run_exclusive<F>(
    app: tauri::AppHandle,
    state: tauri::State<'_, BusyGuard>,
    task: F,
) -> Result<(), String>
where
    F: FnOnce(tauri::AppHandle) -> Result<String, String> + Send + 'static,
{
    if state.0.swap(true, Ordering::SeqCst) {
        return Err("another build/zip task is already running".into());
    }
    let busy = state.0.clone();
    let app_for_task = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || task(app_for_task))
        .await
        .map_err(|e| format!("task panicked: {e}"));
    busy.store(false, Ordering::SeqCst);

    match result {
        Ok(Ok(msg)) => {
            emit_done(&app, true, msg);
            Ok(())
        }
        Ok(Err(msg)) => {
            emit_done(&app, false, msg.clone());
            Err(msg)
        }
        Err(msg) => {
            emit_done(&app, false, msg.clone());
            Err(msg)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BusyGuard::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            detect_repo_root,
            check_wsl,
            build_windows,
            build_linux,
            zip_release,
            publish_release,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Fluxer Build GUI");
}
