// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::paths::{ROOT, which};
use crate::proc::{format_command, merged_env};
use anyhow::{Context, Result, anyhow, bail};
use chrono::Utc;
use serde_json::{Value, json};
use std::env;
use std::ffi::OsString;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Output, Stdio};
use std::time::{Duration, Instant};
use tempfile::TempDir;
use tokio::time::sleep;

const CLUSTER_NAME: &str = "fluxer-hotpatch-it";
const CONTEXT: &str = "kind-fluxer-hotpatch-it";
const NAMESPACE: &str = "fluxer-it";
const API_PORT: u16 = 36443;
const DOCKER_HOST: &str = "unix:///var/run/docker.sock";
const REAL_DOCKER: &str = "/usr/bin/docker";

pub async fn create_cluster() -> Result<()> {
    require_devcontainer()?;
    require_tool("docker")?;
    require_tool("kind")?;
    require_tool("kubectl")?;
    prepare_state_dir()?;
    refuse_foreign_kubeconfig()?;

    let docker_wrapper = make_docker_wrapper()?;
    let command_env = k8s_env(Some(docker_wrapper.path()));
    run_inherit(
        strings(&["docker", "version"]),
        &command_env,
        ROOT.as_path(),
    )?;

    let kind_config = local_k8s_dir().join("kind-config.yaml");
    fs::write(&kind_config, render_kind_config(API_PORT))
        .with_context(|| format!("failed to write {}", kind_config.display()))?;

    let clusters = run_quiet(
        strings(&["kind", "get", "clusters"]),
        &command_env,
        ROOT.as_path(),
        false,
    )?;
    if has_exact_line(&clusters.stdout_text(), CLUSTER_NAME) {
        run_inherit(
            vec![
                "kind".to_owned(),
                "export".to_owned(),
                "kubeconfig".to_owned(),
                "--name".to_owned(),
                CLUSTER_NAME.to_owned(),
                "--kubeconfig".to_owned(),
                kubeconfig().display().to_string(),
            ],
            &command_env,
            ROOT.as_path(),
        )?;
    } else {
        run_inherit(
            vec![
                "kind".to_owned(),
                "create".to_owned(),
                "cluster".to_owned(),
                "--name".to_owned(),
                CLUSTER_NAME.to_owned(),
                "--config".to_owned(),
                kind_config.display().to_string(),
                "--kubeconfig".to_owned(),
                kubeconfig().display().to_string(),
            ],
            &command_env,
            ROOT.as_path(),
        )?;
    }

    run_inherit(
        kubectl_config_args(&[
            "config",
            "set-cluster",
            CONTEXT,
            "--server",
            &format!("https://host.docker.internal:{API_PORT}"),
        ]),
        &command_env,
        ROOT.as_path(),
    )?;
    run_inherit(
        kubectl_config_args(&["config", "set-context", CONTEXT, "--namespace", NAMESPACE]),
        &command_env,
        ROOT.as_path(),
    )?;
    run_inherit(
        kubectl_config_args(&["config", "use-context", CONTEXT]),
        &command_env,
        ROOT.as_path(),
    )?;
    chmod(&kubeconfig(), 0o600)?;
    assert_safe_context()?;

    let mut ready = false;
    for _ in 0..90 {
        let result = run_quiet(
            kubectl_args(&["get", "--raw=/readyz?verbose"]),
            &command_env,
            ROOT.as_path(),
            false,
        )?;
        if result.status.success() {
            ready = true;
            break;
        }
        sleep(Duration::from_secs(2)).await;
    }
    if !ready {
        bail!("local-k8s: kind API server did not become ready");
    }

    let namespace = run_quiet(
        kubectl_args(&["get", "namespace", NAMESPACE]),
        &command_env,
        ROOT.as_path(),
        false,
    )?;
    if !namespace.status.success() {
        run_inherit(
            kubectl_args(&["create", "namespace", NAMESPACE]),
            &command_env,
            ROOT.as_path(),
        )?;
    }

    println!(
        "local kind cluster ready: context={CONTEXT} kubeconfig={} namespace={NAMESPACE}",
        kubeconfig().display()
    );
    Ok(())
}

pub fn run_kubectl_cli(args: &[String]) -> Result<()> {
    require_devcontainer()?;
    require_tool("kubectl")?;
    assert_safe_context()?;
    run_inherit(kubectl_args_owned(args), &k8s_env(None), ROOT.as_path())
}

pub fn run_helm_cli(args: &[String]) -> Result<()> {
    require_devcontainer()?;
    require_tool("helm")?;
    assert_safe_context()?;
    let mut command = strings(&[
        "helm",
        "--kubeconfig",
        &kubeconfig().display().to_string(),
        "--kube-context",
        CONTEXT,
    ]);
    command.extend(args.iter().cloned());
    run_inherit(command, &k8s_env(None), ROOT.as_path())
}

pub async fn run_hotpatch_smoke() -> Result<()> {
    require_devcontainer()?;
    require_tool("docker")?;
    require_tool("kind")?;
    require_tool("kubectl")?;
    require_tool("erl")?;
    assert_safe_context()?;

    let cfg = HotpatchConfig::from_env();
    let docker_wrapper = make_docker_wrapper()?;
    let command_env = k8s_env(Some(docker_wrapper.path()));

    build_hotpatch_runner_image(&cfg, &command_env)?;
    deploy_cassandra(&command_env)?;
    let cassandra = wait_for_cql(&command_env).await?;
    apply_schema(&cassandra, &command_env)?;
    let (public_key, private_key) = generate_signing_key(&command_env)?;
    create_signing_secret(&public_key, &private_key, &command_env)?;

    let producer_total = cfg.producer_event_count + cfg.producer_post_start_event_count;
    run_hotpatch_job(
        "hotpatch-producer",
        cfg.producer_event_count,
        cfg.producer_post_start_event_count,
        cfg.producer_event_count,
        1,
        1,
        &cfg,
        &command_env,
    )?;
    assert_job_audits(
        &cassandra,
        "hotpatch-producer",
        producer_total,
        &cfg,
        &command_env,
    )?;

    run_hotpatch_job(
        "hotpatch-resume",
        0,
        0,
        producer_total,
        1,
        1,
        &cfg,
        &command_env,
    )?;
    assert_job_audits(
        &cassandra,
        "hotpatch-resume",
        producer_total,
        &cfg,
        &command_env,
    )?;

    run_hotpatch_job(
        "hotpatch-parallel",
        cfg.parallel_event_count,
        cfg.parallel_post_start_event_count,
        producer_total,
        cfg.parallel_completions,
        cfg.parallel_completions,
        &cfg,
        &command_env,
    )?;
    let parallel_min = producer_total + cfg.parallel_post_start_event_count;
    assert_job_audits(
        &cassandra,
        "hotpatch-parallel",
        parallel_min,
        &cfg,
        &command_env,
    )?;

    let expected_total = cfg.expected_event_total();
    run_hotpatch_job(
        "hotpatch-final-resume",
        0,
        0,
        expected_total,
        1,
        1,
        &cfg,
        &command_env,
    )?;
    assert_job_audits(
        &cassandra,
        "hotpatch-final-resume",
        expected_total,
        &cfg,
        &command_env,
    )?;
    run_hotpatch_job(
        "hotpatch-cluster-verify",
        0,
        0,
        expected_total,
        cfg.verify_completions,
        cfg.verify_completions,
        &cfg,
        &command_env,
    )?;
    assert_job_audits(
        &cassandra,
        "hotpatch-cluster-verify",
        expected_total,
        &cfg,
        &command_env,
    )?;
    assert_event_count(&cassandra, expected_total, &cfg, &command_env)?;

    if cfg.cleanup_after_run {
        cleanup_hotpatch_run(&command_env)?;
    }

    println!(
        "hotpatch local Kubernetes smoke passed: build_sha={} expected_events={} verify_completions={}",
        cfg.build_sha, expected_total, cfg.verify_completions
    );
    Ok(())
}

pub async fn run_handoff_rollout_smoke() -> Result<()> {
    require_devcontainer()?;
    require_tool("docker")?;
    require_tool("kind")?;
    require_tool("kubectl")?;
    require_tool("erl")?;
    require_tool("erlc")?;
    require_tool("rebar3")?;
    assert_safe_context()?;

    let cfg = HandoffConfig::from_env();
    let docker_wrapper = make_docker_wrapper()?;
    let command_env = k8s_env(Some(docker_wrapper.path()));
    let build_context = tempfile::Builder::new()
        .prefix("fluxer-handoff-rollout-context.")
        .tempdir()?;

    build_handoff_images(&cfg, build_context.path(), &command_env)?;
    apply_values(handoff_controller_rbac(), &command_env)?;

    for cluster in cfg.clusters.split_whitespace() {
        validate_cluster_name(cluster)?;
        println!(
            "handoff rollout smoke starting: cluster={cluster} replicas={} entities={}",
            cfg.replicas, cfg.entity_count
        );
        delete_previous_handoff_cluster_run(cluster, &command_env)?;
        apply_values(handoff_statefulset(cluster, &cfg), &command_env)?;
        run_inherit(
            kubectl_args(&[
                "rollout",
                "status",
                &format!("statefulset/{}", statefulset_name(cluster)),
                "--timeout=240s",
            ]),
            &command_env,
            ROOT.as_path(),
        )?;
        run_handoff_controller_job(cluster, &cfg, &command_env).await?;
        if cfg.cleanup_after_cluster {
            delete_previous_handoff_cluster_run(cluster, &command_env)?;
        }
    }

    println!(
        "handoff rollout local Kubernetes smoke passed: clusters=\"{}\" image_v1={} image_v2={}",
        cfg.clusters, cfg.image_v1, cfg.image_v2
    );
    Ok(())
}

pub fn run_docker_wrapper<I>(args: I) -> i32
where
    I: IntoIterator<Item = OsString>,
{
    let args: Vec<OsString> = args.into_iter().collect();
    let output_file = docker_save_output_file(&args);
    let direct_ok = Command::new(REAL_DOCKER)
        .arg("version")
        .env("DOCKER_HOST", DOCKER_HOST)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false);

    let status = if direct_ok {
        run_real_docker(&args)
    } else {
        run_sudo_docker(&args)
    };
    let code = status_to_code(status);

    if code == 0
        && let Some(path) = output_file
        && path.exists()
    {
        let _ = chown_current_user(&path);
    }
    code
}

fn local_k8s_dir() -> PathBuf {
    ROOT.join(".fluxer/k8s")
}

fn kubeconfig() -> PathBuf {
    local_k8s_dir().join("local-kubeconfig")
}

fn require_devcontainer() -> Result<()> {
    if !ROOT.starts_with("/workspaces") || !Path::new("/.dockerenv").is_file() {
        bail!("local-k8s: run this from inside the Fluxer devcontainer");
    }
    Ok(())
}

fn require_tool(name: &str) -> Result<()> {
    if which(name).is_none() {
        bail!("local-k8s: missing required tool: {name}");
    }
    Ok(())
}

fn prepare_state_dir() -> Result<()> {
    fs::create_dir_all(local_k8s_dir())?;
    chmod(&local_k8s_dir(), 0o700)
}

fn refuse_foreign_kubeconfig() -> Result<()> {
    if !is_non_empty_file(&kubeconfig()) {
        return Ok(());
    }
    let command_env = k8s_env(None);
    let contexts = run_quiet(
        kubectl_config_args(&["config", "get-contexts", "-o", "name"]),
        &command_env,
        ROOT.as_path(),
        false,
    )?
    .stdout_text();
    let current_context = run_quiet(
        kubectl_config_args(&["config", "current-context"]),
        &command_env,
        ROOT.as_path(),
        false,
    )?
    .stdout_text()
    .trim()
    .to_owned();

    let foreign_contexts: Vec<_> = contexts
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter(|line| *line != CONTEXT)
        .collect();
    if !foreign_contexts.is_empty() {
        bail!(
            "local-k8s: {} contains non-local Kubernetes contexts",
            kubeconfig().display()
        );
    }
    if !current_context.is_empty() && current_context != CONTEXT {
        bail!(
            "local-k8s: {} current context is {current_context}, expected {CONTEXT}",
            kubeconfig().display()
        );
    }
    Ok(())
}

fn assert_safe_context() -> Result<()> {
    if !is_non_empty_file(&kubeconfig()) {
        bail!(
            "local-k8s: missing {}; run `fluxer-dev local-k8s create-cluster` first",
            kubeconfig().display()
        );
    }
    let command_env = k8s_env(None);
    let current_context = run_quiet(
        kubectl_config_args(&["config", "current-context"]),
        &command_env,
        ROOT.as_path(),
        false,
    )?
    .stdout_text()
    .trim()
    .to_owned();
    if current_context != CONTEXT {
        bail!(
            "local-k8s: refusing Kubernetes access with context {}; expected {CONTEXT}",
            if current_context.is_empty() {
                "<none>"
            } else {
                &current_context
            }
        );
    }

    let server = run_quiet(
        kubectl_args(&[
            "config",
            "view",
            "--raw",
            "--minify",
            "-o",
            "jsonpath={.clusters[0].cluster.server}",
        ]),
        &command_env,
        ROOT.as_path(),
        false,
    )?
    .stdout_text()
    .trim()
    .to_owned();
    if !is_safe_api_server(&server) {
        bail!(
            "local-k8s: refusing Kubernetes API server {}; expected a local kind endpoint",
            if server.is_empty() { "<none>" } else { &server }
        );
    }
    Ok(())
}

fn is_non_empty_file(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.is_file() && metadata.len() > 0)
        .unwrap_or(false)
}

fn is_safe_api_server(server: &str) -> bool {
    [
        "https://host.docker.internal:",
        "https://127.0.0.1:",
        "https://localhost:",
        "https://0.0.0.0:",
    ]
    .iter()
    .any(|prefix| server.starts_with(prefix))
}

fn render_kind_config(api_port: u16) -> String {
    format!(
        r#"kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  apiServerAddress: "0.0.0.0"
  apiServerPort: {api_port}
kubeadmConfigPatches:
- |
  kind: ClusterConfiguration
  apiServer:
    certSANs:
    - host.docker.internal
    - localhost
    - 127.0.0.1
    - 0.0.0.0
nodes:
- role: control-plane
"#
    )
}

struct DockerWrapper {
    _dir: TempDir,
    path: PathBuf,
}

impl DockerWrapper {
    fn path(&self) -> &Path {
        &self.path
    }
}

fn make_docker_wrapper() -> Result<DockerWrapper> {
    let dir = tempfile::Builder::new()
        .prefix("fluxer-local-k8s-docker.")
        .tempdir()?;
    let target = dir.path().join("docker");
    let current_exe = env::current_exe()?;
    link_or_copy_exe(&current_exe, &target)?;
    Ok(DockerWrapper {
        path: dir.path().to_path_buf(),
        _dir: dir,
    })
}

#[cfg(unix)]
fn link_or_copy_exe(current_exe: &Path, target: &Path) -> Result<()> {
    std::os::unix::fs::symlink(current_exe, target)
        .with_context(|| format!("failed to create {}", target.display()))
}

#[cfg(not(unix))]
fn link_or_copy_exe(current_exe: &Path, target: &Path) -> Result<()> {
    fs::copy(current_exe, target)
        .with_context(|| format!("failed to copy {}", current_exe.display()))?;
    Ok(())
}

fn k8s_env(wrapper_path: Option<&Path>) -> Vec<(String, Option<String>)> {
    let mut command_env = vec![
        ("DOCKER_HOST".to_owned(), Some(DOCKER_HOST.to_owned())),
        (
            "KUBECONFIG".to_owned(),
            Some(kubeconfig().display().to_string()),
        ),
    ];
    if let Some(wrapper_path) = wrapper_path {
        command_env.push(("PATH".to_owned(), Some(prepend_path(wrapper_path))));
    }
    command_env
}

fn prepend_path(path: &Path) -> String {
    let mut paths = vec![path.to_path_buf()];
    if let Some(current) = env::var_os("PATH") {
        paths.extend(env::split_paths(&current));
    }
    env::join_paths(paths)
        .unwrap_or_else(|_| path.as_os_str().to_os_string())
        .to_string_lossy()
        .into_owned()
}

fn strings(args: &[&str]) -> Vec<String> {
    args.iter().map(|arg| (*arg).to_owned()).collect()
}

fn kubectl_config_args(args: &[&str]) -> Vec<String> {
    let mut command = vec![
        "kubectl".to_owned(),
        "--kubeconfig".to_owned(),
        kubeconfig().display().to_string(),
    ];
    command.extend(args.iter().map(|arg| (*arg).to_owned()));
    command
}

fn kubectl_args(args: &[&str]) -> Vec<String> {
    let mut command = vec![
        "kubectl".to_owned(),
        "--kubeconfig".to_owned(),
        kubeconfig().display().to_string(),
        "--context".to_owned(),
        CONTEXT.to_owned(),
    ];
    command.extend(args.iter().map(|arg| (*arg).to_owned()));
    command
}

fn kubectl_args_owned(args: &[String]) -> Vec<String> {
    let mut command = vec![
        "kubectl".to_owned(),
        "--kubeconfig".to_owned(),
        kubeconfig().display().to_string(),
        "--context".to_owned(),
        CONTEXT.to_owned(),
    ];
    command.extend(args.iter().cloned());
    command
}

fn run_inherit(
    args: Vec<String>,
    command_env: &[(String, Option<String>)],
    cwd: &Path,
) -> Result<()> {
    let status = run_status(args, None, command_env, cwd)?;
    if !status.success() {
        bail!("Command failed with exit code {}.", status_code(status));
    }
    Ok(())
}

fn run_with_stdin(
    args: Vec<String>,
    stdin: &str,
    command_env: &[(String, Option<String>)],
    cwd: &Path,
) -> Result<()> {
    let status = run_status(args, Some(stdin), command_env, cwd)?;
    if !status.success() {
        bail!("Command failed with exit code {}.", status_code(status));
    }
    Ok(())
}

fn run_status(
    args: Vec<String>,
    stdin: Option<&str>,
    extra_env: &[(String, Option<String>)],
    cwd: &Path,
) -> Result<ExitStatus> {
    println!("$ {}", format_command(&args));
    let env = merged_env(Some(extra_env), true)?;
    let mut command = Command::new(&args[0]);
    command
        .args(&args[1..])
        .current_dir(cwd)
        .env_clear()
        .envs(env);
    if let Some(stdin_text) = stdin {
        let mut child = command
            .stdin(Stdio::piped())
            .spawn()
            .with_context(|| format!("failed to run {}", format_command(&args)))?;
        child
            .stdin
            .as_mut()
            .ok_or_else(|| anyhow!("failed to open stdin for {}", format_command(&args)))?
            .write_all(stdin_text.as_bytes())?;
        child
            .wait()
            .with_context(|| format!("failed to wait for {}", format_command(&args)))
    } else {
        command
            .status()
            .with_context(|| format!("failed to run {}", format_command(&args)))
    }
}

fn run_capture_print(
    args: Vec<String>,
    command_env: &[(String, Option<String>)],
    cwd: &Path,
) -> Result<CommandOutput> {
    let output = run_output(args, command_env, cwd)?;
    let text = output.combined_text();
    if !text.trim_end().is_empty() {
        println!("{}", text.trim_end());
    }
    if !output.status.success() {
        bail!(
            "Command failed with exit code {}.",
            status_code(output.status)
        );
    }
    Ok(output)
}

fn run_quiet(
    args: Vec<String>,
    command_env: &[(String, Option<String>)],
    cwd: &Path,
    check: bool,
) -> Result<CommandOutput> {
    let output = run_output(args, command_env, cwd)?;
    if check && !output.status.success() {
        bail!(
            "Command failed with exit code {}: {}",
            status_code(output.status),
            output.combined_text().trim_end()
        );
    }
    Ok(output)
}

fn run_output(
    args: Vec<String>,
    extra_env: &[(String, Option<String>)],
    cwd: &Path,
) -> Result<CommandOutput> {
    println!("$ {}", format_command(&args));
    let env = merged_env(Some(extra_env), true)?;
    let output = Command::new(&args[0])
        .args(&args[1..])
        .current_dir(cwd)
        .env_clear()
        .envs(env)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .with_context(|| format!("failed to run {}", format_command(&args)))?;
    Ok(CommandOutput::from(output))
}

struct CommandOutput {
    status: ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

impl CommandOutput {
    fn from(output: Output) -> Self {
        Self {
            status: output.status,
            stdout: output.stdout,
            stderr: output.stderr,
        }
    }

    fn stdout_text(&self) -> String {
        String::from_utf8_lossy(&self.stdout).into_owned()
    }

    fn combined_text(&self) -> String {
        let mut bytes = self.stdout.clone();
        bytes.extend_from_slice(&self.stderr);
        String::from_utf8_lossy(&bytes).into_owned()
    }
}

fn status_code(status: ExitStatus) -> i32 {
    status.code().unwrap_or(1)
}

fn has_exact_line(text: &str, expected: &str) -> bool {
    text.lines().any(|line| line == expected)
}

fn apply_values(values: Vec<Value>, command_env: &[(String, Option<String>)]) -> Result<()> {
    let payload = if values.len() == 1 {
        values.into_iter().next().expect("checked len")
    } else {
        json!({
            "apiVersion": "v1",
            "kind": "List",
            "items": values,
        })
    };
    let text = serde_json::to_string_pretty(&payload)?;
    run_with_stdin(
        kubectl_args(&["apply", "-f", "-"]),
        &text,
        command_env,
        ROOT.as_path(),
    )
}

#[cfg(unix)]
fn chmod(path: &Path, mode: u32) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path)?.permissions();
    permissions.set_mode(mode);
    fs::set_permissions(path, permissions)?;
    Ok(())
}

#[cfg(not(unix))]
fn chmod(_path: &Path, _mode: u32) -> Result<()> {
    Ok(())
}

fn env_string(name: &str, default: impl FnOnce() -> String) -> String {
    env::var(name).unwrap_or_else(|_| default())
}

fn env_u32(name: &str, default: u32) -> u32 {
    env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_bool(name: &str, default: bool) -> bool {
    env::var(name)
        .map(|value| value == "true")
        .unwrap_or(default)
}

fn utc_run_id() -> String {
    Utc::now().format("%Y%m%d%H%M%S").to_string()
}

#[derive(Debug, Clone)]
struct HotpatchConfig {
    build_sha: String,
    runner_image: String,
    producer_event_count: u32,
    producer_post_start_event_count: u32,
    parallel_completions: u32,
    parallel_event_count: u32,
    parallel_post_start_event_count: u32,
    verify_completions: u32,
    max_startup_apply_ms: u32,
    max_live_apply_ms: u32,
    cleanup_after_run: bool,
    job_timeout: String,
}

impl HotpatchConfig {
    fn from_env() -> Self {
        let parallel_completions = env_u32("PARALLEL_COMPLETIONS", 3);
        Self {
            build_sha: env_string("BUILD_SHA", || format!("hotpatch-it-{}", utc_run_id())),
            runner_image: env_string("RUNNER_IMAGE", || {
                "fluxer-hotpatch-it-runner:local".to_owned()
            }),
            producer_event_count: env_u32("PRODUCER_EVENT_COUNT", 25),
            producer_post_start_event_count: env_u32("PRODUCER_POST_START_EVENT_COUNT", 10),
            parallel_completions,
            parallel_event_count: env_u32("PARALLEL_EVENT_COUNT", 5),
            parallel_post_start_event_count: env_u32("PARALLEL_POST_START_EVENT_COUNT", 2),
            verify_completions: env_u32("VERIFY_COMPLETIONS", parallel_completions),
            max_startup_apply_ms: env_u32("HOTPATCH_MAX_STARTUP_APPLY_MS", 30_000),
            max_live_apply_ms: env_u32("HOTPATCH_MAX_LIVE_APPLY_MS", 30_000),
            cleanup_after_run: env_bool("HOTPATCH_CLEANUP_AFTER_RUN", true),
            job_timeout: env_string("JOB_TIMEOUT", || "600s".to_owned()),
        }
    }

    fn expected_event_total(&self) -> u32 {
        let producer_total = self.producer_event_count + self.producer_post_start_event_count;
        let parallel_total = self.parallel_completions
            * (self.parallel_event_count + self.parallel_post_start_event_count);
        producer_total + parallel_total
    }
}

fn cleanup_hotpatch_run(command_env: &[(String, Option<String>)]) -> Result<()> {
    run_inherit(
        kubectl_args(&[
            "delete",
            "job",
            "hotpatch-producer",
            "hotpatch-resume",
            "hotpatch-parallel",
            "hotpatch-final-resume",
            "hotpatch-cluster-verify",
            "--ignore-not-found=true",
            "--wait=true",
        ]),
        command_env,
        ROOT.as_path(),
    )?;
    run_inherit(
        kubectl_args(&[
            "delete",
            "statefulset",
            "hotpatch-cassandra",
            "--ignore-not-found=true",
            "--wait=true",
        ]),
        command_env,
        ROOT.as_path(),
    )?;
    run_inherit(
        kubectl_args(&[
            "delete",
            "pod",
            "-l",
            "app.kubernetes.io/name=hotpatch-cassandra",
            "--ignore-not-found=true",
            "--wait=true",
        ]),
        command_env,
        ROOT.as_path(),
    )?;
    run_inherit(
        kubectl_args(&[
            "delete",
            "service",
            "hotpatch-cassandra",
            "--ignore-not-found=true",
        ]),
        command_env,
        ROOT.as_path(),
    )?;
    run_inherit(
        kubectl_args(&[
            "delete",
            "secret",
            "hotpatch-signing",
            "--ignore-not-found=true",
        ]),
        command_env,
        ROOT.as_path(),
    )
}

fn build_hotpatch_runner_image(
    cfg: &HotpatchConfig,
    command_env: &[(String, Option<String>)],
) -> Result<()> {
    run_inherit(
        vec![
            "docker".to_owned(),
            "build".to_owned(),
            "-f".to_owned(),
            ROOT.join("scripts/local-k8s/Dockerfile.hotpatch-it")
                .display()
                .to_string(),
            "-t".to_owned(),
            cfg.runner_image.clone(),
            ROOT.display().to_string(),
        ],
        command_env,
        ROOT.as_path(),
    )?;
    run_inherit(
        vec![
            "kind".to_owned(),
            "load".to_owned(),
            "docker-image".to_owned(),
            "--name".to_owned(),
            CLUSTER_NAME.to_owned(),
            cfg.runner_image.clone(),
        ],
        command_env,
        ROOT.as_path(),
    )
}

fn deploy_cassandra(command_env: &[(String, Option<String>)]) -> Result<()> {
    apply_values(hotpatch_cassandra_manifest(), command_env)?;
    run_inherit(
        kubectl_args(&[
            "rollout",
            "status",
            "statefulset/hotpatch-cassandra",
            "--timeout=300s",
        ]),
        command_env,
        ROOT.as_path(),
    )
}

fn hotpatch_cassandra_manifest() -> Vec<Value> {
    vec![
        json!({
            "apiVersion": "v1",
            "kind": "Service",
            "metadata": {
                "name": "hotpatch-cassandra",
                "labels": {"app.kubernetes.io/name": "hotpatch-cassandra"},
            },
            "spec": {
                "selector": {"app.kubernetes.io/name": "hotpatch-cassandra"},
                "ports": [{"name": "cql", "port": 9042, "targetPort": 9042}],
            },
        }),
        json!({
            "apiVersion": "apps/v1",
            "kind": "StatefulSet",
            "metadata": {
                "name": "hotpatch-cassandra",
                "labels": {"app.kubernetes.io/name": "hotpatch-cassandra"},
            },
            "spec": {
                "serviceName": "hotpatch-cassandra",
                "replicas": 1,
                "selector": {"matchLabels": {"app.kubernetes.io/name": "hotpatch-cassandra"}},
                "template": {
                    "metadata": {"labels": {"app.kubernetes.io/name": "hotpatch-cassandra"}},
                    "spec": {
                        "containers": [{
                            "name": "cassandra",
                            "image": "cassandra:5.0.8",
                            "imagePullPolicy": "IfNotPresent",
                            "ports": [{"name": "cql", "containerPort": 9042}],
                            "env": [
                                {"name": "CASSANDRA_CLUSTER_NAME", "value": "fluxer-hotpatch-it"},
                                {"name": "CASSANDRA_DC", "value": "datacenter1"},
                                {"name": "CASSANDRA_ENDPOINT_SNITCH", "value": "GossipingPropertyFileSnitch"},
                                {"name": "HEAP_NEWSIZE", "value": "128M"},
                                {"name": "MAX_HEAP_SIZE", "value": "768M"},
                            ],
                            "readinessProbe": {
                                "tcpSocket": {"port": 9042},
                                "initialDelaySeconds": 20,
                                "periodSeconds": 5,
                                "failureThreshold": 24,
                            },
                            "volumeMounts": [{"name": "data", "mountPath": "/var/lib/cassandra"}],
                        }],
                        "volumes": [{"name": "data", "emptyDir": {}}],
                    },
                },
            },
        }),
    ]
}

async fn wait_for_cql(command_env: &[(String, Option<String>)]) -> Result<String> {
    let pod = cassandra_pod(command_env)?;
    for _ in 0..90 {
        let result = run_quiet(
            kubectl_args(&[
                "exec",
                &pod,
                "--",
                "cqlsh",
                "-e",
                "SELECT release_version FROM system.local;",
            ]),
            command_env,
            ROOT.as_path(),
            false,
        )?;
        if result.status.success() {
            return Ok(pod);
        }
        sleep(Duration::from_secs(5)).await;
    }
    bail!("local-k8s: Cassandra CQL did not become ready");
}

fn cassandra_pod(command_env: &[(String, Option<String>)]) -> Result<String> {
    let output = run_quiet(
        kubectl_args(&[
            "get",
            "pod",
            "-l",
            "app.kubernetes.io/name=hotpatch-cassandra",
            "-o",
            "jsonpath={.items[0].metadata.name}",
        ]),
        command_env,
        ROOT.as_path(),
        true,
    )?;
    Ok(output.stdout_text().trim().to_owned())
}

fn apply_schema(pod: &str, command_env: &[(String, Option<String>)]) -> Result<()> {
    run_with_stdin(
        kubectl_args(&["exec", "-i", pod, "--", "cqlsh"]),
        HOTPATCH_SCHEMA,
        command_env,
        ROOT.as_path(),
    )
}

const HOTPATCH_SCHEMA: &str = r#"CREATE KEYSPACE IF NOT EXISTS fluxer
WITH replication = {'class': 'SimpleStrategy', 'replication_factor': '1'};

CREATE TABLE IF NOT EXISTS fluxer.gateway_hotpatch_events_by_build (
    build_sha text,
    event_id timeuuid,
    schema_version int,
    kind text,
    created_at timestamp,
    created_by text,
    signer_key_id text,
    bundle_sha256 blob,
    signature blob,
    bundle blob,
    PRIMARY KEY ((build_sha), event_id)
) WITH CLUSTERING ORDER BY (event_id ASC);

CREATE TABLE IF NOT EXISTS fluxer.gateway_hotpatch_applied_by_node (
    build_sha text,
    node_name text,
    event_id timeuuid,
    applied_at timestamp,
    module_count int,
    bundle_sha256 blob,
    status text,
    error text,
    PRIMARY KEY ((build_sha, node_name), event_id)
) WITH CLUSTERING ORDER BY (event_id ASC);
"#;

fn generate_signing_key(command_env: &[(String, Option<String>)]) -> Result<(String, String)> {
    let output = run_quiet(
        strings(&[
            "erl",
            "-noshell",
            "-eval",
            r#"{PublicKey, PrivateKey} = crypto:generate_key(eddsa, ed25519), io:format("~ts ~ts~n", [base64:encode(PublicKey), base64:encode(PrivateKey)]), halt(0)."#,
        ]),
        command_env,
        ROOT.as_path(),
        true,
    )?;
    let text = output.stdout_text();
    let mut parts = text.split_whitespace();
    let public_key = parts
        .next()
        .ok_or_else(|| anyhow!("erl did not print a public signing key"))?
        .to_owned();
    let private_key = parts
        .next()
        .ok_or_else(|| anyhow!("erl did not print a private signing key"))?
        .to_owned();
    Ok((public_key, private_key))
}

fn create_signing_secret(
    public_key: &str,
    private_key: &str,
    command_env: &[(String, Option<String>)],
) -> Result<()> {
    let secret = run_quiet(
        kubectl_args(&[
            "create",
            "secret",
            "generic",
            "hotpatch-signing",
            &format!("--from-literal=public_keys=ops:{public_key}"),
            &format!("--from-literal=private_key_base64={private_key}"),
            "--dry-run=client",
            "-o",
            "json",
        ]),
        command_env,
        ROOT.as_path(),
        true,
    )?;
    run_with_stdin(
        kubectl_args(&["apply", "-f", "-"]),
        &secret.stdout_text(),
        command_env,
        ROOT.as_path(),
    )
}

fn delete_job_if_present(name: &str, command_env: &[(String, Option<String>)]) -> Result<()> {
    run_inherit(
        kubectl_args(&["delete", "job", name, "--ignore-not-found=true"]),
        command_env,
        ROOT.as_path(),
    )
}

#[allow(clippy::too_many_arguments)]
fn run_hotpatch_job(
    name: &str,
    event_count: u32,
    post_start_event_count: u32,
    expect_event_count: u32,
    completions: u32,
    parallelism: u32,
    cfg: &HotpatchConfig,
    command_env: &[(String, Option<String>)],
) -> Result<()> {
    delete_job_if_present(name, command_env)?;
    apply_values(
        vec![hotpatch_job_manifest(
            name,
            event_count,
            post_start_event_count,
            expect_event_count,
            completions,
            parallelism,
            cfg,
        )],
        command_env,
    )?;
    let wait = run_quiet(
        kubectl_args(&[
            "wait",
            "--for=condition=complete",
            &format!("job/{name}"),
            &format!("--timeout={}", cfg.job_timeout),
        ]),
        command_env,
        ROOT.as_path(),
        false,
    )?;
    if !wait.status.success() {
        let _ = run_capture_print(
            kubectl_args(&["describe", &format!("job/{name}")]),
            command_env,
            ROOT.as_path(),
        );
        let _ = run_capture_print(
            kubectl_args(&[
                "logs",
                &format!("job/{name}"),
                "--all-containers=true",
                "--tail=-1",
            ]),
            command_env,
            ROOT.as_path(),
        );
        bail!("local-k8s: hotpatch job {name} failed");
    }
    run_capture_print(
        kubectl_args(&[
            "logs",
            &format!("job/{name}"),
            "--all-containers=true",
            "--tail=-1",
        ]),
        command_env,
        ROOT.as_path(),
    )?;
    Ok(())
}

fn hotpatch_job_manifest(
    name: &str,
    event_count: u32,
    post_start_event_count: u32,
    expect_event_count: u32,
    completions: u32,
    parallelism: u32,
    cfg: &HotpatchConfig,
) -> Value {
    json!({
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {"name": name},
        "spec": {
            "completions": completions,
            "parallelism": parallelism,
            "backoffLimit": 0,
            "activeDeadlineSeconds": 540,
            "template": {
                "spec": {
                    "restartPolicy": "Never",
                    "containers": [{
                        "name": "hotpatch-smoke",
                        "image": cfg.runner_image.clone(),
                        "imagePullPolicy": "IfNotPresent",
                        "workingDir": "/workspaces/fluxer/fluxer_gateway",
                        "command": [
                            "bash",
                            "-lc",
                            "erl -sname hotpatch -pa _build/test/lib/*/ebin -noshell -s gateway_hotpatch_k8s_smoke main"
                        ],
                        "env": [
                            {"name": "BUILD_SHA", "value": cfg.build_sha.clone()},
                            {"name": "FLUXER_GATEWAY_HOTPATCH_ENABLED", "value": "true"},
                            {"name": "FLUXER_GATEWAY_LOGGER_LEVEL", "value": "warning"},
                            {"name": "FLUXER_GATEWAY_HOTPATCH_CASSANDRA_HOSTS", "value": format!("hotpatch-cassandra.{NAMESPACE}.svc.cluster.local")},
                            {"name": "FLUXER_GATEWAY_HOTPATCH_CASSANDRA_PORT", "value": "9042"},
                            {"name": "FLUXER_GATEWAY_HOTPATCH_CASSANDRA_KEYSPACE", "value": "fluxer"},
                            {"name": "FLUXER_GATEWAY_HOTPATCH_POLL_INTERVAL_MS", "value": "1000"},
                            {"name": "FLUXER_GATEWAY_HOTPATCH_STARTUP_SYNC_TIMEOUT_MS", "value": "120000"},
                            {"name": "HOTPATCH_EVENT_COUNT", "value": event_count.to_string()},
                            {"name": "HOTPATCH_POST_START_EVENT_COUNT", "value": post_start_event_count.to_string()},
                            {"name": "HOTPATCH_EXPECT_EVENT_COUNT", "value": expect_event_count.to_string()},
                            {"name": "HOTPATCH_TIMEOUT_MS", "value": "120000"},
                            {"name": "HOTPATCH_MAX_STARTUP_APPLY_MS", "value": cfg.max_startup_apply_ms.to_string()},
                            {"name": "HOTPATCH_MAX_LIVE_APPLY_MS", "value": cfg.max_live_apply_ms.to_string()},
                            {
                                "name": "FLUXER_GATEWAY_HOTPATCH_PUBLIC_KEYS",
                                "valueFrom": {"secretKeyRef": {"name": "hotpatch-signing", "key": "public_keys"}}
                            },
                            {
                                "name": "FLUXER_GATEWAY_HOTPATCH_PRIVATE_KEY_BASE64",
                                "valueFrom": {"secretKeyRef": {"name": "hotpatch-signing", "key": "private_key_base64"}}
                            },
                        ],
                    }],
                },
            },
        },
    })
}

fn cql_count(
    pod: &str,
    cql: &str,
    command_env: &[(String, Option<String>)],
) -> Result<Option<u32>> {
    let output = run_quiet(
        kubectl_args(&["exec", pod, "--", "cqlsh", "-k", "fluxer", "-e", cql]),
        command_env,
        ROOT.as_path(),
        true,
    )?;
    Ok(parse_first_integer_line(&output.stdout_text()))
}

fn parse_first_integer_line(text: &str) -> Option<u32> {
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && line.bytes().all(|byte| byte.is_ascii_digit()))
        .and_then(|line| line.parse().ok())
}

fn job_pods(name: &str, command_env: &[(String, Option<String>)]) -> Result<Vec<String>> {
    let output = run_quiet(
        kubectl_args(&[
            "get",
            "pods",
            "-l",
            &format!("job-name={name}"),
            "-o",
            "jsonpath={range .items[*]}{.metadata.name}{\"\\n\"}{end}",
        ]),
        command_env,
        ROOT.as_path(),
        true,
    )?;
    Ok(output
        .stdout_text()
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.trim().to_owned())
        .collect())
}

fn assert_job_audits(
    pod: &str,
    job: &str,
    expected: u32,
    cfg: &HotpatchConfig,
    command_env: &[(String, Option<String>)],
) -> Result<()> {
    let pod_names = job_pods(job, command_env)?;
    if pod_names.is_empty() {
        bail!("local-k8s: expected at least one pod for hotpatch job {job}");
    }
    for pod_name in &pod_names {
        let node_name = format!("hotpatch@{pod_name}");
        let actual = cql_count(
            pod,
            &format!(
                "SELECT COUNT(*) FROM gateway_hotpatch_applied_by_node WHERE build_sha = '{}' AND node_name = '{}';",
                cfg.build_sha, node_name
            ),
            command_env,
        )?;
        if actual.unwrap_or(0) < expected {
            bail!(
                "local-k8s: expected node {node_name} from job {job} to audit at least {expected} hotpatch events, got {}",
                actual
                    .map(|count| count.to_string())
                    .unwrap_or_else(|| "<none>".to_owned())
            );
        }
    }
    println!(
        "verified hotpatch audits for job {job}: pods={} expected_events_per_pod={expected}",
        pod_names.len()
    );
    Ok(())
}

fn assert_event_count(
    pod: &str,
    expected: u32,
    cfg: &HotpatchConfig,
    command_env: &[(String, Option<String>)],
) -> Result<()> {
    let actual = cql_count(
        pod,
        &format!(
            "SELECT COUNT(*) FROM gateway_hotpatch_events_by_build WHERE build_sha = '{}';",
            cfg.build_sha
        ),
        command_env,
    )?;
    if actual.unwrap_or(0) < expected {
        bail!(
            "local-k8s: expected at least {expected} hotpatch events for {}, got {}",
            cfg.build_sha,
            actual
                .map(|count| count.to_string())
                .unwrap_or_else(|| "<none>".to_owned())
        );
    }
    println!(
        "verified {} hotpatch events for build {}",
        actual.unwrap_or(0),
        cfg.build_sha
    );
    Ok(())
}

#[derive(Debug, Clone)]
struct HandoffConfig {
    image_v1: String,
    image_v2: String,
    clusters: String,
    replicas: u32,
    entity_count: u32,
    workload_concurrency: u32,
    max_increment_latency_ms: u32,
    min_workload_ops: u32,
    erl_flags: String,
    cleanup_after_cluster: bool,
    job_timeout_seconds: u64,
}

impl HandoffConfig {
    fn from_env() -> Self {
        let run_id = env_string("RUN_ID", utc_run_id);
        let image_repo = env_string("HANDOFF_IMAGE_REPO", || {
            format!("fluxer-handoff-rollout-it-{run_id}")
        });
        let entity_count = env_u32("HANDOFF_ENTITY_COUNT", 600);
        Self {
            image_v1: env_string("HANDOFF_IMAGE_V1", || format!("{image_repo}:v1")),
            image_v2: env_string("HANDOFF_IMAGE_V2", || format!("{image_repo}:v2")),
            clusters: env_string("HANDOFF_CLUSTERS", || {
                "sessions presence calls guilds".to_owned()
            }),
            replicas: env_u32("HANDOFF_REPLICAS", 3),
            entity_count,
            workload_concurrency: env_u32("HANDOFF_WORKLOAD_CONCURRENCY", 8),
            max_increment_latency_ms: env_u32("HANDOFF_MAX_INCREMENT_LATENCY_MS", 5000),
            min_workload_ops: env_u32("HANDOFF_MIN_WORKLOAD_OPS", entity_count),
            erl_flags: env_string("HANDOFF_ERL_FLAGS", || "+S 2:2 +A 4".to_owned()),
            cleanup_after_cluster: env_bool("HANDOFF_CLEANUP_AFTER_CLUSTER", true),
            job_timeout_seconds: env_u32("JOB_TIMEOUT_SECONDS", 900) as u64,
        }
    }
}

fn validate_cluster_name(cluster: &str) -> Result<()> {
    if cluster.is_empty()
        || !cluster
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        bail!(
            "local-k8s: invalid handoff cluster name: {}",
            if cluster.is_empty() {
                "<empty>"
            } else {
                cluster
            }
        );
    }
    Ok(())
}

fn statefulset_name(cluster: &str) -> String {
    format!("handoff-rollout-{cluster}")
}

fn service_name(cluster: &str) -> String {
    format!("handoff-rollout-{cluster}-headless")
}

fn controller_job_name(cluster: &str) -> String {
    format!("handoff-rollout-{cluster}-controller")
}

fn build_handoff_images(
    cfg: &HandoffConfig,
    build_context: &Path,
    command_env: &[(String, Option<String>)],
) -> Result<()> {
    prepare_handoff_build_context(build_context, command_env)?;
    for (version, image) in [("v1", &cfg.image_v1), ("v2", &cfg.image_v2)] {
        run_inherit(
            vec![
                "docker".to_owned(),
                "build".to_owned(),
                "--build-arg".to_owned(),
                format!("HANDOFF_IMAGE_VERSION={version}"),
                "-f".to_owned(),
                ROOT.join("scripts/local-k8s/Dockerfile.handoff-rollout-it")
                    .display()
                    .to_string(),
                "-t".to_owned(),
                image.clone(),
                build_context.display().to_string(),
            ],
            command_env,
            ROOT.as_path(),
        )?;
    }
    for image in [&cfg.image_v1, &cfg.image_v2] {
        run_inherit(
            vec![
                "kind".to_owned(),
                "load".to_owned(),
                "docker-image".to_owned(),
                "--name".to_owned(),
                CLUSTER_NAME.to_owned(),
                image.clone(),
            ],
            command_env,
            ROOT.as_path(),
        )?;
    }
    Ok(())
}

fn prepare_handoff_build_context(
    build_context: &Path,
    command_env: &[(String, Option<String>)],
) -> Result<()> {
    let gateway_dir = ROOT.join("fluxer_gateway");
    run_inherit(
        strings(&["rebar3", "as", "test", "compile"]),
        &with_extra(command_env, "GIT_CONFIG_GLOBAL", Some("/dev/null")),
        &gateway_dir,
    )?;
    run_inherit(
        vec![
            "erlc".to_owned(),
            "-I".to_owned(),
            "include".to_owned(),
            "-o".to_owned(),
            "_build/test/lib/fluxer_gateway/ebin".to_owned(),
            "test/gateway_handoff_rollout_k8s_smoke.erl".to_owned(),
        ],
        command_env,
        &gateway_dir,
    )?;

    let source = gateway_dir.join("_build/test/lib/fluxer_gateway/ebin");
    let destination = build_context.join("_build/test/lib/fluxer_gateway/ebin");
    copy_dir_recursive(&source, &destination)
}

fn with_extra(
    command_env: &[(String, Option<String>)],
    key: &str,
    value: Option<&str>,
) -> Vec<(String, Option<String>)> {
    let mut next = command_env.to_vec();
    next.push((key.to_owned(), value.map(str::to_owned)));
    next
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<()> {
    fs::create_dir_all(destination)?;
    for entry in
        fs::read_dir(source).with_context(|| format!("failed to read {}", source.display()))?
    {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            copy_dir_recursive(&source_path, &destination_path)?;
        } else if file_type.is_file() {
            fs::copy(&source_path, &destination_path).with_context(|| {
                format!(
                    "failed to copy {} to {}",
                    source_path.display(),
                    destination_path.display()
                )
            })?;
        }
    }
    Ok(())
}

fn handoff_controller_rbac() -> Vec<Value> {
    vec![
        json!({
            "apiVersion": "v1",
            "kind": "ServiceAccount",
            "metadata": {
                "name": "handoff-rollout-controller",
                "labels": {"app.kubernetes.io/name": "handoff-rollout"},
            },
        }),
        json!({
            "apiVersion": "rbac.authorization.k8s.io/v1",
            "kind": "Role",
            "metadata": {
                "name": "handoff-rollout-controller",
                "labels": {"app.kubernetes.io/name": "handoff-rollout"},
            },
            "rules": [
                {"apiGroups": [""], "resources": ["pods", "pods/log"], "verbs": ["get", "list", "watch"]},
                {"apiGroups": ["apps"], "resources": ["statefulsets"], "verbs": ["get", "list", "watch", "patch", "update"]},
            ],
        }),
        json!({
            "apiVersion": "rbac.authorization.k8s.io/v1",
            "kind": "RoleBinding",
            "metadata": {
                "name": "handoff-rollout-controller",
                "labels": {"app.kubernetes.io/name": "handoff-rollout"},
            },
            "subjects": [{"kind": "ServiceAccount", "name": "handoff-rollout-controller"}],
            "roleRef": {
                "apiGroup": "rbac.authorization.k8s.io",
                "kind": "Role",
                "name": "handoff-rollout-controller",
            },
        }),
    ]
}

fn delete_previous_handoff_cluster_run(
    cluster: &str,
    command_env: &[(String, Option<String>)],
) -> Result<()> {
    let statefulset = statefulset_name(cluster);
    let service = service_name(cluster);
    let job = controller_job_name(cluster);
    run_inherit(
        kubectl_args(&[
            "delete",
            "job",
            &job,
            "--ignore-not-found=true",
            "--wait=true",
        ]),
        command_env,
        ROOT.as_path(),
    )?;
    run_inherit(
        kubectl_args(&[
            "delete",
            "statefulset",
            &statefulset,
            "--ignore-not-found=true",
            "--wait=true",
        ]),
        command_env,
        ROOT.as_path(),
    )?;
    run_inherit(
        kubectl_args(&[
            "delete",
            "pod",
            "-l",
            &format!("app.kubernetes.io/name=handoff-rollout,app.kubernetes.io/instance={cluster}"),
            "--ignore-not-found=true",
            "--wait=true",
        ]),
        command_env,
        ROOT.as_path(),
    )?;
    run_inherit(
        kubectl_args(&["delete", "service", &service, "--ignore-not-found=true"]),
        command_env,
        ROOT.as_path(),
    )
}

fn handoff_statefulset(cluster: &str, cfg: &HandoffConfig) -> Vec<Value> {
    let service = service_name(cluster);
    let statefulset = statefulset_name(cluster);
    vec![
        json!({
            "apiVersion": "v1",
            "kind": "Service",
            "metadata": {
                "name": service,
                "labels": {
                    "app.kubernetes.io/name": "handoff-rollout",
                    "app.kubernetes.io/instance": cluster,
                },
            },
            "spec": {
                "clusterIP": "None",
                "selector": {
                    "app.kubernetes.io/name": "handoff-rollout",
                    "app.kubernetes.io/instance": cluster,
                },
                "ports": [
                    {"name": "epmd", "port": 4369, "targetPort": 4369},
                    {"name": "erl-dist", "port": 9100, "targetPort": 9100},
                ],
            },
        }),
        json!({
            "apiVersion": "apps/v1",
            "kind": "StatefulSet",
            "metadata": {
                "name": statefulset,
                "labels": {
                    "app.kubernetes.io/name": "handoff-rollout",
                    "app.kubernetes.io/instance": cluster,
                },
            },
            "spec": {
                "serviceName": service_name(cluster),
                "replicas": cfg.replicas,
                "updateStrategy": {
                    "type": "RollingUpdate",
                    "rollingUpdate": {"partition": cfg.replicas},
                },
                "selector": {
                    "matchLabels": {
                        "app.kubernetes.io/name": "handoff-rollout",
                        "app.kubernetes.io/instance": cluster,
                    },
                },
                "template": {
                    "metadata": {
                        "labels": {
                            "app.kubernetes.io/name": "handoff-rollout",
                            "app.kubernetes.io/instance": cluster,
                        },
                    },
                    "spec": {
                        "terminationGracePeriodSeconds": 20,
                        "containers": [{
                            "name": "node",
                            "image": cfg.image_v1.clone(),
                            "imagePullPolicy": "IfNotPresent",
                            "ports": [
                                {"name": "epmd", "containerPort": 4369},
                                {"name": "erl-dist", "containerPort": 9100},
                            ],
                            "env": [
                                {"name": "HANDOFF_CLUSTER_NAME", "value": cluster},
                                {"name": "HANDOFF_IMAGE_VERSION", "value": "v1"},
                                {"name": "POD_IP", "valueFrom": {"fieldRef": {"fieldPath": "status.podIP"}}},
                                {"name": "POD_NAMESPACE", "valueFrom": {"fieldRef": {"fieldPath": "metadata.namespace"}}},
                            ],
                            "command": [
                                "bash",
                                "-lc",
                                format!("exec erl {} -name \"handoff@${{POD_IP}}\" -setcookie fluxer_handoff_rollout_it -kernel inet_dist_listen_min 9100 inet_dist_listen_max 9100 -pa _build/test/lib/*/ebin -noshell -s gateway_handoff_rollout_k8s_smoke node_main", cfg.erl_flags),
                            ],
                            "readinessProbe": {
                                "exec": {
                                    "command": [
                                        "bash",
                                        "-lc",
                                        "epmd -names | grep -q \"name handoff at port 9100\" && timeout 1 bash -lc \"</dev/tcp/127.0.0.1/9100\"",
                                    ],
                                },
                                "initialDelaySeconds": 2,
                                "periodSeconds": 2,
                                "failureThreshold": 30,
                            },
                            "resources": {"requests": {"cpu": "50m", "memory": "96Mi"}},
                        }],
                    },
                },
            },
        }),
    ]
}

async fn run_handoff_controller_job(
    cluster: &str,
    cfg: &HandoffConfig,
    command_env: &[(String, Option<String>)],
) -> Result<()> {
    let job = controller_job_name(cluster);
    run_inherit(
        kubectl_args(&[
            "delete",
            "job",
            &job,
            "--ignore-not-found=true",
            "--wait=true",
        ]),
        command_env,
        ROOT.as_path(),
    )?;
    apply_values(vec![handoff_controller_job(cluster, cfg)], command_env)?;
    if !wait_for_handoff_job(&job, cfg.job_timeout_seconds, command_env).await? {
        let _ = run_capture_print(
            kubectl_args(&["describe", &format!("job/{job}")]),
            command_env,
            ROOT.as_path(),
        );
        let _ = run_capture_print(
            kubectl_args(&[
                "logs",
                &format!("job/{job}"),
                "--all-containers=true",
                "--tail=-1",
            ]),
            command_env,
            ROOT.as_path(),
        );
        bail!("local-k8s: handoff controller job {job} failed");
    }
    run_capture_print(
        kubectl_args(&[
            "logs",
            &format!("job/{job}"),
            "--all-containers=true",
            "--tail=-1",
        ]),
        command_env,
        ROOT.as_path(),
    )?;
    Ok(())
}

fn handoff_controller_job(cluster: &str, cfg: &HandoffConfig) -> Value {
    let job = controller_job_name(cluster);
    json!({
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {
            "name": job,
            "labels": {
                "app.kubernetes.io/name": "handoff-rollout",
                "app.kubernetes.io/instance": cluster,
            },
        },
        "spec": {
            "backoffLimit": 0,
            "activeDeadlineSeconds": 840,
            "template": {
                "metadata": {
                    "labels": {
                        "app.kubernetes.io/name": "handoff-rollout",
                        "app.kubernetes.io/instance": cluster,
                    },
                },
                "spec": {
                    "serviceAccountName": "handoff-rollout-controller",
                    "restartPolicy": "Never",
                    "containers": [{
                        "name": "controller",
                        "image": cfg.image_v1.clone(),
                        "imagePullPolicy": "IfNotPresent",
                        "workingDir": "/workspaces/fluxer/fluxer_gateway",
                        "command": [
                            "bash",
                            "-lc",
                            format!("exec erl {} -name \"controller-{cluster}@${{POD_IP}}\" -setcookie fluxer_handoff_rollout_it -kernel inet_dist_listen_min 9100 inet_dist_listen_max 9100 -pa _build/test/lib/*/ebin -noshell -s gateway_handoff_rollout_k8s_smoke controller_main", cfg.erl_flags),
                        ],
                        "env": [
                            {"name": "KUBECONFIG", "value": ""},
                            {"name": "HANDOFF_CLUSTER_NAME", "value": cluster},
                            {"name": "HANDOFF_IMAGE_VERSION", "value": "controller"},
                            {"name": "HANDOFF_IMAGE_V2", "value": cfg.image_v2.clone()},
                            {"name": "HANDOFF_REPLICAS", "value": cfg.replicas.to_string()},
                            {"name": "HANDOFF_ENTITY_COUNT", "value": cfg.entity_count.to_string()},
                            {"name": "HANDOFF_WORKLOAD_CONCURRENCY", "value": cfg.workload_concurrency.to_string()},
                            {"name": "HANDOFF_MAX_INCREMENT_LATENCY_MS", "value": cfg.max_increment_latency_ms.to_string()},
                            {"name": "HANDOFF_MIN_WORKLOAD_OPS", "value": cfg.min_workload_ops.to_string()},
                            {"name": "POD_IP", "valueFrom": {"fieldRef": {"fieldPath": "status.podIP"}}},
                            {"name": "POD_NAMESPACE", "valueFrom": {"fieldRef": {"fieldPath": "metadata.namespace"}}},
                        ],
                        "resources": {"requests": {"cpu": "50m", "memory": "96Mi"}},
                    }],
                },
            },
        },
    })
}

async fn wait_for_handoff_job(
    job: &str,
    timeout_seconds: u64,
    command_env: &[(String, Option<String>)],
) -> Result<bool> {
    let deadline = Instant::now() + Duration::from_secs(timeout_seconds);
    while Instant::now() < deadline {
        let status = run_quiet(
            kubectl_args(&[
                "get",
                &format!("job/{job}"),
                "-o",
                "jsonpath={.status.succeeded},{.status.failed}",
            ]),
            command_env,
            ROOT.as_path(),
            false,
        )?;
        let text = status.stdout_text();
        let (succeeded, failed) = parse_job_status(&text);
        if succeeded == Some(1) {
            return Ok(true);
        }
        if failed.unwrap_or(0) != 0 {
            return Ok(false);
        }
        sleep(Duration::from_secs(2)).await;
    }
    Ok(false)
}

fn parse_job_status(text: &str) -> (Option<u32>, Option<u32>) {
    let mut parts = text.trim().splitn(2, ',');
    let succeeded = parts.next().and_then(|part| {
        let part = part.trim();
        if part.is_empty() {
            None
        } else {
            part.parse().ok()
        }
    });
    let failed = parts.next().and_then(|part| {
        let part = part.trim();
        if part.is_empty() {
            None
        } else {
            part.parse().ok()
        }
    });
    (succeeded, failed)
}

fn docker_save_output_file(args: &[OsString]) -> Option<PathBuf> {
    if args.first().and_then(|arg| arg.to_str()) != Some("save") {
        return None;
    }
    let mut index = 1;
    while index < args.len() {
        let arg = args[index].to_string_lossy();
        if arg == "-o" || arg == "--output" {
            return args.get(index + 1).map(PathBuf::from);
        }
        if let Some(value) = arg.strip_prefix("--output=") {
            return Some(PathBuf::from(value));
        }
        index += 1;
    }
    None
}

fn run_real_docker(args: &[OsString]) -> std::io::Result<ExitStatus> {
    Command::new(REAL_DOCKER)
        .args(args)
        .env("DOCKER_HOST", DOCKER_HOST)
        .status()
}

fn run_sudo_docker(args: &[OsString]) -> std::io::Result<ExitStatus> {
    Command::new("sudo")
        .arg("-n")
        .arg("env")
        .arg(format!("DOCKER_HOST={DOCKER_HOST}"))
        .arg(REAL_DOCKER)
        .args(args)
        .status()
}

fn status_to_code(status: std::io::Result<ExitStatus>) -> i32 {
    match status {
        Ok(status) => status.code().unwrap_or(1),
        Err(error) => {
            eprintln!("docker wrapper: {error}");
            1
        }
    }
}

fn chown_current_user(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        let owner = format!("{}:{}", unsafe { libc::geteuid() }, unsafe {
            libc::getegid()
        });
        let status = Command::new("sudo")
            .arg("-n")
            .arg("chown")
            .arg(owner)
            .arg(path)
            .status()?;
        if !status.success() {
            bail!("sudo chown failed for {}", path.display());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_kind_config_with_local_api_port() {
        let config = render_kind_config(36443);
        assert!(config.contains("apiServerAddress: \"0.0.0.0\""));
        assert!(config.contains("apiServerPort: 36443"));
        assert!(config.contains("- host.docker.internal"));
    }

    #[test]
    fn only_accepts_local_kubernetes_api_servers() {
        assert!(is_safe_api_server("https://host.docker.internal:36443"));
        assert!(is_safe_api_server("https://127.0.0.1:36443"));
        assert!(is_safe_api_server("https://localhost:36443"));
        assert!(!is_safe_api_server("https://example.com:6443"));
        assert!(!is_safe_api_server(""));
    }

    #[test]
    fn validates_handoff_cluster_names() {
        assert!(validate_cluster_name("sessions").is_ok());
        assert!(validate_cluster_name("call-shard-1").is_ok());
        assert!(validate_cluster_name("").is_err());
        assert!(validate_cluster_name("Sessions").is_err());
        assert!(validate_cluster_name("calls_1").is_err());
    }

    #[test]
    fn computes_hotpatch_expected_total() {
        let cfg = HotpatchConfig {
            build_sha: "build".to_owned(),
            runner_image: "runner".to_owned(),
            producer_event_count: 25,
            producer_post_start_event_count: 10,
            parallel_completions: 3,
            parallel_event_count: 5,
            parallel_post_start_event_count: 2,
            verify_completions: 3,
            max_startup_apply_ms: 30_000,
            max_live_apply_ms: 30_000,
            cleanup_after_run: true,
            job_timeout: "600s".to_owned(),
        };
        assert_eq!(cfg.expected_event_total(), 56);
    }

    #[test]
    fn parses_cql_count_output() {
        let output = "\n count\n-------\n    42\n\n(1 rows)\n";
        assert_eq!(parse_first_integer_line(output), Some(42));
        assert_eq!(parse_first_integer_line("no rows"), None);
    }

    #[test]
    fn parses_job_status_output() {
        assert_eq!(parse_job_status("1,"), (Some(1), None));
        assert_eq!(parse_job_status(",2"), (None, Some(2)));
        assert_eq!(parse_job_status("0,0"), (Some(0), Some(0)));
    }

    #[test]
    fn parses_docker_save_output_flags() {
        assert_eq!(
            docker_save_output_file(&[
                OsString::from("save"),
                OsString::from("-o"),
                OsString::from("/tmp/image.tar"),
                OsString::from("image:tag"),
            ]),
            Some(PathBuf::from("/tmp/image.tar"))
        );
        assert_eq!(
            docker_save_output_file(&[
                OsString::from("save"),
                OsString::from("--output=/tmp/image.tar"),
            ]),
            Some(PathBuf::from("/tmp/image.tar"))
        );
        assert_eq!(docker_save_output_file(&[OsString::from("pull")]), None);
    }

    #[test]
    fn builds_hotpatch_job_manifest() {
        let cfg = HotpatchConfig {
            build_sha: "build-sha".to_owned(),
            runner_image: "runner:local".to_owned(),
            producer_event_count: 25,
            producer_post_start_event_count: 10,
            parallel_completions: 3,
            parallel_event_count: 5,
            parallel_post_start_event_count: 2,
            verify_completions: 3,
            max_startup_apply_ms: 30_000,
            max_live_apply_ms: 30_000,
            cleanup_after_run: true,
            job_timeout: "600s".to_owned(),
        };
        let manifest = hotpatch_job_manifest("hotpatch-producer", 25, 10, 25, 1, 1, &cfg);
        assert_eq!(manifest["kind"], "Job");
        assert_eq!(manifest["metadata"]["name"], "hotpatch-producer");
        assert_eq!(
            manifest["spec"]["template"]["spec"]["containers"][0]["image"],
            "runner:local"
        );
    }

    #[test]
    fn builds_handoff_resource_names() {
        assert_eq!(statefulset_name("sessions"), "handoff-rollout-sessions");
        assert_eq!(
            service_name("sessions"),
            "handoff-rollout-sessions-headless"
        );
        assert_eq!(
            controller_job_name("sessions"),
            "handoff-rollout-sessions-controller"
        );
    }

    #[test]
    fn builds_handoff_statefulset_manifest() {
        let cfg = HandoffConfig {
            image_v1: "handoff:v1".to_owned(),
            image_v2: "handoff:v2".to_owned(),
            clusters: "sessions".to_owned(),
            replicas: 3,
            entity_count: 600,
            workload_concurrency: 8,
            max_increment_latency_ms: 5000,
            min_workload_ops: 600,
            erl_flags: "+S 2:2 +A 4".to_owned(),
            cleanup_after_cluster: true,
            job_timeout_seconds: 900,
        };
        let manifest = handoff_statefulset("sessions", &cfg);
        assert_eq!(manifest.len(), 2);
        assert_eq!(manifest[0]["kind"], "Service");
        assert_eq!(manifest[1]["kind"], "StatefulSet");
        assert_eq!(manifest[1]["spec"]["replicas"], 3);
        assert_eq!(
            manifest[1]["spec"]["template"]["spec"]["containers"][0]["image"],
            "handoff:v1"
        );
    }
}
