// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::gateway::{GatewayNode, gateway_dir};
use anyhow::{Context, Result, bail};
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{Receiver, channel};
use std::time::{Duration, Instant, SystemTime};

const WATCH_POLL_INTERVAL: Duration = Duration::from_millis(1000);
const WATCH_SETTLE_INTERVAL: Duration = Duration::from_millis(300);
const RELOAD_TIMEOUT: Duration = Duration::from_secs(60);
const WATCHED_SOURCE_EXTENSIONS: &[&str] = &["erl", "hrl", "src", "rs", "toml", "config"];

pub type FileState = BTreeMap<PathBuf, (SystemTime, u64)>;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ArtifactState {
    pub beams: FileState,
    pub nifs: FileState,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ArtifactDiff {
    pub modules: Vec<String>,
    pub nifs_changed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ReloadOutcome {
    pub failed_nodes: Vec<String>,
}

pub fn hot_reload_enabled() -> bool {
    env::var("FLUXER_DEV_GATEWAY_HOT_RELOAD")
        .map(|value| !matches!(value.to_ascii_lowercase().as_str(), "0" | "false" | "no"))
        .unwrap_or(true)
}

pub fn spawn_source_watcher() -> Receiver<()> {
    let (sender, receiver) = channel();
    std::thread::spawn(move || {
        let mut previous = scan_sources();
        loop {
            std::thread::sleep(WATCH_POLL_INTERVAL);
            let mut current = scan_sources();
            if current == previous {
                continue;
            }
            loop {
                std::thread::sleep(WATCH_SETTLE_INTERVAL);
                let settled = scan_sources();
                if settled == current {
                    break;
                }
                current = settled;
            }
            previous = current;
            if sender.send(()).is_err() {
                return;
            }
        }
    });
    receiver
}

fn scan_sources() -> FileState {
    let dir = gateway_dir();
    let mut state = FileState::new();
    for root in [dir.join("src"), dir.join("include"), dir.join("native")] {
        scan_tree(&mut state, &root);
    }
    for path in [
        dir.join("rebar.config"),
        dir.join("rebar.config.script"),
        dir.join("rebar.lock"),
    ] {
        record_file(&mut state, &path);
    }
    state
}

fn scan_tree(state: &mut FileState, root: &Path) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.is_dir() {
            if !is_skipped_dir(&path) {
                scan_tree(state, &path);
            }
        } else if is_watched_source(&path)
            && let Ok(modified) = metadata.modified()
        {
            state.insert(path, (modified, metadata.len()));
        }
    }
}

fn record_file(state: &mut FileState, path: &Path) {
    if let Ok(metadata) = fs::metadata(path)
        && let Ok(modified) = metadata.modified()
    {
        state.insert(path.to_path_buf(), (modified, metadata.len()));
    }
}

fn is_skipped_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "target" || name.starts_with('.'))
}

fn is_watched_source(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| WATCHED_SOURCE_EXTENSIONS.contains(&extension))
}

pub fn snapshot_artifacts() -> ArtifactState {
    let mut state = ArtifactState::default();
    let lib_root = gateway_dir().join("_build/default/lib");
    if let Ok(entries) = fs::read_dir(&lib_root) {
        for entry in entries.flatten() {
            scan_artifact_dir(&mut state.beams, &entry.path().join("ebin"), "beam");
        }
    }
    scan_artifact_dir(&mut state.nifs, &gateway_dir().join("priv"), "so");
    state
}

fn scan_artifact_dir(state: &mut FileState, dir: &Path, extension: &str) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path
            .extension()
            .is_some_and(|candidate| candidate == extension)
            && let Ok(metadata) = entry.metadata()
            && let Ok(modified) = metadata.modified()
        {
            state.insert(path, (modified, metadata.len()));
        }
    }
}

pub fn changed_artifacts(before: &ArtifactState, after: &ArtifactState) -> ArtifactDiff {
    let modules = after
        .beams
        .iter()
        .filter(|(path, state)| before.beams.get(*path) != Some(*state))
        .filter_map(|(path, _)| Some(path.file_stem()?.to_str()?.to_owned()))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let nifs_changed = after
        .nifs
        .iter()
        .any(|(path, state)| before.nifs.get(path) != Some(state));
    ArtifactDiff {
        modules,
        nifs_changed,
    }
}

pub fn build_reload_eval(nodes: &[String], modules: &[String]) -> String {
    let node_list = nodes
        .iter()
        .map(|node| format!("'{node}'"))
        .collect::<Vec<_>>()
        .join(",");
    let module_list = modules
        .iter()
        .map(|module| format!("'{module}'"))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "Nodes = [{node_list}], \
         Mods = [{module_list}], \
         Failed = [Node || Node <- Nodes, \
            case net_adm:ping(Node) of \
                pong -> \
                    Errors = [Mod || Mod <- Mods, \
                        begin \
                            rpc:call(Node, code, purge, [Mod], 10000), \
                            case rpc:call(Node, code, load_file, [Mod], 10000) of \
                                {{module, Mod}} -> false; \
                                Other -> \
                                    io:format(\"gateway_reload_error ~s ~s ~0p~n\", [Node, Mod, Other]), \
                                    true \
                            end \
                        end], \
                    Errors =/= []; \
                pang -> \
                    io:format(\"gateway_reload_node_down ~s~n\", [Node]), \
                    true \
            end], \
         [io:format(\"gateway_reload_failed_node ~s~n\", [Failed1]) || Failed1 <- Failed], \
         io:format(\"gateway_reload_done~n\"), \
         halt(0)."
    )
}

pub fn hot_reload_modules(
    nodes: &[GatewayNode],
    modules: &[String],
    cookie: &str,
) -> Result<ReloadOutcome> {
    assert!(!modules.is_empty());
    let node_names = nodes
        .iter()
        .map(GatewayNode::erlang_name)
        .collect::<Vec<_>>();
    let eval = build_reload_eval(&node_names, modules);
    let reloader_name = format!("fluxer_dev_reload_{}@127.0.0.1", std::process::id());
    let mut child = Command::new("erl")
        .args([
            "-hidden",
            "-noshell",
            "-name",
            &reloader_name,
            "-setcookie",
            cookie,
            "-eval",
            &eval,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("failed to spawn gateway reload shell")?;
    let stdout = child.stdout.take().map(spawn_reader);
    let stderr = child.stderr.take().map(spawn_reader);
    let status = wait_with_deadline(&mut child, RELOAD_TIMEOUT)?;
    let mut output = String::new();
    for handle in [stdout, stderr].into_iter().flatten() {
        if let Ok(text) = handle.join() {
            output.push_str(&text);
        }
    }
    for line in output.lines().filter(|line| !line.trim().is_empty()) {
        println!("[gateway:reload] {line}");
    }
    if !status.success() {
        bail!(
            "gateway reload shell exited with status {}",
            status.code().unwrap_or(1)
        );
    }
    if !output.lines().any(|line| line == "gateway_reload_done") {
        bail!("gateway reload shell did not report completion");
    }
    Ok(parse_reload_outcome(&output))
}

pub fn parse_reload_outcome(output: &str) -> ReloadOutcome {
    let failed_nodes = output
        .lines()
        .filter_map(|line| line.strip_prefix("gateway_reload_failed_node "))
        .map(|node| node.trim().to_owned())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    ReloadOutcome { failed_nodes }
}

fn spawn_reader(stream: impl Read + Send + 'static) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut reader = stream;
        let mut text = String::new();
        let mut bytes = Vec::new();
        if reader.read_to_end(&mut bytes).is_ok() {
            text = String::from_utf8_lossy(&bytes).into_owned();
        }
        text
    })
}

fn wait_with_deadline(child: &mut Child, timeout: Duration) -> Result<std::process::ExitStatus> {
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            bail!(
                "gateway reload shell timed out after {}s",
                timeout.as_secs()
            );
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file_state(entries: &[(&str, u64, u64)]) -> FileState {
        entries
            .iter()
            .map(|(path, seconds, size)| {
                (
                    PathBuf::from(path),
                    (
                        SystemTime::UNIX_EPOCH + Duration::from_secs(*seconds),
                        *size,
                    ),
                )
            })
            .collect()
    }

    #[test]
    fn changed_artifacts_detects_new_and_modified_beams() {
        let before = ArtifactState {
            beams: file_state(&[("ebin/a.beam", 1, 10), ("ebin/b.beam", 1, 20)]),
            nifs: FileState::new(),
        };
        let after = ArtifactState {
            beams: file_state(&[
                ("ebin/a.beam", 2, 10),
                ("ebin/b.beam", 1, 20),
                ("ebin/c.beam", 1, 30),
            ]),
            nifs: FileState::new(),
        };
        let diff = changed_artifacts(&before, &after);
        assert_eq!(diff.modules, vec!["a".to_owned(), "c".to_owned()]);
        assert!(!diff.nifs_changed);
    }

    #[test]
    fn changed_artifacts_ignores_unchanged_state() {
        let state = ArtifactState {
            beams: file_state(&[("ebin/a.beam", 1, 10)]),
            nifs: file_state(&[("priv/a_nif.so", 1, 10)]),
        };
        let diff = changed_artifacts(&state, &state.clone());
        assert!(diff.modules.is_empty());
        assert!(!diff.nifs_changed);
    }

    #[test]
    fn changed_artifacts_flags_nif_changes() {
        let before = ArtifactState {
            beams: FileState::new(),
            nifs: file_state(&[("priv/a_nif.so", 1, 10)]),
        };
        let after = ArtifactState {
            beams: FileState::new(),
            nifs: file_state(&[("priv/a_nif.so", 2, 11)]),
        };
        assert!(changed_artifacts(&before, &after).nifs_changed);
    }

    #[test]
    fn reload_eval_quotes_nodes_and_modules() {
        let eval = build_reload_eval(
            &["fluxer_gateway_websocket_1@127.0.0.1".to_owned()],
            &["gateway_compress".to_owned(), "push".to_owned()],
        );
        assert!(eval.contains("Nodes = ['fluxer_gateway_websocket_1@127.0.0.1']"));
        assert!(eval.contains("Mods = ['gateway_compress','push']"));
        assert!(eval.contains("halt(0)."));
    }

    #[test]
    fn reload_outcome_parses_failed_nodes() {
        let output = "gateway_reload_error n1 mod {error,nofile}\n\
                      gateway_reload_failed_node fluxer_gateway_guilds_2@127.0.0.1\n\
                      gateway_reload_failed_node fluxer_gateway_guilds_2@127.0.0.1\n\
                      gateway_reload_done\n";
        let outcome = parse_reload_outcome(output);
        assert_eq!(
            outcome.failed_nodes,
            vec!["fluxer_gateway_guilds_2@127.0.0.1".to_owned()]
        );
    }

    #[test]
    fn reload_outcome_empty_when_no_failures() {
        assert!(
            parse_reload_outcome("gateway_reload_done\n")
                .failed_nodes
                .is_empty()
        );
    }

    #[test]
    fn watched_source_filter_accepts_known_extensions() {
        assert!(is_watched_source(Path::new("src/push.erl")));
        assert!(is_watched_source(Path::new("include/gateway.hrl")));
        assert!(is_watched_source(Path::new("src/fluxer_gateway.app.src")));
        assert!(is_watched_source(Path::new("native/a_nif/src/lib.rs")));
        assert!(is_watched_source(Path::new("native/a_nif/Cargo.toml")));
        assert!(!is_watched_source(Path::new("ebin/push.beam")));
        assert!(!is_watched_source(Path::new("src/.push.erl.swp")));
        assert!(!is_watched_source(Path::new("native/a_nif/Cargo.lock")));
    }

    #[test]
    fn skipped_dirs_cover_build_output_and_hidden_dirs() {
        assert!(is_skipped_dir(Path::new("native/a_nif/target")));
        assert!(is_skipped_dir(Path::new("src/.git")));
        assert!(!is_skipped_dir(Path::new("src/gateway")));
    }
}
