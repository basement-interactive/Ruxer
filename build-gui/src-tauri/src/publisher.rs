//! Publishes a finished build as a GitHub release on the Ruxer distribution
//! repo: uploads the MSI (Windows) + AppImage (Linux) with their updater
//! signatures, plus the `latest.json` manifest that the in-app updater
//! (tauri-plugin-updater) polls via
//! `https://github.com/<repo>/releases/latest/download/latest.json`.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;

use crate::emit_log;

/// GitHub repo hosting releases. The in-app updater endpoint in the main
/// app's tauri.conf.json points at this repo — keep the two in sync.
pub const RELEASE_REPO: &str = "basement-interactive/Ruxer";

pub fn publish_release(app: &AppHandle, repo_root: &Path) -> Result<String, String> {
    let gh_ok = Command::new("gh")
        .args(["auth", "status"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !gh_ok {
        return Err(
            "GitHub CLI (gh) is not installed or not authenticated — run `gh auth login` first"
                .into(),
        );
    }

    let version = read_app_version(repo_root)?;
    let tag = format!("v{version}");

    // Publishing the same tag twice would leave the release's assets in an
    // ambiguous half-old/half-new state, and the in-app updater compares
    // versions anyway — a re-publish of the SAME version would never be
    // offered to anyone. Force a version bump instead.
    let exists = Command::new("gh")
        .args(["release", "view", &tag, "--repo", RELEASE_REPO])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if exists {
        return Err(format!(
            "release {tag} already exists on {RELEASE_REPO} — bump \"version\" in \
             src-tauri/tauri.conf.json (and src-tauri/Cargo.toml to keep them in sync), \
             rebuild, then publish again"
        ));
    }

    let staging = repo_root.join("dist-archives").join(format!("release-{tag}"));
    fs::create_dir_all(&staging).map_err(|e| format!("failed to create staging dir: {e}"))?;

    let windows_artifacts = collect_windows_artifacts(app, repo_root, &version, &staging)?;
    let linux_artifacts = collect_linux_artifacts(app, repo_root, &version, &staging)?;

    if windows_artifacts.is_none() && linux_artifacts.is_none() {
        return Err(format!(
            "no signed build artifacts found for version {version} — run the Windows and/or \
             Linux build first (builds are only signed when run through this GUI)"
        ));
    }
    if windows_artifacts.is_none() {
        emit_log(app, "info", "No Windows MSI found — publishing a Linux-only release.");
    }
    if linux_artifacts.is_none() {
        emit_log(app, "info", "No Linux AppImage found — publishing a Windows-only release.");
    }

    // latest.json: the manifest tauri-plugin-updater consumes. Platform keys
    // are `<os>-<arch>`; the `signature` is the CONTENT of the .sig file, and
    // `url` must point at the release asset's final download URL.
    let mut platforms = serde_json::Map::new();
    if let Some((installer, signature)) = &windows_artifacts {
        platforms.insert(
            "windows-x86_64".to_string(),
            serde_json::json!({
                "signature": signature,
                "url": asset_url(&tag, installer),
            }),
        );
    }
    if let Some((installer, signature)) = &linux_artifacts {
        platforms.insert(
            "linux-x86_64".to_string(),
            serde_json::json!({
                "signature": signature,
                "url": asset_url(&tag, installer),
            }),
        );
    }
    let latest = serde_json::json!({
        "version": version,
        "notes": format!("Ruxer {version}"),
        "pub_date": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        "platforms": platforms,
    });
    let latest_path = staging.join("latest.json");
    fs::write(
        &latest_path,
        serde_json::to_vec_pretty(&latest).map_err(|e| format!("latest.json encode: {e}"))?,
    )
    .map_err(|e| format!("failed to write latest.json: {e}"))?;

    emit_log(
        app,
        "info",
        format!("Creating GitHub release {tag} on {RELEASE_REPO} and uploading assets..."),
    );

    let mut cmd = Command::new("gh");
    cmd.args([
        "release",
        "create",
        &tag,
        "--repo",
        RELEASE_REPO,
        "--title",
        &format!("Ruxer {version}"),
        "--notes",
        &format!("Automated release of Ruxer {version}."),
    ]);
    if let Some((installer, _)) = &windows_artifacts {
        cmd.arg(installer);
        cmd.arg(sig_path(installer));
    }
    if let Some((installer, _)) = &linux_artifacts {
        cmd.arg(installer);
        cmd.arg(sig_path(installer));
    }
    cmd.arg(&latest_path);

    crate::builder::run_streamed(app, &mut cmd, &[])?;

    Ok(format!(
        "Published {tag}: https://github.com/{RELEASE_REPO}/releases/tag/{tag}"
    ))
}

fn asset_url(tag: &str, file: &Path) -> String {
    let name = file
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    format!("https://github.com/{RELEASE_REPO}/releases/download/{tag}/{name}")
}

fn sig_path(installer: &Path) -> PathBuf {
    let mut os = installer.as_os_str().to_owned();
    os.push(".sig");
    PathBuf::from(os)
}

/// Read `version` from the main app's tauri.conf.json — the single source of
/// truth the bundler stamps into installers and the updater compares against.
fn read_app_version(repo_root: &Path) -> Result<String, String> {
    let conf_path = repo_root.join("src-tauri").join("tauri.conf.json");
    let raw = fs::read_to_string(&conf_path)
        .map_err(|e| format!("failed to read {}: {e}", conf_path.display()))?;
    let conf: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("tauri.conf.json parse error: {e}"))?;
    conf.get("version")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| "tauri.conf.json has no top-level \"version\" field".to_string())
}

/// Locate the signed Windows MSI for `version`, copy installer + .sig into
/// `staging`, and return (installer path, signature content). `None` when no
/// MSI for this version exists (not built yet).
fn collect_windows_artifacts(
    app: &AppHandle,
    repo_root: &Path,
    version: &str,
    staging: &Path,
) -> Result<Option<(PathBuf, String)>, String> {
    let name = format!("Ruxer_{version}_x64_en-US.msi");
    let src = repo_root.join("target/release/bundle/msi").join(&name);
    if !src.is_file() {
        return Ok(None);
    }
    let src_sig = sig_path(&src);
    if !src_sig.is_file() {
        return Err(format!(
            "{} exists but its updater signature ({}) is missing — rebuild through this GUI so \
             the bundle gets signed",
            src.display(),
            src_sig.display()
        ));
    }
    let dst = staging.join(&name);
    let dst_sig = sig_path(&dst);
    fs::copy(&src, &dst).map_err(|e| format!("failed to stage {name}: {e}"))?;
    fs::copy(&src_sig, &dst_sig).map_err(|e| format!("failed to stage {name}.sig: {e}"))?;
    let signature = fs::read_to_string(&dst_sig)
        .map_err(|e| format!("failed to read {}: {e}", dst_sig.display()))?
        .trim()
        .to_string();
    emit_log(app, "info", format!("Staged Windows artifact {name}"));
    Ok(Some((dst, signature)))
}

/// Same for the Linux AppImage, which lives on WSL's own filesystem
/// (`builder::LINUX_TARGET_DIR`) — copy installer + .sig out through the
/// /mnt passthrough into `staging`.
fn collect_linux_artifacts(
    app: &AppHandle,
    repo_root: &Path,
    version: &str,
    staging: &Path,
) -> Result<Option<(PathBuf, String)>, String> {
    let distro = match crate::builder::build_distro() {
        Ok(d) => d,
        Err(_) => return Ok(None), // no WSL => Windows-only publish
    };
    let name = format!("Ruxer_{version}_amd64.AppImage");
    let wsl_staging = format!(
        "{}/dist-archives/release-v{version}",
        crate::builder::windows_path_to_wsl(repo_root)?
    );
    let script = format!(
        "src=\"$HOME/.cache/fluxer-linux-build/target/release/bundle/appimage\"; \
         [ -f \"$src/{name}\" ] || exit 3; \
         [ -f \"$src/{name}.sig\" ] || exit 4; \
         mkdir -p '{wsl_staging}'; \
         cp \"$src/{name}\" \"$src/{name}.sig\" '{wsl_staging}/'"
    );
    let output = crate::builder::run_wsl_script_captured(&distro, &script)
        .map_err(|e| format!("failed to run WSL copy: {e}"))?;
    match output.status.code() {
        Some(0) => {}
        Some(3) => return Ok(None), // no Linux build for this version
        Some(4) => {
            return Err(format!(
                "{name} exists in WSL but its updater signature is missing — rebuild the Linux \
                 side through this GUI so the bundle gets signed"
            ));
        }
        _ => {
            return Err(format!(
                "copying Linux artifacts out of WSL failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }
    let dst = staging.join(&name);
    let dst_sig = sig_path(&dst);
    let signature = fs::read_to_string(&dst_sig)
        .map_err(|e| format!("failed to read {}: {e}", dst_sig.display()))?
        .trim()
        .to_string();
    emit_log(app, "info", format!("Staged Linux artifact {name}"));
    Ok(Some((dst, signature)))
}
