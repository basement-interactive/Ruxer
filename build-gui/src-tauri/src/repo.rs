//! Locate the main `fluxer-rust` repo root this build GUI drives.

use std::path::{Path, PathBuf};

/// This tool lives at `<repo>/build-gui/src-tauri`, so the repo root is two
/// directories up from the running executable's compile-time source dir in
/// dev, or from the current working directory in a packaged build. We accept
/// either: walk up from CWD looking for the sibling markers that only exist
/// at the real repo root (`src-tauri/tauri.conf.json` + `web/dist` parent).
pub fn detect_repo_root() -> Result<PathBuf, String> {
    let start = std::env::current_dir().map_err(|e| format!("no current dir: {e}"))?;
    for dir in start.ancestors() {
        if looks_like_repo_root(dir) {
            return Ok(dir.to_path_buf());
        }
    }
    // Fall back to "parent of build-gui" for the common case of launching
    // this tool from inside `build-gui/`.
    for dir in start.ancestors() {
        if dir.file_name().is_some_and(|n| n == "build-gui") {
            if let Some(parent) = dir.parent() {
                if looks_like_repo_root(parent) {
                    return Ok(parent.to_path_buf());
                }
            }
        }
    }
    Err(
        "could not locate the fluxer-rust repo root automatically — pick it manually"
            .to_string(),
    )
}

fn looks_like_repo_root(dir: &Path) -> bool {
    dir.join("src-tauri").join("tauri.conf.json").is_file() && dir.join("core").is_dir()
}
