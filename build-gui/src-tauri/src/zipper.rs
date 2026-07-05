//! Zips a finished `cargo tauri build` bundle directory into a single
//! timestamped archive under `<repo>/dist-archives/`.
//!
//! Windows bundles are zipped directly (plain local file I/O). Linux bundles
//! live on WSL's own ext4 filesystem (see `builder::LINUX_TARGET_DIR` for
//! why — DrvFs/9p, the layer WSL uses to expose Windows drives, unreliably
//! fails permission-set syscalls on files written there from Linux) and are
//! zipped INSIDE WSL with the distro's native `zip`, then the single
//! resulting archive is copied out through the `/mnt/<drive>/...` mount. That
//! last hop is safe because it's one already-finished static file, not a
//! live build tree under concurrent chmod/fsync — the two WSL-interop
//! failures hit earlier in this tool's life were both about reading/writing
//! a build IN PROGRESS across the Windows/Linux boundary, not about copying
//! a finished file.

use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use tauri::AppHandle;
use zip::write::SimpleFileOptions;

use crate::emit_log;

pub fn zip_release(app: &AppHandle, repo_root: &Path, platform: &str) -> Result<String, String> {
    if platform == "linux" {
        return zip_linux_release(app, repo_root);
    }
    zip_release_impl(repo_root, platform, |stream, text| emit_log(app, stream, text))
}

/// Zip the Linux bundle INSIDE WSL (native ext4, native `zip`) and copy the
/// resulting archive out to `<repo>/dist-archives/` on Windows.
fn zip_linux_release(app: &AppHandle, repo_root: &Path) -> Result<String, String> {
    let distro = crate::builder::build_distro()?;
    let bundle_dir = format!("{}/release/bundle", crate::builder::LINUX_TARGET_DIR);

    let archives_dir = repo_root.join("dist-archives");
    std::fs::create_dir_all(&archives_dir)
        .map_err(|e| format!("failed to create dist-archives dir: {e}"))?;
    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let zip_name = format!("fluxer-linux-{timestamp}.zip");
    let wsl_repo_path = crate::builder::windows_path_to_wsl(repo_root)?;

    emit_log(
        app,
        "info",
        format!("Zipping Linux bundle inside {distro} (native ext4, avoids WSL/DrvFs interop issues)..."),
    );

    // `bundle.targets` in tauri.conf.json is restricted to `["msi",
    // "appimage"]`, so Linux only ever produces an `appimage/` subdir (no
    // deb/rpm) — zip just that one.
    //
    // Passed via stdin (`builder::run_wsl_script_captured`), NOT as a
    // `bash -c "<script>"` argument — `wsl.exe` silently corrupts
    // multi-statement scripts passed that way (a `for d in a b c; do ...`
    // loop ran the right number of iterations but `$d` always came through
    // empty, even a plain `found=0` right before it lost its value — some
    // Windows-side argv reconstruction inside wsl.exe, confirmed with a
    // minimal Rust repro, not a shell-tool artifact). Piping the identical
    // script through stdin instead fixed it completely.
    let script = format!(
        "set -e; command -v zip >/dev/null || {{ echo 'NO_ZIP' >&2; exit 2; }}; \
         cd \"{bundle_dir}\" 2>/dev/null || {{ echo 'NO_BUNDLE_DIR' >&2; exit 3; }}; \
         [ -d appimage ] || {{ echo 'NO_LINUX_BUNDLES' >&2; exit 4; }}; \
         zip -r -q '/tmp/{zip_name}' appimage; \
         mkdir -p '{wsl_repo_path}/dist-archives'; \
         cp '/tmp/{zip_name}' '{wsl_repo_path}/dist-archives/{zip_name}'; \
         rm -f '/tmp/{zip_name}'"
    );
    let output = crate::builder::run_wsl_script_captured(&distro, &script)
        .map_err(|e| format!("failed to run zip in WSL: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(match output.status.code() {
            Some(2) => format!("`zip` isn't installed in {distro} — run `sudo apt-get install -y zip` there"),
            Some(3) => format!(
                "no Linux bundle found at ~/.cache/fluxer-linux-build/target/release/bundle/ \
                 inside {distro} — run the Linux build first"
            ),
            Some(4) => format!(
                "bundle dir exists in {distro} but has no appimage/ output — re-run the Linux build"
            ),
            _ => format!("zip command failed in {distro}: {stderr}"),
        });
    }

    let zip_path = archives_dir.join(&zip_name);
    if !zip_path.is_file() {
        return Err(format!(
            "WSL reported success but {} wasn't found afterward",
            zip_path.display()
        ));
    }
    Ok(format!("Zipped Linux release to {}", zip_path.display()))
}

/// Core zip logic for the WINDOWS bundle dir (`<repo>/target/release/bundle/`
/// — the workspace root's `target/`, not `src-tauri/target/`, since
/// `fluxer-desktop` is a workspace member and Cargo puts all build output
/// under the root). Parameterized over a logging callback instead of a live
/// `AppHandle` so it's unit-testable without spinning up a Tauri app. Only
/// `"windows"` reaches this function — `zip_release` routes `"linux"` to
/// `zip_linux_release` instead, since the Linux bundle lives on WSL's own
/// filesystem, not under `repo_root` at all. `bundle.targets` in
/// tauri.conf.json is restricted to `["msi", "appimage"]`, so Windows only
/// ever produces an `msi/` subdir (no `nsis/`).
fn zip_release_impl(
    repo_root: &Path,
    platform: &str,
    mut log: impl FnMut(&'static str, String),
) -> Result<String, String> {
    if platform != "windows" {
        return Err(format!("unknown platform '{platform}'"));
    }
    let bundle_dir = repo_root.join("target/release/bundle");

    if !bundle_dir.is_dir() {
        return Err(format!(
            "no bundle directory found at {} — run the {platform} build first",
            bundle_dir.display()
        ));
    }

    // Windows and Linux builds both land under this one bundle dir (Linux's
    // own subdirs just happen to live on WSL's filesystem instead), so it's
    // easy to zip stale output left over from a prior Linux-only build.
    // Sanity-check the msi/ subdir is actually present before zipping, and
    // fail loudly instead of silently packaging nothing useful.
    if !bundle_dir.join("msi").is_dir() {
        return Err(format!(
            "{} has no msi/ bundle output — run the Windows build first",
            bundle_dir.display()
        ));
    }

    let archives_dir = repo_root.join("dist-archives");
    std::fs::create_dir_all(&archives_dir)
        .map_err(|e| format!("failed to create dist-archives dir: {e}"))?;

    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let zip_path = archives_dir.join(format!("fluxer-{platform}-{timestamp}.zip"));

    log(
        "info",
        format!(
            "Zipping {} -> {}",
            bundle_dir.display(),
            zip_path.display()
        ),
    );

    let file = File::create(&zip_path).map_err(|e| format!("failed to create zip file: {e}"))?;
    let mut writer = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // Only walk the msi/ subdir. Windows and Linux share this one
    // `bundle_dir`, so without this filter a zip could silently include a
    // stale bundle type left over from a prior Linux build.
    let mut file_count = 0usize;
    for subdir in ["msi"] {
        let subdir_path = bundle_dir.join(subdir);
        if !subdir_path.is_dir() {
            continue;
        }
        for entry in walkdir::WalkDir::new(&subdir_path)
            .into_iter()
            .filter_map(Result::ok)
        {
            let path = entry.path();
            let rel = path
                .strip_prefix(&bundle_dir)
                .map_err(|e| format!("path prefix error: {e}"))?;
            let rel_str = rel.to_string_lossy().replace('\\', "/");

            if entry.file_type().is_dir() {
                writer
                    .add_directory(format!("{rel_str}/"), options)
                    .map_err(|e| format!("failed to add directory {rel_str}: {e}"))?;
                continue;
            }
            if !entry.file_type().is_file() {
                continue; // skip symlinks etc.
            }

            writer
                .start_file(rel_str.clone(), options)
                .map_err(|e| format!("failed to start zip entry {rel_str}: {e}"))?;
            let mut f = File::open(path).map_err(|e| format!("failed to open {rel_str}: {e}"))?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf)
                .map_err(|e| format!("failed to read {rel_str}: {e}"))?;
            writer
                .write_all(&buf)
                .map_err(|e| format!("failed to write {rel_str} into zip: {e}"))?;
            file_count += 1;
            log("stdout", format!("  + {rel_str}"));
        }
    }

    writer
        .finish()
        .map_err(|e| format!("failed to finalize zip: {e}"))?;

    Ok(format!(
        "Zipped {file_count} files to {}",
        zip_path.display()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Builds a fake `<repo>/target/release/bundle/` tree. `bundle.targets`
    /// is `["msi", "appimage"]` now, so a realistic shared bundle dir holds
    /// an `msi/` (Windows build) and an `appimage/` (Linux build, in real
    /// life on WSL's filesystem — here local for the test) — plus we plant a
    /// stale `nsis/` leftover to prove it's excluded from zips.
    fn make_fake_repo() -> tempfile::TempDir {
        let dir = tempfile::TempDir::new().unwrap();
        let bundle = dir.path().join("target/release/bundle");
        for (sub, file) in [
            ("msi", "Ruxer_0.1.0_x64_en-US.msi"),
            ("appimage", "Ruxer_0.1.0_amd64.AppImage"),
            ("nsis", "stale_leftover-setup.exe"),
        ] {
            let subdir = bundle.join(sub);
            fs::create_dir_all(&subdir).unwrap();
            fs::write(subdir.join(file), b"fake bundle contents").unwrap();
        }
        dir
    }

    #[test]
    fn zips_only_the_msi_subdir() {
        let repo = make_fake_repo();
        let mut logs = Vec::new();
        let result =
            zip_release_impl(repo.path(), "windows", |stream, text| logs.push((stream, text)))
                .expect("zip should succeed");
        assert!(result.contains("Zipped 1 files"), "got: {result}");

        let zip_path = fs::read_dir(repo.path().join("dist-archives"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        let file = fs::File::open(&zip_path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        // Only the msi/ subdir — no appimage (Linux's) and no stale nsis
        // leftovers from the shared bundle dir.
        assert!(names.iter().any(|n| n.contains("msi")));
        assert!(!names.iter().any(|n| n.contains("appimage")));
        assert!(!names.iter().any(|n| n.contains("nsis")));
    }

    #[test]
    fn rejects_non_windows_platforms() {
        let repo = make_fake_repo();
        // "linux" is routed to zip_linux_release by the public zip_release
        // wrapper and must never reach this function.
        for platform in ["linux", "macos"] {
            let err = zip_release_impl(repo.path(), platform, |_, _| {}).unwrap_err();
            assert!(err.contains("unknown platform"), "got: {err}");
        }
    }

    #[test]
    fn errors_when_bundle_dir_missing() {
        let dir = tempfile::TempDir::new().unwrap();
        let err = zip_release_impl(dir.path(), "windows", |_, _| {}).unwrap_err();
        assert!(err.contains("no bundle directory found"));
    }

    #[test]
    fn errors_when_msi_missing() {
        // A bundle dir with ONLY non-Windows output present; zipping
        // "windows" must fail loudly instead of producing an empty archive
        // (the real bug this guards: the shared bundle dir makes stale/
        // wrong-platform zips easy).
        let dir = tempfile::TempDir::new().unwrap();
        let bundle = dir.path().join("target/release/bundle/appimage");
        fs::create_dir_all(&bundle).unwrap();
        fs::write(bundle.join("x.AppImage"), b"x").unwrap();

        let err = zip_release_impl(dir.path(), "windows", |_, _| {}).unwrap_err();
        assert!(err.contains("no msi/ bundle output"), "got: {err}");
    }
}

#[cfg(test)]
mod wsl_command_tests {
    //! These run the ACTUAL `builder::run_wsl_script_captured` helper this
    //! module uses, against a real, already-built Linux bundle (produced by
    //! hand in this session: `cargo tauri build` with
    //! `CARGO_TARGET_DIR=~/.cache/fluxer-linux-build/target` inside Ubuntu).
    //! `#[ignore]` because they need a real WSL2 + Ubuntu + a completed
    //! Linux build; run with `cargo test -- --ignored`.

    #[test]
    #[ignore]
    fn cd_and_find_bundle_dirs_against_real_build_output() {
        let distro = crate::builder::build_distro().expect("no WSL distro");
        let bundle_dir = format!("{}/release/bundle", crate::builder::LINUX_TARGET_DIR);
        let script = format!(
            "cd \"{bundle_dir}\" 2>/dev/null || {{ echo NO_BUNDLE_DIR >&2; exit 3; }}; \
             found=0; for d in deb rpm appimage; do [ -d \"$d\" ] && found=1; done; \
             [ \"$found\" = 1 ] || {{ echo NO_LINUX_BUNDLES >&2; exit 4; }}; \
             echo FOUND:$found"
        );
        let output =
            crate::builder::run_wsl_script_captured(&distro, &script).expect("failed to run wsl");
        assert!(
            output.status.success(),
            "stdout: {}\nstderr: {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(String::from_utf8_lossy(&output.stdout).contains("FOUND:1"));
    }
}
