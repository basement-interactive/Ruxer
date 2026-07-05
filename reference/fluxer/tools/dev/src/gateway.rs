// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::gateway_reload::{
    ArtifactState, changed_artifacts, hot_reload_enabled, hot_reload_modules, snapshot_artifacts,
    spawn_source_watcher,
};
use crate::paths::{DEV_GATEWAY_DIR, GATEWAY_CONFIG_DIR, ROOT};
use crate::proc::{
    RESTART_LIMIT, RESTART_WINDOW, RunOptions, ShutdownSignal, format_command, merged_env,
    restart_budget_exceeded, run_command,
};
use anyhow::{Context, Result, bail};
use std::collections::VecDeque;
use std::env;
use std::fs;
use std::net::{SocketAddr, TcpListener};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use tokio::time::sleep;

const GATEWAY_FOREGROUND_EVAL: &str = concat!(
    "case application:ensure_all_started(fluxer_gateway) of ",
    "{ok, _Apps} -> io:format(\"gateway started~n\"), receive after infinity -> ok end; ",
    "Error -> io:format(\"gateway failed: ~p~n\", [Error]), halt(1) end."
);
const GATEWAY_CLUSTER_ROLES: &[&str] = &[
    "websocket",
    "sessions",
    "presence",
    "guilds",
    "calls",
    "push",
];
const GATEWAY_CLUSTER_DEFAULT_REPLICAS: u16 = 3;
const GATEWAY_CLUSTER_DIST_PORT_BASE: u16 = 9001;
const GATEWAY_CLUSTER_COOKIE: &str = "fluxer-dev";
const GATEWAY_COMPILE_COMMAND: &[&str] = &[
    "cargo",
    "run",
    "--locked",
    "--quiet",
    "--manifest-path",
    "tools/ci/Cargo.toml",
    "--",
    "gateway",
    "--step",
    "compile",
];
const NODE_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);
const NODE_RESTART_PORT_WAIT: Duration = Duration::from_secs(75);
const STOP_GRACE_PERIOD: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GatewayNode {
    pub role: String,
    pub ordinal: u16,
    pub http_port: u16,
    pub dist_port: u16,
}

impl GatewayNode {
    pub fn name(&self) -> String {
        format!("{}-{}", self.role, self.ordinal)
    }

    pub fn erlang_name(&self) -> String {
        let prefix = env::var("FLUXER_DEV_GATEWAY_CLUSTER_NODE_PREFIX")
            .unwrap_or_else(|_| "fluxer_gateway".to_owned());
        format!("{prefix}_{}_{}@127.0.0.1", self.role, self.ordinal)
    }

    pub fn config_dir(&self) -> PathBuf {
        DEV_GATEWAY_DIR.join("cluster").join(self.name())
    }
}

pub fn gateway_dir() -> PathBuf {
    ROOT.join("fluxer_gateway")
}

fn gateway_ebin_root() -> PathBuf {
    gateway_dir().join("_build/default/lib")
}

pub fn setup_gateway_config() -> Result<()> {
    write_gateway_config(
        DEV_GATEWAY_DIR.as_path(),
        &env::var("FLUXER_ERLANG_NODE_NAME")
            .unwrap_or_else(|_| "fluxer_gateway@127.0.0.1".to_owned()),
        &env::var("FLUXER_ERLANG_COOKIE").unwrap_or_else(|_| GATEWAY_CLUSTER_COOKIE.to_owned()),
        &env::var("FLUXER_ERLANG_DIST_PORT").unwrap_or_else(|_| "8081".to_owned()),
    )?;
    remove_stale_gateway_config()
}

pub fn write_gateway_config(
    config_dir: &Path,
    node_name: &str,
    cookie: &str,
    dist_port: &str,
) -> Result<()> {
    let sys_template = GATEWAY_CONFIG_DIR.join("sys.config.template");
    let vm_template = GATEWAY_CONFIG_DIR.join("vm.args.template");
    fs::create_dir_all(config_dir)?;
    fs::write(
        config_dir.join("sys.config"),
        fs::read_to_string(sys_template)?,
    )?;
    let vm_text = fs::read_to_string(vm_template)?
        .replace("${FLUXER_ERLANG_NODE_NAME}", node_name)
        .replace("${FLUXER_ERLANG_COOKIE}", cookie)
        .replace("${FLUXER_ERLANG_DIST_PORT}", dist_port);
    fs::write(config_dir.join("vm.args"), vm_text)?;
    Ok(())
}

fn remove_stale_gateway_config() -> Result<()> {
    for path in [
        GATEWAY_CONFIG_DIR.join("sys.config"),
        GATEWAY_CONFIG_DIR.join("vm.args"),
    ] {
        if path.exists() {
            fs::remove_file(&path)
                .with_context(|| format!("failed to remove {}", path.display()))?;
        }
    }
    Ok(())
}

pub fn run_gateway() -> Result<()> {
    setup_gateway_config()?;
    compile_gateway()?;
    let command = build_gateway_command(DEV_GATEWAY_DIR.as_path())?;
    let env = merged_env(None, true)?;
    println!("$ {}", format_command(&command));

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let err = Command::new(&command[0])
            .args(&command[1..])
            .current_dir(gateway_dir())
            .env_clear()
            .envs(env)
            .exec();
        bail!("failed to exec gateway: {err}");
    }
    #[cfg(not(unix))]
    {
        let status = Command::new(&command[0])
            .args(&command[1..])
            .current_dir(gateway_dir())
            .env_clear()
            .envs(env)
            .status()?;
        std::process::exit(status.code().unwrap_or(1));
    }
}

struct SupervisedNode {
    node: GatewayNode,
    child: Child,
    restarts: VecDeque<Instant>,
}

pub async fn run_gateway_cluster() -> Result<i32> {
    let nodes = build_gateway_cluster_nodes()?;
    cleanup_orphaned_gateway_nodes(&nodes).await?;
    wait_for_cluster_ports_available(&nodes).await?;
    setup_gateway_cluster_config(&nodes)?;
    compile_gateway()?;
    let mut shutdown = ShutdownSignal::new()?;
    let static_peers = nodes
        .iter()
        .map(GatewayNode::erlang_name)
        .collect::<Vec<_>>()
        .join(",");
    let mut supervised = Vec::new();
    print_gateway_cluster_topology(&nodes);
    for node in &nodes {
        supervised.push(SupervisedNode {
            node: node.clone(),
            child: start_node(node, &static_peers)?,
            restarts: VecDeque::new(),
        });
    }
    let watcher = hot_reload_enabled().then(spawn_source_watcher);
    if watcher.is_some() {
        println!(
            "Gateway hot reload enabled; watching fluxer_gateway sources (set FLUXER_DEV_GATEWAY_HOT_RELOAD=false to disable)"
        );
    }
    let mut compile: Option<(tokio::task::JoinHandle<bool>, ArtifactState)> = None;
    let mut compile_queued = false;
    loop {
        if let Err(error) = restart_exited_nodes(&mut supervised, &static_peers).await {
            stop_supervised(&mut supervised);
            return Err(error);
        }
        if let Some(receiver) = &watcher {
            while receiver.try_recv().is_ok() {
                compile_queued = true;
            }
        }
        if compile_queued && compile.is_none() {
            compile_queued = false;
            println!("Gateway sources changed; recompiling for hot reload...");
            let before = snapshot_artifacts();
            compile = Some((
                tokio::task::spawn_blocking(compile_gateway_for_reload),
                before,
            ));
        }
        if compile
            .as_ref()
            .is_some_and(|(handle, _)| handle.is_finished())
        {
            let (handle, before) = compile.take().expect("compile task present");
            match handle.await {
                Ok(true) => {
                    if let Err(error) =
                        apply_hot_reload(&mut supervised, &before, &static_peers).await
                    {
                        stop_supervised(&mut supervised);
                        return Err(error);
                    }
                }
                Ok(false) => println!(
                    "Gateway compile failed; hot reload skipped (fix the errors and save again)"
                ),
                Err(error) => println!("Gateway compile task failed: {error}"),
            }
        }
        tokio::select! {
            signal = shutdown.recv() => {
                println!("Received {signal}; stopping gateway cluster...");
                stop_supervised(&mut supervised);
                return Ok(0);
            }
            _ = sleep(Duration::from_millis(500)) => {}
        }
    }
}

fn compile_gateway() -> Result<()> {
    run_command(GATEWAY_COMPILE_COMMAND, RunOptions::default()).map(drop)
}

fn compile_gateway_for_reload() -> bool {
    run_command(
        GATEWAY_COMPILE_COMMAND,
        RunOptions {
            check: false,
            ..RunOptions::default()
        },
    )
    .map(|output| output.status.success())
    .unwrap_or(false)
}

fn cluster_cookie() -> String {
    env::var("FLUXER_ERLANG_COOKIE").unwrap_or_else(|_| GATEWAY_CLUSTER_COOKIE.to_owned())
}

async fn restart_exited_nodes(supervised: &mut [SupervisedNode], static_peers: &str) -> Result<()> {
    for entry in supervised.iter_mut() {
        let Some(status) = entry.child.try_wait()? else {
            continue;
        };
        if restart_budget_exceeded(&mut entry.restarts, Instant::now()) {
            bail!(
                "gateway node {} exited with {status} after {RESTART_LIMIT} restarts within {}s; giving up",
                entry.node.name(),
                RESTART_WINDOW.as_secs()
            );
        }
        println!(
            "[gateway:{}] exited with {status}; restarting node",
            entry.node.name()
        );
        restart_node(entry, static_peers).await?;
    }
    Ok(())
}

async fn restart_node(entry: &mut SupervisedNode, static_peers: &str) -> Result<()> {
    if entry.child.try_wait()?.is_none() {
        terminate_process(&mut entry.child);
        let deadline = Instant::now() + NODE_SHUTDOWN_TIMEOUT;
        while entry.child.try_wait()?.is_none() {
            if Instant::now() >= deadline {
                let _ = entry.child.kill();
                let _ = entry.child.wait();
                break;
            }
            sleep(Duration::from_millis(100)).await;
        }
    }
    wait_for_ports_available_until(
        std::slice::from_ref(&entry.node),
        Instant::now() + NODE_RESTART_PORT_WAIT,
    )
    .await?;
    entry.child = start_node(&entry.node, static_peers)?;
    Ok(())
}

async fn apply_hot_reload(
    supervised: &mut [SupervisedNode],
    before: &ArtifactState,
    static_peers: &str,
) -> Result<()> {
    let after = snapshot_artifacts();
    let diff = changed_artifacts(before, &after);
    if diff.nifs_changed {
        println!("Gateway native NIF artifacts changed; rolling restart of all gateway nodes...");
        for entry in supervised.iter_mut() {
            println!("[gateway:{}] restarting for NIF reload", entry.node.name());
            restart_node(entry, static_peers).await?;
        }
        println!("Gateway rolling restart complete");
        return Ok(());
    }
    if diff.modules.is_empty() {
        println!("Gateway compile finished; no module changes to reload");
        return Ok(());
    }
    println!(
        "Hot reloading {} gateway module(s) across {} node(s): {}",
        diff.modules.len(),
        supervised.len(),
        diff.modules.join(", ")
    );
    let nodes = supervised
        .iter()
        .map(|entry| entry.node.clone())
        .collect::<Vec<_>>();
    let modules = diff.modules.clone();
    let cookie = cluster_cookie();
    let outcome =
        tokio::task::spawn_blocking(move || hot_reload_modules(&nodes, &modules, &cookie)).await;
    match outcome {
        Ok(Ok(outcome)) if outcome.failed_nodes.is_empty() => {
            println!(
                "Gateway hot reload complete ({} module(s) live)",
                diff.modules.len()
            );
        }
        Ok(Ok(outcome)) => {
            for entry in supervised.iter_mut() {
                if !outcome.failed_nodes.contains(&entry.node.erlang_name()) {
                    continue;
                }
                if entry.child.try_wait()?.is_some() {
                    continue;
                }
                println!(
                    "[gateway:{}] hot reload failed; restarting node to pick up new code",
                    entry.node.name()
                );
                restart_node(entry, static_peers).await?;
            }
        }
        Ok(Err(error)) => {
            println!("Gateway hot reload failed: {error}; rolling restart of all gateway nodes");
            for entry in supervised.iter_mut() {
                restart_node(entry, static_peers).await?;
            }
        }
        Err(error) => println!("Gateway hot reload task failed: {error}"),
    }
    Ok(())
}

fn stop_supervised(supervised: &mut [SupervisedNode]) {
    let mut children = supervised
        .iter_mut()
        .map(|entry| &mut entry.child)
        .collect::<Vec<_>>();
    stop_child_processes(&mut children);
}

pub fn build_gateway_cluster_nodes() -> Result<Vec<GatewayNode>> {
    let replicas = positive_int_env(
        "FLUXER_DEV_GATEWAY_CLUSTER_REPLICAS",
        GATEWAY_CLUSTER_DEFAULT_REPLICAS,
    );
    if replicas > GATEWAY_CLUSTER_DEFAULT_REPLICAS {
        bail!(
            "FLUXER_DEV_GATEWAY_CLUSTER_REPLICAS={replicas} exceeds the configured local port table ({GATEWAY_CLUSTER_DEFAULT_REPLICAS})"
        );
    }
    let mut nodes = Vec::new();
    let mut dist_port = positive_int_env(
        "FLUXER_DEV_GATEWAY_CLUSTER_DIST_PORT_BASE",
        GATEWAY_CLUSTER_DIST_PORT_BASE,
    );
    let http_port_offset = non_negative_int_env("FLUXER_DEV_GATEWAY_CLUSTER_HTTP_PORT_OFFSET", 0);
    for role in GATEWAY_CLUSTER_ROLES {
        let ports = gateway_cluster_http_ports(role);
        for ordinal in 1..=replicas {
            nodes.push(GatewayNode {
                role: (*role).to_owned(),
                ordinal,
                http_port: ports[(ordinal - 1) as usize] + http_port_offset,
                dist_port,
            });
            dist_port += 1;
        }
    }
    Ok(nodes)
}

fn gateway_cluster_http_ports(role: &str) -> [u16; 3] {
    match role {
        "websocket" => [8771, 8772, 8774],
        "sessions" => [8780, 8781, 8782],
        "presence" => [8790, 8791, 8792],
        "guilds" => [8800, 8801, 8802],
        "calls" => [8810, 8811, 8812],
        "push" => [8820, 8821, 8822],
        _ => unreachable!("known gateway role"),
    }
}

fn positive_int_env(name: &str, default: u16) -> u16 {
    let parsed = int_env(name, default);
    if parsed > 0 { parsed } else { default }
}

fn non_negative_int_env(name: &str, default: u16) -> u16 {
    int_env(name, default)
}

fn int_env(name: &str, default: u16) -> u16 {
    env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn wait_for_cluster_ports_available_sync(nodes: &[GatewayNode]) -> Result<()> {
    let conflicts = nodes
        .iter()
        .flat_map(|node| {
            [
                (
                    !can_bind_tcp_port(node.http_port),
                    format!("{} http={}", node.name(), node.http_port),
                ),
                (
                    !can_bind_tcp_port(node.dist_port),
                    format!("{} dist={}", node.name(), node.dist_port),
                ),
            ]
        })
        .filter_map(|(conflict, label)| conflict.then_some(label))
        .collect::<Vec<_>>();
    if !conflicts.is_empty() {
        bail!(
            "Gateway cluster port(s) already in use: {}. Stop the conflicting process or set FLUXER_DEV_GATEWAY_CLUSTER_HTTP_PORT_OFFSET/FLUXER_DEV_GATEWAY_CLUSTER_DIST_PORT_BASE for an isolated run.",
            conflicts.join(", ")
        );
    }
    Ok(())
}

async fn wait_for_cluster_ports_available(nodes: &[GatewayNode]) -> Result<()> {
    let timeout = env::var("FLUXER_DEV_GATEWAY_CLUSTER_PORT_WAIT_SECONDS")
        .ok()
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(10.0);
    wait_for_ports_available_until(nodes, Instant::now() + Duration::from_secs_f64(timeout)).await
}

async fn wait_for_ports_available_until(nodes: &[GatewayNode], deadline: Instant) -> Result<()> {
    loop {
        match wait_for_cluster_ports_available_sync(nodes) {
            Ok(()) => return Ok(()),
            Err(error) if Instant::now() < deadline => {
                let _ = error;
                sleep(Duration::from_millis(500)).await;
            }
            Err(error) => return Err(error),
        }
    }
}

fn can_bind_tcp_port(port: u16) -> bool {
    TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], port))).is_ok()
}

#[cfg(target_os = "linux")]
async fn cleanup_orphaned_gateway_nodes(nodes: &[GatewayNode]) -> Result<()> {
    let leaders = orphaned_gateway_leaders(nodes)?;
    if leaders.is_empty() {
        return Ok(());
    }
    let pids = leaders.iter().map(|leader| leader.pid).collect::<Vec<_>>();

    println!(
        "Stopping orphaned gateway cluster node process group(s): {}",
        format_pids(&pids)
    );
    let term_failed = signal_process_groups(&pids, libc::SIGTERM);
    if !term_failed.is_empty() {
        println!(
            "SIGTERM delivery failed for orphaned gateway pid(s): {}",
            format_pids(&term_failed)
        );
    }

    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let remaining = surviving_gateway_group_pids(&leaders)?;
        if remaining.is_empty() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            let kill_failed = signal_process_groups(&remaining, libc::SIGKILL);
            sleep(Duration::from_millis(200)).await;
            let survivors = surviving_gateway_group_pids(&leaders)?;
            if survivors.is_empty() {
                return Ok(());
            }
            let delivery_failed = kill_failed
                .into_iter()
                .filter(|pid| survivors.contains(pid))
                .collect::<Vec<_>>();
            if delivery_failed.is_empty() {
                bail!(
                    "orphaned gateway node process(es) survived SIGKILL: {}",
                    format_pids(&survivors)
                );
            }
            bail!(
                "orphaned gateway node process(es) survived SIGKILL: {} (signal delivery failed for: {})",
                format_pids(&survivors),
                format_pids(&delivery_failed)
            );
        }
        sleep(Duration::from_millis(200)).await;
    }
}

#[cfg(target_os = "linux")]
fn format_pids(pids: &[i32]) -> String {
    if pids.is_empty() {
        return "none".to_owned();
    }
    pids.iter()
        .map(i32::to_string)
        .collect::<Vec<_>>()
        .join(", ")
}

#[cfg(not(target_os = "linux"))]
async fn cleanup_orphaned_gateway_nodes(_nodes: &[GatewayNode]) -> Result<()> {
    Ok(())
}

#[cfg(target_os = "linux")]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct GatewayLeader {
    pid: i32,
    starttime: u64,
}

#[cfg(target_os = "linux")]
fn orphaned_gateway_leaders(nodes: &[GatewayNode]) -> Result<Vec<GatewayLeader>> {
    let node_names = nodes
        .iter()
        .map(GatewayNode::erlang_name)
        .collect::<std::collections::HashSet<_>>();
    let mut leaders = Vec::new();
    for entry in fs::read_dir("/proc").context("failed to read /proc")? {
        let Ok(entry) = entry else {
            continue;
        };
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|name| name.parse::<i32>().ok())
        else {
            continue;
        };
        if !cmdline_has_gateway_node(&proc_cmdline(pid), &node_names) {
            continue;
        }
        if proc_parent_pid(pid) != Some(1) {
            continue;
        }
        if let Some(starttime) = proc_stat_starttime(pid) {
            leaders.push(GatewayLeader { pid, starttime });
        }
    }
    leaders.sort_unstable_by_key(|leader| leader.pid);
    Ok(leaders)
}

#[cfg(any(target_os = "linux", test))]
fn cmdline_has_gateway_node(
    args: &[String],
    node_names: &std::collections::HashSet<String>,
) -> bool {
    args.windows(2)
        .any(|pair| pair[0] == "-name" && node_names.contains(&pair[1]))
}

#[cfg(target_os = "linux")]
fn proc_cmdline(pid: i32) -> Vec<String> {
    fs::read(format!("/proc/{pid}/cmdline"))
        .unwrap_or_default()
        .split(|byte| *byte == 0)
        .filter(|arg| !arg.is_empty())
        .map(|arg| String::from_utf8_lossy(arg).into_owned())
        .collect()
}

#[cfg(target_os = "linux")]
fn proc_parent_pid(pid: i32) -> Option<i32> {
    fs::read_to_string(format!("/proc/{pid}/status"))
        .ok()?
        .lines()
        .find_map(|line| line.strip_prefix("PPid:")?.trim().parse().ok())
}

#[cfg(target_os = "linux")]
fn process_exists(pid: i32) -> bool {
    assert!(pid > 0);
    match proc_stat_state_and_pgid(pid) {
        Some((state, _pgid)) => !proc_stat_state_is_dead(state),
        None => false,
    }
}

#[cfg(target_os = "linux")]
fn proc_stat_state_and_pgid(pid: i32) -> Option<(char, i32)> {
    assert!(pid > 0);
    let stat = fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    parse_proc_stat_state_and_pgid(&stat)
}

#[cfg(any(target_os = "linux", test))]
fn parse_proc_stat_state_and_pgid(stat: &str) -> Option<(char, i32)> {
    let (_, after_comm) = stat.rsplit_once(')')?;
    let mut fields = after_comm.split_ascii_whitespace();
    let state = fields.next()?.chars().next()?;
    let _ppid: i32 = fields.next()?.parse().ok()?;
    let pgid: i32 = fields.next()?.parse().ok()?;
    Some((state, pgid))
}

#[cfg(target_os = "linux")]
fn proc_stat_starttime(pid: i32) -> Option<u64> {
    assert!(pid > 0);
    let stat = fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    parse_proc_stat_starttime(&stat)
}

#[cfg(any(target_os = "linux", test))]
fn parse_proc_stat_starttime(stat: &str) -> Option<u64> {
    let (_, after_comm) = stat.rsplit_once(')')?;
    after_comm.split_ascii_whitespace().nth(19)?.parse().ok()
}

#[cfg(any(target_os = "linux", test))]
fn proc_stat_state_is_dead(state: char) -> bool {
    state == 'Z' || state == 'X' || state == 'x'
}

#[cfg(target_os = "linux")]
fn surviving_gateway_group_pids(leaders: &[GatewayLeader]) -> Result<Vec<i32>> {
    let leader_pids = leaders
        .iter()
        .map(|leader| leader.pid)
        .collect::<std::collections::HashSet<_>>();
    let mut survivors = Vec::new();
    for entry in fs::read_dir("/proc").context("failed to read /proc")? {
        let Ok(entry) = entry else {
            continue;
        };
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|name| name.parse::<i32>().ok())
        else {
            continue;
        };
        let Ok(stat) = fs::read_to_string(format!("/proc/{pid}/stat")) else {
            continue;
        };
        let Some((state, pgid)) = parse_proc_stat_state_and_pgid(&stat) else {
            continue;
        };
        if proc_stat_state_is_dead(state) {
            continue;
        }
        if leader_pids.contains(&pgid) {
            survivors.push(pid);
            continue;
        }
        let leader = leaders.iter().find(|leader| leader.pid == pid);
        if let Some(leader) = leader
            && parse_proc_stat_starttime(&stat) == Some(leader.starttime)
        {
            survivors.push(pid);
        }
    }
    survivors.sort_unstable();
    Ok(survivors)
}

#[cfg(target_os = "linux")]
fn signal_process_groups(pids: &[i32], signal: i32) -> Vec<i32> {
    assert!(signal == libc::SIGTERM || signal == libc::SIGKILL);
    let mut failed = Vec::with_capacity(pids.len());
    for pid in pids {
        assert!(*pid > 0);
        let group_result = unsafe { libc::kill(-pid, signal) };
        if group_result == 0 {
            continue;
        }
        let direct_result = unsafe { libc::kill(*pid, signal) };
        if direct_result == 0 {
            continue;
        }
        if process_exists(*pid) {
            failed.push(*pid);
        }
    }
    failed
}

fn setup_gateway_cluster_config(nodes: &[GatewayNode]) -> Result<()> {
    let cookie =
        env::var("FLUXER_ERLANG_COOKIE").unwrap_or_else(|_| GATEWAY_CLUSTER_COOKIE.to_owned());
    for node in nodes {
        write_gateway_config(
            &node.config_dir(),
            &node.erlang_name(),
            &cookie,
            &node.dist_port.to_string(),
        )?;
    }
    remove_stale_gateway_config()
}

fn gateway_node_env(node: &GatewayNode, static_peers: &str) -> Vec<(String, Option<String>)> {
    vec![
        (
            "FLUXER_GATEWAY_CLUSTER_ENABLED".to_owned(),
            Some("true".to_owned()),
        ),
        (
            "FLUXER_GATEWAY_CLUSTER_STATIC_PEERS".to_owned(),
            Some(static_peers.to_owned()),
        ),
        ("FLUXER_GATEWAY_ROLE".to_owned(), Some(node.role.clone())),
        (
            "FLUXER_GATEWAY_PORT".to_owned(),
            Some(node.http_port.to_string()),
        ),
        (
            "FLUXER_ERLANG_NODE_NAME".to_owned(),
            Some(node.erlang_name()),
        ),
        (
            "FLUXER_ERLANG_DIST_PORT".to_owned(),
            Some(node.dist_port.to_string()),
        ),
        (
            "FLUXER_ERLANG_COOKIE".to_owned(),
            Some(
                env::var("FLUXER_ERLANG_COOKIE")
                    .unwrap_or_else(|_| GATEWAY_CLUSTER_COOKIE.to_owned()),
            ),
        ),
    ]
}

fn print_gateway_cluster_topology(nodes: &[GatewayNode]) {
    println!("Gateway clustered dev topology:");
    for role in GATEWAY_CLUSTER_ROLES {
        let ports = nodes
            .iter()
            .filter(|node| node.role == *role)
            .map(|node| {
                format!(
                    "{}:http={},dist={}",
                    node.name(),
                    node.http_port,
                    node.dist_port
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        println!("  {role}: {ports}");
    }
}

fn start_node(node: &GatewayNode, static_peers: &str) -> Result<Child> {
    let command = build_gateway_command(&node.config_dir())?;
    let env = merged_env(Some(&gateway_node_env(node, static_peers)), true)?;
    println!("[gateway:{}] $ {}", node.name(), format_command(&command));
    let mut child_command = Command::new(&command[0]);
    child_command
        .args(&command[1..])
        .current_dir(gateway_dir())
        .env_clear()
        .envs(env)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    unsafe {
        use std::os::unix::process::CommandExt;
        child_command.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    let mut child = child_command.spawn()?;
    if let Some(stdout) = child.stdout.take() {
        let label = node.name();
        std::thread::spawn(move || prefix_output(&format!("gateway:{label}"), stdout));
    }
    if let Some(stderr) = child.stderr.take() {
        let label = node.name();
        std::thread::spawn(move || prefix_output(&format!("gateway:{label}"), stderr));
    }
    Ok(child)
}

fn prefix_output(label: &str, reader: impl std::io::Read) {
    use std::io::{BufRead, BufReader};
    for line in BufReader::new(reader).lines().map_while(|line| line.ok()) {
        println!("[{label}] {line}");
    }
}

pub fn stop_processes(processes: &mut [Child]) {
    let mut children = processes.iter_mut().collect::<Vec<_>>();
    stop_child_processes(&mut children);
}

pub fn stop_child_processes(processes: &mut [&mut Child]) {
    for process in processes.iter_mut() {
        if process.try_wait().ok().flatten().is_some() {
            continue;
        }
        terminate_process(process);
    }
    let deadline = Instant::now() + STOP_GRACE_PERIOD;
    loop {
        let all_exited = processes
            .iter_mut()
            .all(|process| process.try_wait().ok().flatten().is_some());
        if all_exited {
            return;
        }
        if Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    for process in processes {
        if process.try_wait().ok().flatten().is_some() {
            continue;
        }
        force_kill_process(process);
    }
}

#[cfg(unix)]
fn terminate_process(process: &mut Child) {
    unsafe {
        libc::kill(-(process.id() as i32), libc::SIGTERM);
    }
}

#[cfg(not(unix))]
fn terminate_process(process: &mut Child) {
    let _ = process.kill();
}

#[cfg(unix)]
fn force_kill_process(process: &mut Child) {
    unsafe {
        libc::kill(-(process.id() as i32), libc::SIGKILL);
    }
    let _ = process.kill();
    let _ = process.wait();
}

#[cfg(not(unix))]
fn force_kill_process(process: &mut Child) {
    let _ = process.kill();
    let _ = process.wait();
}

pub fn build_gateway_command(config_dir: &Path) -> Result<Vec<String>> {
    let mut ebin_paths = Vec::new();
    if gateway_ebin_root().exists() {
        for entry in fs::read_dir(gateway_ebin_root())? {
            let path = entry?.path().join("ebin");
            if path.is_dir() {
                ebin_paths.push(path);
            }
        }
    }
    ebin_paths.sort();
    if ebin_paths.is_empty() {
        bail!(
            "No gateway ebin paths found under {}",
            gateway_ebin_root().display()
        );
    }
    let mut args = vec!["erl".to_owned(), "-noshell".to_owned()];
    for path in ebin_paths {
        args.push("-pa".to_owned());
        args.push(path.display().to_string());
    }
    args.extend([
        "-config".to_owned(),
        config_dir.join("sys.config").display().to_string(),
        "-args_file".to_owned(),
        config_dir.join("vm.args").display().to_string(),
        "-eval".to_owned(),
        GATEWAY_FOREGROUND_EVAL.to_owned(),
    ]);
    Ok(args)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_default_cluster_nodes() {
        let nodes = build_gateway_cluster_nodes().unwrap();
        assert_eq!(nodes.len(), 18);
        assert_eq!(nodes[0].name(), "websocket-1");
        assert_eq!(nodes[0].http_port, 8771);
        assert_eq!(nodes[17].name(), "push-3");
        assert_eq!(nodes[17].dist_port, 9018);
    }

    #[test]
    fn node_env_contains_role_port_and_static_peers() {
        let node = GatewayNode {
            role: "calls".to_owned(),
            ordinal: 2,
            http_port: 8811,
            dist_port: 9014,
        };
        let env = gateway_node_env(&node, "a,b");
        assert!(
            env.iter()
                .any(|(key, value)| key == "FLUXER_GATEWAY_ROLE"
                    && value.as_deref() == Some("calls"))
        );
        assert!(
            env.iter().any(
                |(key, value)| key == "FLUXER_GATEWAY_PORT" && value.as_deref() == Some("8811")
            )
        );
        assert!(
            env.iter()
                .any(|(key, value)| key == "FLUXER_GATEWAY_CLUSTER_STATIC_PEERS"
                    && value.as_deref() == Some("a,b"))
        );
    }

    #[test]
    fn cmdline_gateway_node_detection_matches_exact_name_argument() {
        let node_names =
            std::collections::HashSet::from([String::from("fluxer_gateway_websocket_1@127.0.0.1")]);

        assert!(cmdline_has_gateway_node(
            &strings(&[
                "/usr/local/bin/beam.smp",
                "-name",
                "fluxer_gateway_websocket_1@127.0.0.1"
            ]),
            &node_names
        ));
        assert!(!cmdline_has_gateway_node(
            &strings(&[
                "/usr/local/bin/beam.smp",
                "-sname",
                "fluxer_gateway_websocket_1@127.0.0.1"
            ]),
            &node_names
        ));
        assert!(!cmdline_has_gateway_node(
            &strings(&[
                "/usr/local/bin/beam.smp",
                "-name",
                "other_gateway_websocket_1@127.0.0.1"
            ]),
            &node_names
        ));
    }

    #[test]
    fn proc_stat_parsing_extracts_state_and_pgid() {
        assert_eq!(
            parse_proc_stat_state_and_pgid("1234 (beam.smp) S 1 1234 1234 0 -1 4194560 0"),
            Some(('S', 1234))
        );
        assert_eq!(
            parse_proc_stat_state_and_pgid("77 (erl_child_setup) R 42 42 9000 0 -1"),
            Some(('R', 42))
        );
    }

    #[test]
    fn proc_stat_parsing_handles_parentheses_and_spaces_in_comm() {
        assert_eq!(
            parse_proc_stat_state_and_pgid("99 (weird) comm (name) Z 1 42 42 0 -1"),
            Some(('Z', 42))
        );
        assert_eq!(
            parse_proc_stat_state_and_pgid("99 (spaced comm) T 1 99 99 0 -1"),
            Some(('T', 99))
        );
    }

    #[test]
    fn proc_stat_parsing_rejects_malformed_lines() {
        assert_eq!(parse_proc_stat_state_and_pgid(""), None);
        assert_eq!(parse_proc_stat_state_and_pgid("1234 (beam.smp)"), None);
        assert_eq!(parse_proc_stat_state_and_pgid("1234 (beam.smp) S"), None);
        assert_eq!(parse_proc_stat_state_and_pgid("1234 (beam.smp) S 1"), None);
        assert_eq!(
            parse_proc_stat_state_and_pgid("1234 (beam.smp) S 1 not-a-pgid"),
            None
        );
        assert_eq!(parse_proc_stat_state_and_pgid("no comm field here"), None);
    }

    #[test]
    fn proc_stat_parsing_extracts_starttime() {
        let stat =
            "1234 (beam.smp) S 1 1234 1234 0 -1 4194560 0 0 0 0 5 3 0 0 20 0 30 0 12345678 4096";
        assert_eq!(parse_proc_stat_starttime(stat), Some(12_345_678));
    }

    #[test]
    fn proc_stat_starttime_parsing_handles_parentheses_and_spaces_in_comm() {
        let stat =
            "99 (weird) comm (name) S 1 42 42 0 -1 4194560 0 0 0 0 5 3 0 0 20 0 30 0 777 4096";
        assert_eq!(parse_proc_stat_starttime(stat), Some(777));
    }

    #[test]
    fn proc_stat_starttime_parsing_rejects_truncated_lines() {
        assert_eq!(parse_proc_stat_starttime(""), None);
        assert_eq!(parse_proc_stat_starttime("1234 (beam.smp)"), None);
        assert_eq!(
            parse_proc_stat_starttime("1234 (beam.smp) S 1 1234 1234 0 -1 4194560 0"),
            None
        );
        assert_eq!(
            parse_proc_stat_starttime(
                "1234 (beam.smp) S 1 1234 1234 0 -1 4194560 0 0 0 0 5 3 0 0 20 0 30 0 not-a-number"
            ),
            None
        );
    }

    #[test]
    fn zombie_and_reaped_states_count_as_dead() {
        assert!(proc_stat_state_is_dead('Z'));
        assert!(proc_stat_state_is_dead('X'));
        assert!(proc_stat_state_is_dead('x'));
    }

    #[test]
    fn live_states_do_not_count_as_dead() {
        assert!(!proc_stat_state_is_dead('R'));
        assert!(!proc_stat_state_is_dead('S'));
        assert!(!proc_stat_state_is_dead('D'));
        assert!(!proc_stat_state_is_dead('T'));
        assert!(!proc_stat_state_is_dead('t'));
        assert!(!proc_stat_state_is_dead('I'));
    }

    fn strings(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }
}
