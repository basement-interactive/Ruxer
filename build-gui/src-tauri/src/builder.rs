//! Runs the actual `cargo tauri build` invocations for Windows (locally) and
//! Linux (inside WSL2), streaming their output to the frontend as they run.

use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::AppHandle;

use crate::emit_log;

/// Build a `wsl -d <distro> -- bash -s` command that will read its script
/// from STDIN rather than a `-c "<script>"` argument.
///
/// This is NOT a style preference — passing a multi-statement script as a
/// single `bash -lc` ARGUMENT gets silently corrupted by `wsl.exe`'s own
/// Windows-side argv handling: `for d in deb rpm appimage; do ...; done`
/// would run the right number of loop iterations but `$d` (and even a plain
/// `found=0` assignment right before it) came through empty, as if the
/// tokens after certain punctuation were being dropped before the string
/// ever reached WSL's Linux-side bash. Confirmed with a minimal Rust
/// `Command::new("wsl")` reproduction (not a shell-tool artifact) — switching
/// from `-c <string>` to `-s` + writing the script to the child's stdin pipe
/// fixed it completely, because the script bytes then travel through a pipe
/// instead of through argv reconstruction.
fn wsl_bash_script(distro: &str, script: &str) -> (Command, Vec<u8>) {
    let mut cmd = Command::new("wsl");
    cmd.args(["-d", distro, "--", "bash", "-ls"]);
    (cmd, script.as_bytes().to_vec())
}

/// Run a bash script inside `distro` to completion (no live streaming) and
/// return its full captured output — for callers (like the zipper) that need
/// `Output` semantics rather than `run_streamed`'s event-per-line behavior.
/// Uses the same stdin-piping approach as everything else in this module;
/// see `wsl_bash_script`'s doc comment for why that's required.
pub fn run_wsl_script_captured(distro: &str, script: &str) -> std::io::Result<std::process::Output> {
    let (mut cmd, stdin_bytes) = wsl_bash_script(distro, script);
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    child
        .stdin
        .take()
        .expect("piped stdin")
        .write_all(&stdin_bytes)?;
    child.wait_with_output()
}

/// Whether a `wsl` executable is reachable and has at least one registered
/// distro. Used to gray out the Linux build button with a clear reason.
pub fn wsl_available() -> bool {
    build_distro().is_ok()
}

/// Distro names that exist for container/VM plumbing, not as a general-
/// purpose Linux userland — they have no bash/cargo/apt and must never be
/// picked as the build target even if they're the WSL *default* distro.
const NON_BUILD_DISTRO_PREFIXES: &[&str] = &["docker-desktop"];

/// Pick the WSL distro to build in: the first registered distro that isn't
/// one of `NON_BUILD_DISTRO_PREFIXES`. Deliberately ignores `wsl`'s notion of
/// "default distro" — Docker Desktop commonly registers `docker-desktop` (a
/// minimal VM with no bash/cargo) as the default, which broke plain
/// `wsl bash -lc ...` invocations with `bash: not found` even though a real
/// distro (e.g. Ubuntu) was also installed.
pub fn build_distro() -> Result<String, String> {
    let output = Command::new("wsl")
        .args(["-l", "-q"])
        .output()
        .map_err(|e| format!("failed to list WSL distros: {e}"))?;
    if !output.status.success() {
        return Err("`wsl -l -q` failed — is WSL installed?".into());
    }
    // `wsl -l` writes UTF-16LE with a BOM on most Windows builds.
    let text = String::from_utf16(
        &output
            .stdout
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect::<Vec<_>>(),
    )
    .unwrap_or_else(|_| String::from_utf8_lossy(&output.stdout).into_owned());

    let distros: Vec<&str> = text
        .lines()
        .map(|l| l.trim().trim_start_matches('\u{feff}'))
        .filter(|l| !l.is_empty())
        .collect();

    distros
        .iter()
        .find(|name| {
            !NON_BUILD_DISTRO_PREFIXES
                .iter()
                .any(|prefix| name.eq_ignore_ascii_case(prefix))
        })
        .map(|s| s.to_string())
        .ok_or_else(|| {
            if distros.is_empty() {
                "no WSL distros registered — run `wsl --install -d Ubuntu`".to_string()
            } else {
                format!(
                    "only non-build WSL distros are registered ({}) — run \
                     `wsl --install -d Ubuntu` to get a real Linux userland",
                    distros.join(", ")
                )
            }
        })
}

/// Updater-signing key location inside the repo. `bundle.createUpdaterArtifacts`
/// is enabled in tauri.conf.json, which makes `cargo tauri build` REQUIRE the
/// signing key at bundle time (it emits a `.sig` next to each installer that
/// the in-app updater verifies against the pubkey baked into the config).
pub fn signing_key_path(repo_root: &Path) -> std::path::PathBuf {
    repo_root.join(".tauri-signing").join("ruxer.key")
}

/// Build the Windows bundle (MSI only, per `bundle.targets` in
/// tauri.conf.json) by running `cargo tauri build` directly in `repo_root`.
pub fn build_windows(app: &AppHandle, repo_root: &Path) -> Result<String, String> {
    let key = signing_key_path(repo_root);
    if !key.is_file() {
        return Err(format!(
            "updater signing key not found at {} — generate one with \
             `cargo tauri signer generate -w .tauri-signing/ruxer.key --password \"\"` \
             (the pubkey in tauri.conf.json must match)",
            key.display()
        ));
    }
    // NOTE: pass the key CONTENT via TAURI_SIGNING_PRIVATE_KEY. tauri-cli
    // 2.11's bundler ignores the TAURI_SIGNING_PRIVATE_KEY_PATH variant its
    // own keygen output advertises — verified live: with only _PATH set, the
    // build ends with "A public key has been found, but no private key".
    let key_content = std::fs::read_to_string(&key)
        .map_err(|e| format!("failed to read signing key {}: {e}", key.display()))?;
    emit_log(app, "info", "Starting Windows build (cargo tauri build)...");
    run_streamed(
        app,
        Command::new("cargo")
            .args(["tauri", "build"])
            .env("TAURI_SIGNING_PRIVATE_KEY", key_content.trim())
            .env("TAURI_SIGNING_PRIVATE_KEY_PASSWORD", "")
            .current_dir(repo_root),
        &[],
    )?;
    Ok("Windows build finished — see target/release/bundle/".into())
}

/// Native (ext4) directory inside the WSL distro's own filesystem that Linux
/// build output is written to — see the big comment in `build_linux_via_wsl`
/// for why this can't be the repo's own `target/` on the Windows drive.
pub const LINUX_TARGET_DIR: &str = "$HOME/.cache/fluxer-linux-build/target";

/// Build the Linux bundle (AppImage only, per `bundle.targets` in
/// tauri.conf.json) by shelling into WSL2 and running `cargo tauri build`
/// there, reading SOURCE from the Windows checkout (via its
/// `/mnt/<drive>/...` passthrough mount) but writing build OUTPUT to a
/// native Linux path.
pub fn build_linux_via_wsl(app: &AppHandle, repo_root: &Path) -> Result<String, String> {
    let distro = build_distro().map_err(|e| {
        format!(
            "{e}\n\nInstall a distro with Tauri's Linux deps (webkit2gtk, \
             libayatana-appindicator3, build-essential, rustup) before building for Linux."
        )
    })?;
    let wsl_path = windows_path_to_wsl(repo_root)?;
    emit_log(
        app,
        "info",
        format!("Starting Linux build in {distro} (WSL2) at {wsl_path} ..."),
    );
    // The repo's `.cargo/config.toml` sets `rustc-wrapper = "sccache"` for
    // fast Windows rebuilds. WSL shares that same repo checkout (it's the
    // same file at /mnt/<drive>/...), so it inherits that setting too — but a
    // freshly provisioned Linux distro won't have `sccache` on PATH, and
    // cargo hard-fails with a confusing "could not execute process" error
    // rather than just skipping the wrapper. Detect that up front and unset
    // it for this invocation only, so a fresh distro still builds (slower,
    // uncached) instead of failing outright.
    let (mut probe_cmd, probe_stdin) = wsl_bash_script(&distro, "command -v sccache");
    let has_sccache = run_with_stdin(&mut probe_cmd, &probe_stdin)
        .map(|status| status.success())
        .unwrap_or(false);
    if !has_sccache {
        emit_log(
            app,
            "info",
            "sccache not found in this WSL distro; building without the compile cache (slower, \
             but still correct). Run `cargo install sccache --locked` inside the distro to \
             speed up future Linux builds.",
        );
    }
    // `RUSTC_WRAPPER=""` (empty, not unset) is cargo's documented way to
    // override/disable a `rustc-wrapper` set in `.cargo/config.toml` — an
    // unset env var does NOT win over the config file, since cargo only
    // falls back to the config value when the env var is absent, not when
    // it's empty.
    let cargo_env_prefix = if has_sccache {
        String::new()
    } else {
        "export RUSTC_WRAPPER=''; ".to_string()
    };

    // CARGO_TARGET_DIR forces build output onto WSL's own ext4 filesystem
    // instead of the repo's `target/` on the Windows-mounted drive
    // (`/mnt/<drive>/...`, backed by the 9p/DrvFs protocol). This is NOT
    // optional: sccache (and cargo's own build-script output handling) sets
    // Unix file permissions on every artifact it writes, and DrvFs randomly
    // fails those permission-set calls on freshly created files with ENOENT
    // ("No such file or directory") even though the file demonstrably
    // exists — a known WSL2/DrvFs limitation, not a cargo or sccache bug.
    // Reading SOURCE from `/mnt/<drive>/...` is fine (pure reads); it's
    // WRITING build artifacts there from Linux that's unreliable. mkdir -p
    // guarantees the target dir exists before cargo tries to use it.
    // Updater signing: same key file as the Windows build, read through the
    // /mnt passthrough (read-only access is fine on DrvFs).
    let key = signing_key_path(repo_root);
    if !key.is_file() {
        return Err(format!(
            "updater signing key not found at {} — generate one with \
             `cargo tauri signer generate -w .tauri-signing/ruxer.key --password \"\"`",
            key.display()
        ));
    }
    let wsl_key_path = format!("{wsl_path}/.tauri-signing/ruxer.key");

    // Key CONTENT, not the _PATH variant — see build_windows for why.
    let script = format!(
        "{cargo_env_prefix}export TAURI_SIGNING_PRIVATE_KEY=\"$(cat '{wsl_key_path}')\" && \
         export TAURI_SIGNING_PRIVATE_KEY_PASSWORD='' && \
         mkdir -p {LINUX_TARGET_DIR} && export CARGO_TARGET_DIR={LINUX_TARGET_DIR} && cd '{wsl_path}' && cargo tauri build"
    );
    // Explicitly target `distro` with `-d` — the plain `wsl` invocation
    // targets whatever WSL considers the DEFAULT distro, which is commonly
    // `docker-desktop` (a minimal VM with no bash) even when a real distro
    // like Ubuntu is also installed and working. The `-l` in `bash -ls`
    // loads the distro's login-shell PATH (cargo, rustup) that a bare
    // non-interactive `wsl` invocation otherwise misses.
    let (mut cmd, stdin) = wsl_bash_script(&distro, &script);
    run_streamed(app, &mut cmd, &stdin)?;
    Ok(format!(
        "Linux build finished — bundles at ~/.cache/fluxer-linux-build/target/release/bundle/ \
         inside {distro} (zip it from this GUI to get a Windows-visible copy)"
    ))
}

/// Convert a Windows path (`E:\RUST\ai-programs\fluxer-rust`) to the WSL
/// mount path (`/mnt/e/RUST/ai-programs/fluxer-rust`) WSL2 exposes for every
/// Windows drive by default.
pub fn windows_path_to_wsl(path: &Path) -> Result<String, String> {
    let s = path.to_string_lossy();
    let mut chars = s.chars();
    let drive = chars
        .next()
        .filter(|c| c.is_ascii_alphabetic())
        .ok_or_else(|| format!("not a drive-letter path: {s}"))?;
    let rest = chars.as_str();
    let rest = rest.strip_prefix(':').unwrap_or(rest);
    let rest = rest.replace('\\', "/");
    Ok(format!("/mnt/{}{}", drive.to_ascii_lowercase(), rest))
}

/// Spawn `cmd` (writing `stdin_bytes` to its stdin, empty slice = none) with
/// piped stdout/stderr and forward every line to the frontend via
/// `build-log` events as it arrives (not buffered until exit), so the GUI
/// shows real progress on a multi-minute build. Returns an error with the
/// exit code if the process fails.
pub(crate) fn run_streamed(
    app: &AppHandle,
    cmd: &mut Command,
    stdin_bytes: &[u8],
) -> Result<(), String> {
    let mut child = cmd
        .stdin(if stdin_bytes.is_empty() {
            Stdio::null()
        } else {
            Stdio::piped()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn process: {e}"))?;

    if !stdin_bytes.is_empty() {
        let mut stdin = child.stdin.take().expect("piped stdin");
        let bytes = stdin_bytes.to_vec();
        std::thread::spawn(move || {
            let _ = stdin.write_all(&bytes);
            // Drop closes the pipe, signaling EOF so `bash -s` proceeds past
            // reading its script.
        });
    }

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

    let app_out = app.clone();
    let out_handle = std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            emit_log(&app_out, "stdout", line);
        }
    });
    let app_err = app.clone();
    let err_handle = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            emit_log(&app_err, "stderr", line);
        }
    });

    let status = child
        .wait()
        .map_err(|e| format!("failed to wait on process: {e}"))?;
    let _ = out_handle.join();
    let _ = err_handle.join();

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "process exited with {}",
            status
                .code()
                .map(|c| c.to_string())
                .unwrap_or_else(|| "unknown status".into())
        ))
    }
}

/// Run `cmd` to completion (no live streaming) piping `stdin_bytes` to it —
/// for quick one-shot probes like "does this command exist in the distro".
fn run_with_stdin(cmd: &mut Command, stdin_bytes: &[u8]) -> std::io::Result<std::process::ExitStatus> {
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    child
        .stdin
        .take()
        .expect("piped stdin")
        .write_all(stdin_bytes)?;
    child.wait()
}
