// SPDX-License-Identifier: AGPL-3.0-or-later

use anyhow::{Context, Result, bail};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use clap::Args;
use hmac::{Hmac, KeyInit, Mac};
use image::{AnimationDecoder, RgbaImage, codecs::gif::GifDecoder, imageops::FilterType};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::BTreeMap;
use std::io::{BufReader, Cursor};
use std::process::Command;
use std::time::{Duration, Instant};
use tokio::task::JoinSet;

const DEFAULT_PREFIXES: &[&str] = &[
    "attachments/",
    "emojis/",
    "stickers/",
    "avatars/",
    "icons/",
    "banners/",
];
const KNOWN_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "webp", "gif", "apng", "avif", "heic", "heif", "jxl",
];

#[derive(Debug, Clone, Args)]
pub struct StressCompareArgs {
    #[arg(long, help = "v1 base URL, for example http://media-proxy:8080")]
    pub v1: String,
    #[arg(long, help = "v2 base URL, for example http://10.244.147.209:8080")]
    pub v2: String,
    #[arg(long, default_value = "fluxer")]
    pub bucket: String,
    #[arg(
        long,
        env = "FLUXER_S3_ENDPOINT",
        default_value = "https://ewr1.vultrobjects.com"
    )]
    pub endpoint: String,
    #[arg(long, env = "FLUXER_S3_REGION", default_value = "ewr1")]
    pub region: String,
    #[arg(long, env = "FLUXER_S3_ACCESS_KEY_ID")]
    pub access_key: Option<String>,
    #[arg(long, env = "FLUXER_S3_SECRET_ACCESS_KEY")]
    pub secret_key: Option<String>,
    #[arg(long, action = clap::ArgAction::Append)]
    pub prefix: Vec<String>,
    #[arg(long, default_value_t = 20)]
    pub per_prefix: usize,
    #[arg(long, default_value = "plain,resize,format,resize+format")]
    pub matrix: String,
    #[arg(long, default_value_t = 256)]
    pub size: u32,
    #[arg(long, default_value = "webp")]
    pub format: String,
    #[arg(long, default_value_t = 8)]
    pub concurrency: usize,
    #[arg(long, default_value_t = 30.0)]
    pub timeout: f64,
    #[arg(long, default_value_t = 42)]
    pub seed: u64,
    #[arg(long, default_value = "-", help = "JSON report path, or - for stdout")]
    pub report: String,
    #[arg(long, default_value_t = 40)]
    pub max_issues_print: usize,
}

#[derive(Debug, Clone, Args)]
pub struct SignExternalUrlArgs {
    #[arg(long)]
    pub secret_key: String,
    #[arg(long)]
    pub server_url: String,
    pub upstream: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct StressCase {
    pub label: String,
    pub url_path: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub query: String,
    pub expect_image: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct StressResult {
    pub case: StressCase,
    pub v1_status: i32,
    pub v2_status: i32,
    pub v1_ct: String,
    pub v2_ct: String,
    pub v1_size: usize,
    pub v2_size: usize,
    pub issues: Vec<String>,
    pub elapsed_v1_ms: f64,
    pub elapsed_v2_ms: f64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub struct PrefixSummary {
    pub ok: u64,
    pub fail: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct StressSummary {
    pub total: usize,
    pub issues: usize,
    pub by_prefix: BTreeMap<String, PrefixSummary>,
    pub issues_sample: Vec<StressResult>,
}

#[derive(Debug)]
struct FetchResult {
    status: i32,
    content_type: String,
    body: Vec<u8>,
    elapsed_ms: f64,
}

#[derive(Debug, Deserialize)]
struct AwsListObjects {
    #[serde(rename = "Contents", default)]
    contents: Vec<AwsObject>,
    #[serde(rename = "IsTruncated", default)]
    is_truncated: bool,
    #[serde(rename = "NextContinuationToken")]
    next_continuation_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AwsObject {
    #[serde(rename = "Key")]
    key: String,
}

#[derive(Debug, Clone)]
struct StableRng(u64);

impl StableRng {
    fn new(seed: u64) -> Self {
        Self(seed)
    }

    fn next_below(&mut self, upper: usize) -> usize {
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        ((self.0 >> 32) as usize) % upper
    }
}

pub async fn run_stress_compare(args: StressCompareArgs) -> Result<i32> {
    let access_key = args
        .access_key
        .as_deref()
        .filter(|value| !value.is_empty())
        .context("missing S3 creds: pass --access-key or set FLUXER_S3_ACCESS_KEY_ID")?;
    let secret_key = args
        .secret_key
        .as_deref()
        .filter(|value| !value.is_empty())
        .context("missing S3 creds: pass --secret-key or set FLUXER_S3_SECRET_ACCESS_KEY")?;

    let prefixes = if args.prefix.is_empty() {
        DEFAULT_PREFIXES
            .iter()
            .map(|value| (*value).to_owned())
            .collect()
    } else {
        args.prefix.clone()
    };
    let mut rng = StableRng::new(args.seed);
    let mut cases = Vec::new();
    for prefix in &prefixes {
        let keys = list_random_keys(
            &RandomKeyListRequest {
                endpoint: &args.endpoint,
                access_key,
                secret_key,
                region: &args.region,
                bucket: &args.bucket,
                prefix,
                want: args.per_prefix,
            },
            &mut rng,
        )?;
        for key in keys {
            cases.extend(cases_for_key(&key, &args.matrix, args.size, &args.format));
        }
    }
    eprintln!("# {} cases across {} prefixes", cases.len(), prefixes.len());

    let results = compare_cases(
        cases,
        &args.v1,
        &args.v2,
        args.timeout,
        args.concurrency.max(1),
    )
    .await?;
    let summary = summarize_results(&results, args.max_issues_print);
    let output = serde_json::to_string_pretty(&summary)?;
    if args.report == "-" {
        println!("{output}");
    } else {
        std::fs::write(&args.report, output)
            .with_context(|| format!("failed to write {}", args.report))?;
    }
    Ok(summary.issues.min(255) as i32)
}

pub fn sign_external_url(secret_key: &str, server_url: &str, upstream: &str) -> Result<String> {
    let path = format!("v2/{}", URL_SAFE_NO_PAD.encode(upstream.as_bytes()));
    let mut mac = Hmac::<Sha256>::new_from_slice(secret_key.as_bytes())
        .context("failed to create HMAC signer")?;
    mac.update(path.as_bytes());
    let signature = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
    Ok(format!(
        "{}/external/{}/{}",
        server_url.trim_end_matches('/'),
        signature,
        path
    ))
}

struct RandomKeyListRequest<'a> {
    endpoint: &'a str,
    access_key: &'a str,
    secret_key: &'a str,
    region: &'a str,
    bucket: &'a str,
    prefix: &'a str,
    want: usize,
}

fn list_random_keys(
    request: &RandomKeyListRequest<'_>,
    rng: &mut StableRng,
) -> Result<Vec<String>> {
    if request.want == 0 {
        return Ok(Vec::new());
    }
    let mut keys = Vec::new();
    let mut seen = 0usize;
    let mut continuation_token = None;
    let scan_limit = request.want.saturating_mul(50).max(5000);

    loop {
        let page = list_objects_page(
            request.endpoint,
            request.access_key,
            request.secret_key,
            request.region,
            request.bucket,
            request.prefix,
            continuation_token.as_deref(),
        )?;
        for object in page.contents {
            seen += 1;
            if keys.len() < request.want {
                keys.push(object.key);
            } else {
                let index = rng.next_below(seen);
                if index < request.want {
                    keys[index] = object.key;
                }
            }
        }
        if seen >= scan_limit || !page.is_truncated {
            break;
        }
        continuation_token = page.next_continuation_token;
        if continuation_token.is_none() {
            break;
        }
    }

    Ok(keys)
}

fn list_objects_page(
    endpoint: &str,
    access_key: &str,
    secret_key: &str,
    region: &str,
    bucket: &str,
    prefix: &str,
    continuation_token: Option<&str>,
) -> Result<AwsListObjects> {
    let mut command = Command::new("aws");
    command
        .arg("--no-cli-pager")
        .arg("--endpoint-url")
        .arg(endpoint)
        .arg("--region")
        .arg(region)
        .arg("s3api")
        .arg("list-objects-v2")
        .arg("--bucket")
        .arg(bucket)
        .arg("--prefix")
        .arg(prefix)
        .arg("--max-keys")
        .arg("1000")
        .arg("--output")
        .arg("json")
        .env("AWS_ACCESS_KEY_ID", access_key)
        .env("AWS_SECRET_ACCESS_KEY", secret_key)
        .env("AWS_DEFAULT_REGION", region)
        .env("AWS_EC2_METADATA_DISABLED", "true");
    if let Some(token) = continuation_token {
        command.arg("--continuation-token").arg(token);
    }
    let output = command.output().context("failed to run aws s3api")?;
    if !output.status.success() {
        bail!(
            "aws s3api list-objects-v2 failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    serde_json::from_slice(&output.stdout).context("failed to parse aws s3api JSON")
}

pub fn cases_for_key(key: &str, matrix: &str, size: u32, format: &str) -> Vec<StressCase> {
    let Some(url_path) = url_for_key(key) else {
        return Vec::new();
    };
    let is_attachment = key.starts_with("attachments/");
    let mut cases = Vec::new();
    for variant in matrix.split(',').map(str::trim).filter(|v| !v.is_empty()) {
        match variant {
            "plain" => cases.push(StressCase {
                label: format!("{key}|plain"),
                url_path: url_path.clone(),
                query: String::new(),
                expect_image: true,
            }),
            "resize" => cases.push(StressCase {
                label: format!("{key}|resize{size}"),
                url_path: url_path.clone(),
                query: resize_query(is_attachment, size),
                expect_image: true,
            }),
            "format" => cases.push(StressCase {
                label: format!("{key}|fmt={format}"),
                url_path: url_path.clone(),
                query: format!("format={format}"),
                expect_image: true,
            }),
            "resize+format" if is_attachment => cases.push(StressCase {
                label: format!("{key}|w{size}+{format}"),
                url_path: url_path.clone(),
                query: format!("format={format}&width={size}&height={size}"),
                expect_image: true,
            }),
            "resize+format" => cases.push(StressCase {
                label: format!("{key}|s{size}+{format}"),
                url_path: url_path.clone(),
                query: format!("size={size}&format={format}"),
                expect_image: true,
            }),
            _ => {}
        }
    }
    cases
}

pub fn url_for_key(key: &str) -> Option<String> {
    let parts = key.split('/').collect::<Vec<_>>();
    let prefix = parts.first().copied()?;
    match prefix {
        "emojis" | "stickers" if parts.len() == 2 => Some(format!(
            "/{prefix}/{}",
            quote_component(&ensure_ext(parts[1], "webp"))
        )),
        "attachments" if parts.len() == 4 => Some(format!(
            "/attachments/{}/{}/{}",
            quote_component(parts[1]),
            quote_component(parts[2]),
            quote_component(parts[3])
        )),
        "avatars" | "icons" | "banners" | "splashes" | "embed-splashes" if parts.len() == 3 => {
            Some(format!(
                "/{prefix}/{}/{}",
                quote_component(parts[1]),
                quote_component(&ensure_ext(parts[2], "webp"))
            ))
        }
        _ => None,
    }
}

fn ensure_ext(name: &str, default: &str) -> String {
    let lower = name.to_ascii_lowercase();
    if KNOWN_EXTS
        .iter()
        .any(|extension| lower.ends_with(&format!(".{extension}")))
    {
        name.to_owned()
    } else {
        format!("{name}.{default}")
    }
}

fn quote_component(value: &str) -> String {
    urlencoding::encode(value).into_owned()
}

fn resize_query(is_attachment: bool, size: u32) -> String {
    if is_attachment {
        format!("width={size}&height={size}")
    } else {
        format!("size={size}")
    }
}

async fn compare_cases(
    cases: Vec<StressCase>,
    v1_base: &str,
    v2_base: &str,
    timeout: f64,
    concurrency: usize,
) -> Result<Vec<StressResult>> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs_f64(timeout.max(0.1)))
        .build()?;
    let mut pending = cases.into_iter();
    let mut join_set = JoinSet::new();
    let mut results = Vec::new();
    let mut submitted = 0usize;

    loop {
        while join_set.len() < concurrency {
            let Some(case) = pending.next() else {
                break;
            };
            let client = client.clone();
            let v1_base = v1_base.to_owned();
            let v2_base = v2_base.to_owned();
            join_set.spawn(async move { compare_one(client, case, v1_base, v2_base).await });
            submitted += 1;
        }
        let Some(joined) = join_set.join_next().await else {
            break;
        };
        let result = joined.context("stress compare worker panicked")?;
        results.push(result);
        if results.len() % 25 == 0 {
            let issue_count = results
                .iter()
                .filter(|result| !result.issues.is_empty())
                .count();
            eprintln!(
                "# {}/{} done, {} issues so far",
                results.len(),
                submitted + pending.len(),
                issue_count
            );
        }
    }

    Ok(results)
}

async fn compare_one(
    client: reqwest::Client,
    case: StressCase,
    v1_base: String,
    v2_base: String,
) -> StressResult {
    let v1 = fetch(&client, &v1_base, &case.url_path, &case.query).await;
    let v2 = fetch(&client, &v2_base, &case.url_path, &case.query).await;
    let mut result = StressResult {
        case,
        v1_status: v1.status,
        v2_status: v2.status,
        v1_ct: v1.content_type,
        v2_ct: v2.content_type,
        v1_size: v1.body.len(),
        v2_size: v2.body.len(),
        issues: Vec::new(),
        elapsed_v1_ms: v1.elapsed_ms,
        elapsed_v2_ms: v2.elapsed_ms,
    };

    if result.v1_status != result.v2_status {
        result.issues.push(format!(
            "status mismatch v1={} v2={}",
            result.v1_status, result.v2_status
        ));
        return result;
    }
    if result.v1_status >= 400 {
        return result;
    }
    if !result.case.expect_image {
        if v1.body != v2.body {
            result.issues.push(format!(
                "body diverges v1={}B v2={}B",
                result.v1_size, result.v2_size
            ));
        }
        return result;
    }

    let (a_image, a_frames, a_error) = decode_image(&v1.body);
    let (b_image, b_frames, b_error) = decode_image(&v2.body);
    match (a_error.as_deref(), b_error.as_deref()) {
        (Some(a_error), None) => result
            .issues
            .push(format!("v1 decode failed but v2 ok: {a_error}")),
        (None, Some(b_error)) => result.issues.push(format!(
            "v2 decode failed: {b_error} (v1 ok, {a_frames} frame(s))"
        )),
        (Some(_), Some(_)) => {
            if result.v1_size.abs_diff(result.v2_size) > result.v1_size.saturating_div(4).max(256) {
                result.issues.push(format!(
                    "both decode-failed, size differs ({} vs {})",
                    result.v1_size, result.v2_size
                ));
            }
            return result;
        }
        (None, None) => {}
    }

    if let (Some(a_image), Some(b_image)) = (a_image, b_image) {
        if a_frames != b_frames {
            result
                .issues
                .push(format!("frame count v1={a_frames} v2={b_frames}"));
        }
        let similarity = pixel_similarity(&a_image, &b_image);
        if similarity > 0.08 {
            result.issues.push(format!(
                "pixel diff {similarity:.3} (v1 size {}x{} v2 size {}x{})",
                a_image.width(),
                a_image.height(),
                b_image.width(),
                b_image.height()
            ));
        }
    }
    result
}

async fn fetch(client: &reqwest::Client, base: &str, path: &str, query: &str) -> FetchResult {
    let url = format!(
        "{}{}{}",
        base.trim_end_matches('/'),
        path,
        if query.is_empty() {
            String::new()
        } else {
            format!("?{query}")
        }
    );
    let started = Instant::now();
    match client.get(url).send().await {
        Ok(response) => {
            let status = response.status().as_u16() as i32;
            let content_type = response
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default()
                .to_owned();
            match response.bytes().await {
                Ok(body) => FetchResult {
                    status,
                    content_type,
                    body: body.to_vec(),
                    elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
                },
                Err(error) => FetchResult {
                    status: -1,
                    content_type: format!("<error: {}: {error}>", error_kind(&error)),
                    body: Vec::new(),
                    elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
                },
            }
        }
        Err(error) => FetchResult {
            status: -1,
            content_type: format!("<error: {}: {error}>", error_kind(&error)),
            body: Vec::new(),
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        },
    }
}

fn error_kind(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        "Timeout"
    } else if error.is_connect() {
        "Connect"
    } else if error.is_decode() {
        "Decode"
    } else {
        "Request"
    }
}

fn decode_image(data: &[u8]) -> (Option<RgbaImage>, usize, Option<String>) {
    if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        return decode_gif(data);
    }
    match image::load_from_memory(data) {
        Ok(image) => (Some(image.to_rgba8()), 1, None),
        Err(error) => (None, 0, Some(error.to_string())),
    }
}

fn decode_gif(data: &[u8]) -> (Option<RgbaImage>, usize, Option<String>) {
    let reader = BufReader::new(Cursor::new(data));
    let decoder = match GifDecoder::new(reader) {
        Ok(decoder) => decoder,
        Err(error) => return (None, 0, Some(error.to_string())),
    };
    match decoder.into_frames().collect_frames() {
        Ok(frames) => {
            let first = frames.first().map(|frame| frame.buffer().clone());
            (first, frames.len(), None)
        }
        Err(error) => (None, 0, Some(error.to_string())),
    }
}

fn pixel_similarity(a: &RgbaImage, b: &RgbaImage) -> f64 {
    let b_resized;
    let b = if a.dimensions() == b.dimensions() {
        b
    } else {
        let width_diff = a.width().abs_diff(b.width());
        let height_diff = a.height().abs_diff(b.height());
        if width_diff > 8 || height_diff > 8 {
            return 1.0;
        }
        b_resized = image::imageops::resize(b, a.width(), a.height(), FilterType::Lanczos3);
        &b_resized
    };
    let sum = a
        .as_raw()
        .iter()
        .zip(b.as_raw())
        .map(|(a, b)| (*a as i32 - *b as i32).unsigned_abs() as u64)
        .sum::<u64>();
    sum as f64 / (a.as_raw().len() as f64 * 255.0)
}

pub fn summarize_results(results: &[StressResult], max_issues_print: usize) -> StressSummary {
    let mut by_prefix = BTreeMap::new();
    for result in results {
        let prefix = result
            .case
            .url_path
            .split('/')
            .nth(1)
            .unwrap_or("")
            .to_owned();
        let entry = by_prefix
            .entry(prefix)
            .or_insert(PrefixSummary { ok: 0, fail: 0 });
        if result.issues.is_empty() {
            entry.ok += 1;
        } else {
            entry.fail += 1;
        }
    }
    let issues_sample = results
        .iter()
        .filter(|result| !result.issues.is_empty())
        .take(max_issues_print)
        .cloned()
        .collect::<Vec<_>>();
    StressSummary {
        total: results.len(),
        issues: results
            .iter()
            .filter(|result| !result.issues.is_empty())
            .count(),
        by_prefix,
        issues_sample,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;

    #[test]
    fn maps_s3_keys_to_public_routes() {
        assert_eq!(
            url_for_key("avatars/42/hash"),
            Some("/avatars/42/hash.webp".to_owned())
        );
        assert_eq!(
            url_for_key("avatars/42/hash.avif"),
            Some("/avatars/42/hash.avif".to_owned())
        );
        assert_eq!(
            url_for_key("emojis/123"),
            Some("/emojis/123.webp".to_owned())
        );
        assert_eq!(
            url_for_key("attachments/a b/c/name#.png"),
            Some("/attachments/a%20b/c/name%23.png".to_owned())
        );
        assert_eq!(url_for_key("unknown/1/2"), None);
    }

    #[test]
    fn builds_transform_matrix_for_attachment_and_avatar() {
        let attachment = cases_for_key(
            "attachments/a/b/photo.png",
            "plain,resize,format,resize+format",
            128,
            "webp",
        );
        assert_eq!(attachment.len(), 4);
        assert_eq!(attachment[1].query, "width=128&height=128");
        assert_eq!(attachment[3].query, "format=webp&width=128&height=128");

        let avatar = cases_for_key("avatars/42/hash", "resize,resize+format", 64, "webp");
        assert_eq!(avatar[0].query, "size=64");
        assert_eq!(avatar[1].query, "size=64&format=webp");
    }

    #[test]
    fn signs_external_urls_with_urlsafe_components() {
        let signed = sign_external_url(
            "benchmark-secret",
            "http://127.0.0.1:19110/",
            "https://example.test/a b.jpg",
        )
        .unwrap();
        let parts = signed.split('/').collect::<Vec<_>>();
        assert!(signed.starts_with("http://127.0.0.1:19110/external/"));
        assert_eq!(parts[5], "v2");
        assert_eq!(
            URL_SAFE_NO_PAD.decode(parts[6]).unwrap(),
            b"https://example.test/a b.jpg"
        );
        assert_eq!(URL_SAFE_NO_PAD.decode(parts[4]).unwrap().len(), 32);
    }

    #[test]
    fn summarizes_results_by_prefix() {
        let results = vec![
            result_for("/attachments/a/b/c.png", vec![]),
            result_for("/attachments/a/b/d.png", vec!["bad".to_owned()]),
            result_for("/avatars/1/a.webp", vec![]),
        ];
        let summary = summarize_results(&results, 1);

        assert_eq!(summary.total, 3);
        assert_eq!(summary.issues, 1);
        assert_eq!(
            summary.by_prefix.get("attachments"),
            Some(&PrefixSummary { ok: 1, fail: 1 })
        );
        assert_eq!(summary.issues_sample.len(), 1);
    }

    #[test]
    fn pixel_similarity_detects_equal_and_different_images() {
        let image_a = RgbaImage::from_pixel(2, 2, image::Rgba([0, 0, 0, 255]));
        let image_b = RgbaImage::from_pixel(2, 2, image::Rgba([0, 0, 0, 255]));
        let image_c = RgbaImage::from_pixel(2, 2, image::Rgba([255, 255, 255, 255]));

        assert_eq!(pixel_similarity(&image_a, &image_b), 0.0);
        assert!(pixel_similarity(&image_a, &image_c) > 0.70);
    }

    fn result_for(path: &str, issues: Vec<String>) -> StressResult {
        StressResult {
            case: StressCase {
                label: path.to_owned(),
                url_path: path.to_owned(),
                query: String::new(),
                expect_image: true,
            },
            v1_status: 200,
            v2_status: 200,
            v1_ct: "image/png".to_owned(),
            v2_ct: "image/png".to_owned(),
            v1_size: 10,
            v2_size: 10,
            issues,
            elapsed_v1_ms: 1.0,
            elapsed_v2_ms: 1.0,
        }
    }
}
