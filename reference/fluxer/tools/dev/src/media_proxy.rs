// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::paths::{
    DEV_LOG_DIR, DEV_SEAWEEDFS_DIR, DEV_SEAWEEDFS_PID_FILE, ROOT, ensure_writable_dev_paths, which,
};
use crate::proc::{RunOptions, merged_env, run_command};
use crate::smoke::{ensure_s3_buckets, wait_s3_api};
use anyhow::{Context, Result, bail};
use reqwest::Method;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::env;
use std::fs::{self, File, OpenOptions};
use std::net::{SocketAddr, TcpListener, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use tokio::time::sleep;

const S3_BUCKETS: &str = "cdn,uploads,static";
const DEV_S3_BUCKETS: &str =
    "fluxer,fluxer-uploads,fluxer-downloads,fluxer-reports,fluxer-harvests,fluxer-static";
const DEV_S3_ACCESS_KEY_ID: &str = "fluxer";
const DEV_S3_SECRET_ACCESS_KEY: &str = "fluxer-secret";
const DEV_S3_HOST: &str = "127.0.0.1";
const DEV_S3_PORT: u16 = 8333;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObjectStore {
    pub endpoint: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub region: String,
    pub container_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

pub async fn run_dev_media_doctor(
    repair: bool,
    base_url: &str,
    media_path: Option<&str>,
) -> Result<()> {
    let media_health_url = format!("{}/media/_health", base_url.trim_end_matches('/'));
    ensure_dev_object_store(repair, 60).await?;
    wait_for_success(&media_health_url, 30).await?;
    println!("Media proxy health: ok ({media_health_url})");
    if let Some(path) = media_path {
        check_dev_media_path(base_url, path).await?;
    }
    println!("Fluxer media proxy doctor passed.");
    Ok(())
}

pub async fn ensure_dev_object_store(repair: bool, repair_timeout_secs: u64) -> Result<()> {
    match wait_s3_api(5).await {
        Ok(()) => {}
        Err(error) if repair => {
            println!("SeaweedFS S3 check failed: {error}");
            start_dev_seaweedfs()?;
            wait_s3_api(repair_timeout_secs).await?;
        }
        Err(error) => {
            bail!(
                "SeaweedFS S3 is unreachable: {error}\nRun `fluxer-dev media-proxy doctor --repair` to start the local dev object store."
            );
        }
    }
    ensure_s3_buckets()?;
    Ok(())
}

fn start_dev_seaweedfs() -> Result<()> {
    ensure_writable_dev_paths()?;
    if tcp_reachable(DEV_S3_HOST, DEV_S3_PORT) {
        println!("SeaweedFS S3 is already reachable at {DEV_S3_HOST}:{DEV_S3_PORT}");
        return Ok(());
    }

    fs::create_dir_all(DEV_SEAWEEDFS_DIR.as_path()).with_context(|| {
        format!(
            "failed to create SeaweedFS data dir {}",
            DEV_SEAWEEDFS_DIR.display()
        )
    })?;
    fs::create_dir_all(DEV_LOG_DIR.as_path())
        .with_context(|| format!("failed to create log dir {}", DEV_LOG_DIR.display()))?;

    if let Some(pid) = read_dev_seaweedfs_pid()? {
        if managed_seaweedfs_process_running(pid) {
            eprintln!("Stopping unresponsive managed SeaweedFS process {pid}.");
            stop_managed_seaweedfs_process(pid);
        }
        let _ = fs::remove_file(DEV_SEAWEEDFS_PID_FILE.as_path());
    }

    let weed = which("weed").ok_or_else(|| {
        anyhow::anyhow!(
            "missing `weed` binary. Rebuild the devcontainer so SeaweedFS can run inside it."
        )
    })?;
    let log_path = DEV_LOG_DIR.join("seaweedfs.log");
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .with_context(|| format!("failed to open SeaweedFS log {}", log_path.display()))?;
    let stderr = log
        .try_clone()
        .context("failed to clone SeaweedFS log handle")?;
    let data_dir_arg = format!("-dir={}", DEV_SEAWEEDFS_DIR.display());
    let child = Command::new(weed)
        .args(["-logtostderr=true", "mini", &data_dir_arg])
        .env("AWS_ACCESS_KEY_ID", DEV_S3_ACCESS_KEY_ID)
        .env("AWS_SECRET_ACCESS_KEY", DEV_S3_SECRET_ACCESS_KEY)
        .env("S3_BUCKET", DEV_S3_BUCKETS)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(stderr))
        .spawn()
        .context("failed to start SeaweedFS")?;
    let pid = child.id();
    fs::write(DEV_SEAWEEDFS_PID_FILE.as_path(), pid.to_string()).with_context(|| {
        format!(
            "failed to write SeaweedFS pid file {}",
            DEV_SEAWEEDFS_PID_FILE.display()
        )
    })?;
    println!(
        "Started SeaweedFS dev object store with pid {pid}; logs: {}",
        log_path.display()
    );
    Ok(())
}

fn read_dev_seaweedfs_pid() -> Result<Option<u32>> {
    let text = match fs::read_to_string(DEV_SEAWEEDFS_PID_FILE.as_path()) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error).context("failed to read SeaweedFS pid file"),
    };
    let pid = text.trim().parse().with_context(|| {
        format!(
            "invalid SeaweedFS pid file: {}",
            DEV_SEAWEEDFS_PID_FILE.display()
        )
    })?;
    Ok(Some(pid))
}

fn managed_seaweedfs_process_running(pid: u32) -> bool {
    let cmdline = fs::read(format!("/proc/{pid}/cmdline")).unwrap_or_default();
    cmdline
        .split(|byte| *byte == 0)
        .any(|arg| arg.ends_with(b"/weed") || arg == b"weed")
}

#[cfg(unix)]
fn stop_managed_seaweedfs_process(pid: u32) {
    unsafe {
        libc::kill(pid as i32, libc::SIGTERM);
    }
    std::thread::sleep(Duration::from_secs(2));
    if managed_seaweedfs_process_running(pid) {
        unsafe {
            libc::kill(pid as i32, libc::SIGKILL);
        }
    }
}

#[cfg(not(unix))]
fn stop_managed_seaweedfs_process(_pid: u32) {}

async fn check_dev_media_path(base_url: &str, path: &str) -> Result<()> {
    let path = if path.starts_with('/') {
        path.to_owned()
    } else {
        format!("/{path}")
    };
    let url = format!("{}{}", base_url.trim_end_matches('/'), path);
    let response = request("GET", &url, None, None).await?;
    if response.status == 502 {
        bail!("Media proxy returned 502 for {url}; storage is still unreachable from the proxy.");
    }
    if response.status >= 500 {
        bail!("Media proxy returned {} for {url}", response.status);
    }
    println!("Media path check: {} ({url})", response.status);
    Ok(())
}

pub async fn run_seaweedfs_media_proxy_integration(isolated_store: bool) -> Result<()> {
    let store = if isolated_store {
        start_isolated_store().await?
    } else {
        discover_store().await?
    };
    let temp_dir = tempfile::Builder::new()
        .prefix("fluxer-media-proxy-seaweedfs.")
        .tempdir()?;
    let mut proxy_process = None;
    let mut log_file = None;
    let result = async {
        generate_fixtures(temp_dir.path())?;
        build_media_proxy()?;
        seed_fixtures(&store, temp_dir.path())?;
        let log = File::create(temp_dir.path().join("proxy.log"))?;
        let proxy_port = find_free_port("127.0.0.1")?;
        proxy_process = Some(start_media_proxy(&store, proxy_port, &log)?);
        log_file = Some(log);
        wait_for_success(&format!("http://127.0.0.1:{proxy_port}/_health"), 120).await?;
        check_media_proxy_routes(proxy_port).await
    }
    .await;
    if let Some(mut process) = proxy_process {
        let _ = process.kill();
        let _ = process.wait();
    }
    drop(log_file);
    if let Some(container_name) = &store.container_name {
        let _ = run_command(
            &["docker", "rm", "-f", container_name],
            RunOptions {
                check: false,
                capture: true,
                ..RunOptions::default()
            },
        );
    }
    result?;
    println!("SeaweedFS media proxy integration test passed.");
    Ok(())
}

pub fn run_rust_stress_smoke() -> Result<()> {
    crate::proc::run(&["cargo", "test", "-p", "fluxer-media-proxy"])?;
    crate::proc::run(&[
        "cargo",
        "bench",
        "-p",
        "fluxer-media-proxy",
        "--bench",
        "core",
        "--",
        "--sample-size",
        "10",
        "--warm-up-time",
        "1",
        "--measurement-time",
        "1",
    ])?;

    if which("cargo-fuzz").is_none() {
        eprintln!("cargo-fuzz not installed; skipping fuzz smoke");
        return Ok(());
    }
    let use_nightly = rustup_has_nightly();
    for target in ["parsers", "signing_external_path", "thumbhash"] {
        run_fuzz_smoke(target, use_nightly)?;
    }
    Ok(())
}

pub async fn run_bee_gif_bench() -> Result<()> {
    require_command("ffprobe")?;
    let cfg = BeeGifBenchConfig::from_env();
    let temp_dir = tempfile::Builder::new()
        .prefix("fluxer-bee-gif-bench.")
        .tempdir()?;
    let storage_root = temp_dir.path().join("storage");
    let server_log = temp_dir.path().join("server.log");
    let server_bin = ROOT.join("target/release/fluxer-media-proxy");

    if cfg.build || !server_bin.is_file() {
        eprintln!("[bee-gif-bench] building media proxy");
        run_command(
            &["cargo", "build", "--release", "-p", "fluxer-media-proxy"],
            RunOptions::default(),
        )?;
    }

    fs::create_dir_all(&cfg.cache_dir)?;
    let fixture = cfg.cache_dir.join("animated-policy-fixture.gif");
    ensure_bee_gif_fixture(&fixture, &cfg.fixture_url).await?;

    let object_path = storage_root.join("cdn").join(BEE_GIF_OBJECT_KEY);
    if let Some(parent) = object_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(&fixture, &object_path)?;

    let fixture_bytes = fs::read(&fixture)?;
    let fixture_sha = sha256_hex(&fixture_bytes);
    let (fixture_width, fixture_height) = image::image_dimensions(&fixture)
        .map_err(|error| anyhow::anyhow!("failed to read GIF dimensions: {error}"))?;
    let target_height = scaled_height(fixture_width, fixture_height, cfg.target_width);
    let expected_screen = format!("{}x{target_height}", cfg.target_width);
    let fixture_frames = gifsicle_info(&fixture).and_then(|info| parse_gifsicle_frame_count(&info));
    eprintln!(
        "[bee-gif-bench] fixture bytes={} size={}x{} sha256={fixture_sha}",
        fixture_bytes.len(),
        fixture_width,
        fixture_height
    );

    let log = File::create(&server_log)?;
    let stderr = log.try_clone()?;
    let server = Command::new(&server_bin)
        .env("FLUXER_MEDIA_PROXY_SECRET_KEY", "bench-secret")
        .env("FLUXER_MEDIA_PROXY_STORAGE_ROOT", &storage_root)
        .env("FLUXER_MEDIA_PROXY_TRANSFORM_CACHE_BYTES", "0")
        .env("FLUXER_MEDIA_PROXY_PORT", cfg.port.to_string())
        .env("FLUXER_MEDIA_PROXY_HOST", "127.0.0.1")
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(stderr))
        .spawn()?;
    let mut server = ChildGuard::new(server);
    let base_url = format!("http://127.0.0.1:{}", cfg.port);
    if let Err(error) = wait_for_success(&format!("{base_url}/_health"), 5).await {
        let log_text = fs::read_to_string(&server_log).unwrap_or_default();
        bail!("server did not become healthy: {error}\n{log_text}");
    }

    let context = BeeGifBenchContext {
        base_url,
        fixture_sha,
        fixture_bytes: fixture_bytes.len(),
        fixture_frames,
        max_seconds: cfg.max_seconds,
        work_dir: temp_dir.path().to_path_buf(),
    };
    measure_original(&context, "animated_query_passthrough", "?animated=true").await?;
    measure_original(
        &context,
        "explicit_gif_passthrough",
        "?animated=true&format=gif",
    )
    .await?;
    measure_animated_webp(
        &context,
        "animated_webp_transcode",
        "?format=webp&animated=true",
    )
    .await?;
    measure_original(
        &context,
        "native_size_passthrough",
        &format!("?width={fixture_width}&height={fixture_height}&animated=true"),
    )
    .await?;
    measure_original(
        &context,
        "no_upscale_passthrough",
        &format!("?width={}&animated=true", fixture_width + 1),
    )
    .await?;
    measure_gif_transform(
        &context,
        "sized_gif_transform",
        &format!("?format=gif&width={}&animated=true", cfg.target_width),
        &expected_screen,
    )
    .await?;
    measure_animated_webp(
        &context,
        "sized_webp_transcode",
        &format!("?format=webp&width={}&animated=true", cfg.target_width),
    )
    .await?;
    measure_static_webp(
        &context,
        "static_webp_freeze_frame",
        &format!("?format=webp&width={}&animated=false", cfg.target_width),
    )
    .await?;

    if cfg.full_transcode {
        require_command("gif2webp")?;
        eprintln!(
            "[bee-gif-bench] running stock gif2webp comparison; this is expected to be much slower"
        );
        let stock = temp_dir.path().join("stock.webp");
        let start = Instant::now();
        let status = Command::new("gif2webp")
            .args(["-quiet", "-q", "85", "-m", "0", "-mt"])
            .arg(&fixture)
            .arg("-o")
            .arg(&stock)
            .status()?;
        if !status.success() {
            bail!(
                "gif2webp failed with exit code {}",
                status.code().unwrap_or(1)
            );
        }
        let elapsed = start.elapsed();
        let stock_bytes = fs::metadata(&stock)?.len();
        println!(
            "stock_gif2webp_m0_lossless seconds={:.3} bytes={stock_bytes}",
            elapsed.as_secs_f64()
        );
    }

    server.stop();
    Ok(())
}

fn rustup_has_nightly() -> bool {
    let Ok(output) = Command::new("rustup").args(["toolchain", "list"]).output() else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .any(|line| line.starts_with("nightly"))
}

fn run_fuzz_smoke(target: &str, use_nightly: bool) -> Result<()> {
    if use_nightly {
        crate::proc::run(&[
            "cargo",
            "+nightly",
            "fuzz",
            "run",
            target,
            "--",
            "-runs=1000",
        ])
    } else {
        crate::proc::run(&["cargo", "fuzz", "run", target, "--", "-runs=1000"])
    }
}

pub async fn discover_store() -> Result<ObjectStore> {
    if let Ok(endpoint) = env::var("FLUXER_S3_ENDPOINT") {
        return Ok(ObjectStore {
            endpoint,
            access_key_id: env::var("FLUXER_S3_ACCESS_KEY_ID")
                .unwrap_or_else(|_| "fluxer".to_owned()),
            secret_access_key: env::var("FLUXER_S3_SECRET_ACCESS_KEY")
                .unwrap_or_else(|_| "fluxer-secret".to_owned()),
            region: env::var("FLUXER_S3_REGION").unwrap_or_else(|_| "us-east-1".to_owned()),
            container_name: None,
        });
    }
    if tcp_reachable("seaweedfs", 8333) {
        return Ok(ObjectStore {
            endpoint: "http://seaweedfs:8333".to_owned(),
            access_key_id: "fluxer".to_owned(),
            secret_access_key: "fluxer-secret".to_owned(),
            region: "us-east-1".to_owned(),
            container_name: None,
        });
    }
    if tcp_reachable("127.0.0.1", 3900) {
        return Ok(ObjectStore {
            endpoint: "http://127.0.0.1:3900".to_owned(),
            access_key_id: "fluxer".to_owned(),
            secret_access_key: "fluxer-secret".to_owned(),
            region: "us-east-1".to_owned(),
            container_name: None,
        });
    }
    start_isolated_store().await
}

pub async fn start_isolated_store() -> Result<ObjectStore> {
    require_command("docker")?;
    let s3_port = find_free_port("127.0.0.1")?;
    let master_port = find_free_port("127.0.0.1")?;
    let container_name = format!("fluxer-media-proxy-seaweedfs-{}", std::process::id());
    let access_key_id = "fluxeraccess";
    let secret_access_key = "fluxersecretkey1234567890";
    let image =
        env::var("SEAWEEDFS_IMAGE").unwrap_or_else(|_| "chrislusf/seaweedfs:latest".to_owned());
    run_command(
        &[
            "docker",
            "run",
            "-d",
            "--rm",
            "--name",
            &container_name,
            "-p",
            &format!("127.0.0.1:{s3_port}:8333"),
            "-p",
            &format!("127.0.0.1:{master_port}:9333"),
            "-e",
            &format!("AWS_ACCESS_KEY_ID={access_key_id}"),
            "-e",
            &format!("AWS_SECRET_ACCESS_KEY={secret_access_key}"),
            "-e",
            &format!("S3_BUCKET={S3_BUCKETS}"),
            &image,
        ],
        RunOptions {
            capture: true,
            ..RunOptions::default()
        },
    )?;
    wait_for_success(
        &format!("http://127.0.0.1:{master_port}/cluster/status"),
        120,
    )
    .await?;
    wait_for_http_endpoint(&format!("http://127.0.0.1:{s3_port}/"), 120).await?;
    Ok(ObjectStore {
        endpoint: format!("http://127.0.0.1:{s3_port}"),
        access_key_id: access_key_id.to_owned(),
        secret_access_key: secret_access_key.to_owned(),
        region: "us-east-1".to_owned(),
        container_name: Some(container_name),
    })
}

fn generate_fixtures(temp_dir: &Path) -> Result<()> {
    require_command("ffmpeg")?;
    let image = temp_dir.join("fixture.png");
    let video = temp_dir.join("fixture.mp4");
    run_command(
        &[
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x240:rate=30:duration=1",
            "-frames:v",
            "1",
            &image.display().to_string(),
        ],
        RunOptions::default(),
    )?;
    run_command(
        &[
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=640x360:rate=30:duration=2",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=880:duration=2",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            &video.display().to_string(),
        ],
        RunOptions::default(),
    )
    .map(drop)
}

fn build_media_proxy() -> Result<()> {
    ensure_writable_dev_paths()?;
    crate::proc::run(&["cargo", "build", "--release", "-p", "fluxer-media-proxy"])
}

fn seed_fixtures(store: &ObjectStore, temp_dir: &Path) -> Result<()> {
    let image = temp_dir.join("fixture.png").display().to_string();
    let video = temp_dir.join("fixture.mp4").display().to_string();
    let mut env = media_proxy_env(store);
    env.push(("S3_FIXTURE_IMAGE".to_owned(), Some(image)));
    env.push(("S3_FIXTURE_VIDEO".to_owned(), Some(video)));
    run_command(
        &[
            "cargo",
            "run",
            "--release",
            "-p",
            "fluxer-media-proxy",
            "--bin",
            "fluxer-media-proxy-s3-fixture",
        ],
        RunOptions {
            env,
            ..RunOptions::default()
        },
    )
    .map(drop)
}

fn start_media_proxy(store: &ObjectStore, port: u16, log_file: &File) -> Result<Child> {
    let binary = ROOT.join("target/release/fluxer-media-proxy");
    let mut env = media_proxy_env(store);
    env.extend([
        (
            "FLUXER_MEDIA_PROXY_HOST".to_owned(),
            Some("127.0.0.1".to_owned()),
        ),
        ("FLUXER_MEDIA_PROXY_PORT".to_owned(), Some(port.to_string())),
    ]);
    let process_env = merged_env(Some(&env), true)?;
    Ok(Command::new(binary)
        .current_dir(ROOT.as_path())
        .env_clear()
        .envs(process_env)
        .stdout(Stdio::from(log_file.try_clone()?))
        .stderr(Stdio::from(log_file.try_clone()?))
        .spawn()?)
}

pub fn media_proxy_env(store: &ObjectStore) -> Vec<(String, Option<String>)> {
    vec![
        (
            "FLUXER_MEDIA_PROXY_SECRET_KEY".to_owned(),
            Some("integration-secret".to_owned()),
        ),
        (
            "FLUXER_MEDIA_PROXY_STORAGE_BACKEND".to_owned(),
            Some("s3".to_owned()),
        ),
        (
            "FLUXER_S3_ENDPOINT".to_owned(),
            Some(store.endpoint.clone()),
        ),
        ("FLUXER_S3_REGION".to_owned(), Some(store.region.clone())),
        (
            "FLUXER_S3_ACCESS_KEY_ID".to_owned(),
            Some(store.access_key_id.clone()),
        ),
        (
            "FLUXER_S3_SECRET_ACCESS_KEY".to_owned(),
            Some(store.secret_access_key.clone()),
        ),
        (
            "FLUXER_S3_FORCE_PATH_STYLE".to_owned(),
            Some("true".to_owned()),
        ),
        ("FLUXER_S3_BUCKET_CDN".to_owned(), Some("cdn".to_owned())),
        (
            "FLUXER_S3_BUCKET_UPLOADS".to_owned(),
            Some("uploads".to_owned()),
        ),
        (
            "FLUXER_S3_BUCKET_STATIC".to_owned(),
            Some("static".to_owned()),
        ),
    ]
}

async fn check_media_proxy_routes(port: u16) -> Result<()> {
    let proxy = format!("http://127.0.0.1:{port}");
    let theme = request("GET", &format!("{proxy}/themes/test.css"), None, None).await?;
    assert_status(&theme, 200)?;
    assert_header_prefix(&theme, "content-type", "text/css; charset=utf-8")?;

    let range = request(
        "GET",
        &format!("{proxy}/attachments/1/2/file.txt"),
        Some(vec![("Range", "bytes=2-7")]),
        None,
    )
    .await?;
    assert_status(&range, 206)?;
    if range.body != b"234567" {
        bail!("unexpected range response body");
    }

    let head = request(
        "HEAD",
        &format!("{proxy}/attachments/1/2/file.txt"),
        None,
        None,
    )
    .await?;
    assert_status(&head, 200)?;
    if head.headers.get("content-length").map(String::as_str) != Some("16") {
        bail!("unexpected content-length for fixture object");
    }

    let image = request(
        "GET",
        &format!("{proxy}/attachments/1/3/image.png?width=96&height=96&format=webp&quality=high"),
        None,
        None,
    )
    .await?;
    assert_status(&image, 200)?;
    assert_header_prefix(&image, "content-type", "image/webp")?;
    assert_webp(&image.body)?;

    let avatar = request(
        "GET",
        &format!("{proxy}/avatars/42/abc.png?size=128&format=webp"),
        None,
        None,
    )
    .await?;
    assert_status(&avatar, 200)?;
    assert_header_prefix(&avatar, "content-type", "image/webp")?;
    assert_webp(&avatar.body)?;

    let video = request(
        "GET",
        &format!("{proxy}/attachments/1/4/video.mp4?format=jpeg"),
        None,
        None,
    )
    .await?;
    assert_status(&video, 200)?;
    assert_header_prefix(&video, "content-type", "image/jpeg")?;
    assert_jpeg(&video.body)?;

    let metadata = post_json(
        &format!("{proxy}/_metadata"),
        serde_json::json!({"version": 2, "type": "upload", "nsfw": "allow", "upload_filename": "upload-image.png", "filename": "upload-image.png"}),
    )
    .await?;
    if metadata
        .get("content_type")
        .and_then(|value| value.as_str())
        != Some("image/png")
        || metadata.get("width").and_then(|value| value.as_i64()) != Some(320)
        || metadata.get("height").and_then(|value| value.as_i64()) != Some(240)
    {
        bail!("unexpected upload metadata response: {metadata}");
    }

    let s3_metadata = post_json(
        &format!("{proxy}/_metadata"),
        serde_json::json!({"version": 2, "type": "s3", "nsfw": "allow", "bucket": "cdn", "key": "metadata/image.png"}),
    )
    .await?;
    if s3_metadata
        .get("content_type")
        .and_then(|value| value.as_str())
        != Some("image/png")
    {
        bail!("unexpected S3 metadata response: {s3_metadata}");
    }

    let thumbnail = request(
        "POST",
        &format!("{proxy}/_thumbnail"),
        Some(vec![
            ("Authorization", "Bearer integration-secret"),
            ("Content-Type", "application/json"),
        ]),
        Some(
            serde_json::json!({"upload_filename": "upload-video.mp4"})
                .to_string()
                .into_bytes(),
        ),
    )
    .await?;
    assert_status(&thumbnail, 200)?;
    assert_header_prefix(&thumbnail, "content-type", "image/webp")?;
    assert_webp(&thumbnail.body)?;

    let frames = post_json(
        &format!("{proxy}/_frames"),
        serde_json::json!({"version": 2, "type": "upload", "nsfw": "allow", "upload_filename": "upload-video.mp4"}),
    )
    .await?;
    let has_jpeg = frames
        .get("frames")
        .and_then(|value| value.as_array())
        .map(|frames| {
            frames.iter().any(|frame| {
                frame.get("mime_type").and_then(|value| value.as_str()) == Some("image/jpeg")
            })
        })
        .unwrap_or(false);
    if !has_jpeg {
        bail!("unexpected frames response: {frames}");
    }
    Ok(())
}

async fn post_json(url: &str, payload: serde_json::Value) -> Result<serde_json::Value> {
    let response = request(
        "POST",
        url,
        Some(vec![
            ("Authorization", "Bearer integration-secret"),
            ("Content-Type", "application/json"),
        ]),
        Some(payload.to_string().into_bytes()),
    )
    .await?;
    assert_status(&response, 200)?;
    Ok(serde_json::from_slice(&response.body)?)
}

async fn request(
    method: &str,
    url: &str,
    headers: Option<Vec<(&str, &str)>>,
    data: Option<Vec<u8>>,
) -> Result<HttpResponse> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()?;
    let mut builder = client.request(Method::from_bytes(method.as_bytes())?, url);
    for (name, value) in headers.unwrap_or_default() {
        builder = builder.header(name, value);
    }
    if let Some(data) = data {
        builder = builder.body(data);
    }
    let response = builder.send().await?;
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .map(|(name, value)| {
            (
                name.as_str().to_ascii_lowercase(),
                value.to_str().unwrap_or_default().to_owned(),
            )
        })
        .collect();
    let body = response.bytes().await?.to_vec();
    Ok(HttpResponse {
        status,
        headers,
        body,
    })
}

fn assert_status(response: &HttpResponse, expected: u16) -> Result<()> {
    if response.status != expected {
        bail!(
            "expected HTTP {expected}, got {}: {:?}",
            response.status,
            &response.body[..response.body.len().min(500)]
        );
    }
    Ok(())
}

fn assert_header_prefix(response: &HttpResponse, name: &str, prefix: &str) -> Result<()> {
    let value = response.headers.get(name).map(String::as_str).unwrap_or("");
    if !value
        .to_ascii_lowercase()
        .starts_with(&prefix.to_ascii_lowercase())
    {
        bail!("expected {name} to start with {prefix:?}, got {value:?}");
    }
    Ok(())
}

fn assert_webp(body: &[u8]) -> Result<()> {
    if body.len() < 12 || !body.starts_with(b"RIFF") || &body[8..12] != b"WEBP" {
        bail!("response is not a WebP image");
    }
    Ok(())
}

fn assert_jpeg(body: &[u8]) -> Result<()> {
    if !body.starts_with(&[0xff, 0xd8]) {
        bail!("response is not a JPEG image");
    }
    Ok(())
}

const BEE_GIF_OBJECT_KEY: &str = "attachments/bench/gifs/animated-policy-fixture.gif";

struct BeeGifBenchConfig {
    cache_dir: PathBuf,
    fixture_url: String,
    port: u16,
    max_seconds: f64,
    target_width: u32,
    build: bool,
    full_transcode: bool,
}

impl BeeGifBenchConfig {
    fn from_env() -> Self {
        let media_root = ROOT.join("fluxer_media_proxy");
        Self {
            cache_dir: env_path("BENCH_CACHE_DIR", media_root.join(".benchmark-cache/media")),
            fixture_url: env::var("BEE_GIF_URL")
                .unwrap_or_else(|_| "https://www.gstatic.com/webp/animated/1.gif".to_owned()),
            port: env_parse("PORT", 18182),
            max_seconds: env_parse("MAX_SECONDS", 2.0),
            target_width: env_parse("TARGET_WIDTH", 60),
            build: env_bool("BENCH_BUILD", true),
            full_transcode: env_bool("BENCH_FULL_TRANSCODE", false),
        }
    }
}

struct BeeGifBenchContext {
    base_url: String,
    fixture_sha: String,
    fixture_bytes: usize,
    fixture_frames: Option<u32>,
    max_seconds: f64,
    work_dir: PathBuf,
}

async fn ensure_bee_gif_fixture(path: &Path, url: &str) -> Result<()> {
    if path.is_file() && fs::metadata(path)?.len() > 0 {
        return Ok(());
    }
    eprintln!("[bee-gif-bench] downloading fixture");
    let tmp = path.with_extension("gif.tmp");
    let response = reqwest::get(url).await?.error_for_status()?;
    let bytes = response.bytes().await?;
    fs::write(&tmp, &bytes)?;
    fs::rename(tmp, path)?;
    Ok(())
}

async fn measure_original(ctx: &BeeGifBenchContext, label: &str, query: &str) -> Result<()> {
    let result = fetch_bench_case(ctx, label, "gif", query).await?;
    println!("{}", result.summary(label));
    if result.status != 200
        || !content_type_matches(&result.content_type, "image/gif")
        || result.bytes != ctx.fixture_bytes
        || result.sha256 != ctx.fixture_sha
    {
        bail!("{label}: response changed the GIF bytes");
    }
    assert_elapsed(label, result.seconds, ctx.max_seconds)
}

async fn measure_gif_transform(
    ctx: &BeeGifBenchContext,
    label: &str,
    query: &str,
    expected_screen: &str,
) -> Result<()> {
    let result = fetch_bench_case(ctx, label, "gif", query).await?;
    println!("{}", result.summary(label));
    if result.status != 200
        || !content_type_matches(&result.content_type, "image/gif")
        || result.bytes == 0
        || result.sha256 == ctx.fixture_sha
    {
        bail!("{label}: expected a transformed GIF response");
    }
    if let Some(expected_frames) = ctx.fixture_frames {
        let info = gifsicle_info(&result.output_file)
            .ok_or_else(|| anyhow::anyhow!("{label}: gifsicle could not inspect output"))?;
        let frames = parse_gifsicle_frame_count(&info);
        let screen = parse_gifsicle_logical_screen(&info);
        if frames != Some(expected_frames) || screen.as_deref() != Some(expected_screen) {
            bail!(
                "{label}: expected {expected_frames} frames at {expected_screen}, got {} at {}",
                frames
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "unknown".to_owned()),
                screen.unwrap_or_else(|| "unknown".to_owned())
            );
        }
    }
    assert_elapsed(label, result.seconds, ctx.max_seconds)
}

async fn measure_static_webp(ctx: &BeeGifBenchContext, label: &str, query: &str) -> Result<()> {
    let result = fetch_bench_case(ctx, label, "webp", query).await?;
    println!("{}", result.summary(label));
    if result.status != 200
        || !content_type_matches(&result.content_type, "image/webp")
        || result.bytes == 0
    {
        bail!("{label}: expected a static WebP response");
    }
    assert_elapsed(label, result.seconds, ctx.max_seconds)
}

async fn measure_animated_webp(ctx: &BeeGifBenchContext, label: &str, query: &str) -> Result<()> {
    let result = fetch_bench_case(ctx, label, "webp", query).await?;
    println!("{}", result.summary(label));
    if result.status != 200
        || !content_type_matches(&result.content_type, "image/webp")
        || result.bytes == 0
    {
        bail!("{label}: expected an animated WebP response");
    }
    if !is_animated_webp(&result.body) {
        bail!("{label}: expected a RIFF animated WebP payload");
    }
    assert_elapsed(label, result.seconds, ctx.max_seconds)
}

struct BenchFetchResult {
    status: u16,
    seconds: f64,
    bytes: usize,
    content_type: String,
    sha256: String,
    output_file: PathBuf,
    body: Vec<u8>,
}

impl BenchFetchResult {
    fn summary(&self, label: &str) -> String {
        format!(
            "{label} status={} seconds={:.6} bytes={} content_type={} sha256={}",
            self.status, self.seconds, self.bytes, self.content_type, self.sha256
        )
    }
}

async fn fetch_bench_case(
    ctx: &BeeGifBenchContext,
    label: &str,
    extension: &str,
    query: &str,
) -> Result<BenchFetchResult> {
    let url = format!("{}/{BEE_GIF_OBJECT_KEY}{query}", ctx.base_url);
    let output_file = ctx.work_dir.join(format!("{label}.{extension}"));
    let start = Instant::now();
    let response = request("GET", &url, None, None).await?;
    let seconds = start.elapsed().as_secs_f64();
    fs::write(&output_file, &response.body)?;
    let content_type = response
        .headers
        .get("content-type")
        .cloned()
        .unwrap_or_default();
    let sha256 = sha256_hex(&response.body);
    Ok(BenchFetchResult {
        status: response.status,
        seconds,
        bytes: response.body.len(),
        content_type,
        sha256,
        output_file,
        body: response.body,
    })
}

fn assert_elapsed(label: &str, seconds: f64, max_seconds: f64) -> Result<()> {
    if seconds > max_seconds {
        bail!("{label}: {seconds:.6}s exceeded {max_seconds:.6}s budget");
    }
    Ok(())
}

fn content_type_matches(actual: &str, expected: &str) -> bool {
    actual
        .to_ascii_lowercase()
        .starts_with(&expected.to_ascii_lowercase())
}

fn sha256_hex(bytes: &[u8]) -> String {
    bytes_to_lower_hex(&Sha256::digest(bytes))
}

fn bytes_to_lower_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn scaled_height(width: u32, height: u32, target_width: u32) -> u32 {
    ((height as f64 * target_width as f64 / width as f64) + 0.5).floor() as u32
}

fn is_animated_webp(body: &[u8]) -> bool {
    body.starts_with(b"RIFF") && body.windows(4).any(|window| window == b"ANMF")
}

fn gifsicle_info(path: &Path) -> Option<String> {
    which("gifsicle")?;
    let output = Command::new("gifsicle")
        .arg("--info")
        .arg(path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn parse_gifsicle_frame_count(info: &str) -> Option<u32> {
    let first = info.lines().next()?;
    let words: Vec<_> = first.split_whitespace().collect();
    words
        .windows(2)
        .find(|window| window[1] == "images")
        .and_then(|window| window[0].parse().ok())
}

fn parse_gifsicle_logical_screen(info: &str) -> Option<String> {
    info.lines()
        .find(|line| line.contains("logical screen"))
        .and_then(|line| {
            let words: Vec<_> = line.split_whitespace().collect();
            words
                .windows(3)
                .find(|window| window[0] == "logical" && window[1] == "screen")
                .map(|window| window[2].to_owned())
        })
}

fn env_path(name: &str, default: PathBuf) -> PathBuf {
    env::var_os(name).map(PathBuf::from).unwrap_or(default)
}

fn env_parse<T>(name: &str, default: T) -> T
where
    T: std::str::FromStr,
{
    env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_bool(name: &str, default: bool) -> bool {
    env::var(name)
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(default)
}

struct ChildGuard {
    child: Option<Child>,
}

impl ChildGuard {
    fn new(child: Child) -> Self {
        Self { child: Some(child) }
    }

    fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for ChildGuard {
    fn drop(&mut self) {
        self.stop();
    }
}

async fn wait_for_success(url: &str, timeout_secs: u64) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    let mut last_error = None;
    while Instant::now() < deadline {
        match request("GET", url, None, None).await {
            Ok(response) if (200..300).contains(&response.status) => return Ok(()),
            Ok(response) => last_error = Some(format!("HTTP {}", response.status)),
            Err(error) => last_error = Some(error.to_string()),
        }
        sleep(Duration::from_millis(250)).await;
    }
    bail!(
        "Timed out waiting for {url}: {}",
        last_error.unwrap_or_else(|| "unknown error".to_owned())
    );
}

async fn wait_for_http_endpoint(url: &str, timeout_secs: u64) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    let mut last_error = None;
    while Instant::now() < deadline {
        match request("GET", url, None, None).await {
            Ok(response) if response.status < 500 => return Ok(()),
            Ok(response) => last_error = Some(format!("HTTP {}", response.status)),
            Err(error) => last_error = Some(error.to_string()),
        }
        sleep(Duration::from_millis(250)).await;
    }
    bail!(
        "Timed out waiting for {url}: {}",
        last_error.unwrap_or_else(|| "unknown error".to_owned())
    );
}

fn tcp_reachable(host: &str, port: u16) -> bool {
    let address = format!("{host}:{port}");
    TcpStream::connect_timeout(
        &address
            .to_socket_addrs()
            .ok()
            .and_then(|mut addrs| addrs.next())
            .unwrap_or_else(|| SocketAddr::from(([127, 0, 0, 1], port))),
        Duration::from_secs(2),
    )
    .is_ok()
}

pub fn find_free_port(host: &str) -> Result<u16> {
    let listener = TcpListener::bind((host, 0))?;
    Ok(listener.local_addr()?.port())
}

fn require_command(name: &str) -> Result<()> {
    if which(name).is_none() {
        bail!("missing required command: {name}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_proxy_env_maps_store_to_fluxer_env() {
        let store = ObjectStore {
            endpoint: "http://s3".to_owned(),
            access_key_id: "ak".to_owned(),
            secret_access_key: "sk".to_owned(),
            region: "r".to_owned(),
            container_name: None,
        };
        let env = media_proxy_env(&store);
        assert!(env.iter().any(
            |(key, value)| key == "FLUXER_S3_ENDPOINT" && value.as_deref() == Some("http://s3")
        ));
        assert!(
            env.iter().any(
                |(key, value)| key == "FLUXER_S3_BUCKET_CDN" && value.as_deref() == Some("cdn")
            )
        );
    }

    #[test]
    fn validates_image_magic_bytes() {
        assert!(assert_webp(b"RIFFxxxxWEBP").is_ok());
        assert!(assert_jpeg(&[0xff, 0xd8, 0x00]).is_ok());
        assert!(assert_webp(b"nope").is_err());
        assert!(assert_jpeg(b"nope").is_err());
    }

    #[test]
    fn detects_animated_webp_markers() {
        assert!(is_animated_webp(b"RIFFxxxxWEBPVP8X....ANMF"));
        assert!(!is_animated_webp(b"RIFFxxxxWEBPVP8 "));
        assert!(!is_animated_webp(b"not-webp-ANMF"));
    }

    #[test]
    fn parses_gifsicle_summary() {
        let info = "* test.gif 12 images\n  logical screen 60x45\n";
        assert_eq!(parse_gifsicle_frame_count(info), Some(12));
        assert_eq!(
            parse_gifsicle_logical_screen(info).as_deref(),
            Some("60x45")
        );
        assert_eq!(parse_gifsicle_frame_count("no frames"), None);
    }

    #[test]
    fn computes_scaled_height_like_benchmark_script() {
        assert_eq!(scaled_height(320, 240, 60), 45);
        assert_eq!(scaled_height(100, 33, 10), 3);
    }

    #[test]
    fn matches_content_type_prefixes() {
        assert!(content_type_matches("image/gif", "image/gif"));
        assert!(content_type_matches(
            "image/webp; charset=binary",
            "image/webp"
        ));
        assert!(!content_type_matches("image/png", "image/webp"));
    }

    #[test]
    fn finds_free_port() {
        let port = find_free_port("127.0.0.1").unwrap();
        assert!(port > 0);
    }
}
