// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::common::{
    S3UploadPlanItem, collect_files, delete_s3_objects, list_s3_keys, path_to_s3_key,
    replace_s3_object_metadata, s3_client, s3_content_type_for_key, upload_s3_plan_sync,
};
use anyhow::{Context, Result, ensure};
use clap::Args;
use std::collections::BTreeMap;
use std::env;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

const DEFAULT_SOURCE: &str = "fluxer_static";
const DEFAULT_STATIC_BUCKET: &str = "fluxer-static";
const DEFAULT_S3_ENDPOINT: &str = "https://ewr1.vultrobjects.com";
const DEFAULT_ASSET_PREFIX: &str = "assets/";
const IMMUTABLE_ASSET_CACHE_CONTROL: &str = "public, max-age=31536000, immutable";
const DEFAULT_REPAIR_CONCURRENCY: usize = 8;

#[derive(Debug, Args, Clone)]
pub struct SyncStaticBucketArgs {
    #[arg(long, default_value = DEFAULT_SOURCE)]
    source: PathBuf,
    #[arg(long, default_value = DEFAULT_STATIC_BUCKET)]
    bucket: String,
}

#[derive(Debug, Args, Clone)]
pub struct RepairStaticAssetMetadataArgs {
    #[arg(long, default_value = DEFAULT_STATIC_BUCKET)]
    bucket: String,
    #[arg(long, default_value = DEFAULT_ASSET_PREFIX)]
    prefix: String,
}

pub async fn run(args: SyncStaticBucketArgs) -> Result<()> {
    ensure!(
        args.source.is_dir(),
        "Static source directory is missing: {}",
        args.source.display()
    );

    let upload_plan = static_upload_plan(&args.source)?;
    let client = s3_client(Some(DEFAULT_S3_ENDPOINT)).await?;

    let plan = upload_plan
        .into_iter()
        .map(|(key, path)| S3UploadPlanItem::new(path, key).with_detected_content_type())
        .collect::<Vec<_>>();
    let stats = upload_s3_plan_sync(&client, &args.bucket, plan).await?;

    println!(
        "Static bucket sync complete: uploaded {} file(s), skipped existing {}",
        stats.uploaded, stats.skipped_existing
    );

    let remote_keys = list_s3_keys(&client, &args.bucket, "").await?;
    let markdown_keys = remote_keys
        .into_iter()
        .filter(|key| key.to_ascii_lowercase().ends_with(".md"))
        .collect::<Vec<_>>();
    let removed = delete_s3_objects(&client, &args.bucket, &markdown_keys).await?;
    println!("Static bucket sync removed {removed} stray .md object(s)");

    Ok(())
}

pub async fn repair_asset_metadata(args: RepairStaticAssetMetadataArgs) -> Result<()> {
    let client = s3_client(Some(DEFAULT_S3_ENDPOINT)).await?;
    let keys = list_s3_keys(&client, &args.bucket, &args.prefix).await?;
    let mut skipped = 0_usize;
    let mut tasks = JoinSet::new();
    let semaphore = Arc::new(Semaphore::new(static_asset_repair_concurrency()));

    for key in keys {
        let Some(content_type) = s3_content_type_for_key(&key) else {
            skipped += 1;
            continue;
        };
        let permit = semaphore
            .clone()
            .acquire_owned()
            .await
            .context("S3 repair semaphore closed")?;
        let client = client.clone();
        let bucket = args.bucket.clone();
        tasks.spawn(async move {
            let _permit = permit;
            replace_s3_object_metadata(
                &client,
                &bucket,
                &key,
                Some(content_type),
                Some(IMMUTABLE_ASSET_CACHE_CONTROL),
            )
            .await?;
            Ok::<_, anyhow::Error>(())
        });
    }

    let mut repaired = 0_usize;
    while let Some(result) = tasks.join_next().await {
        result.context("S3 metadata repair task failed")??;
        repaired += 1;
    }

    println!(
        "Static asset metadata repair complete: repaired {repaired} file(s), skipped {skipped}"
    );
    Ok(())
}

fn static_asset_repair_concurrency() -> usize {
    env::var("S3_WRITE_CONCURRENCY")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_REPAIR_CONCURRENCY)
}

fn static_upload_plan(source: &Path) -> Result<BTreeMap<String, PathBuf>> {
    let mut plan = BTreeMap::new();
    for file in collect_files(source)? {
        let relative = file
            .strip_prefix(source)
            .with_context(|| format!("Failed to relativize {}", file.display()))?;
        if !should_sync_static_path(relative) {
            continue;
        }
        let key = path_to_s3_key(relative);
        if !key.is_empty() {
            plan.insert(key, file);
        }
    }
    Ok(plan)
}

fn should_sync_static_path(relative: &Path) -> bool {
    if relative
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
    {
        return false;
    }
    let Some(first) = relative.components().next() else {
        return false;
    };
    match first {
        std::path::Component::Normal(value) => {
            let value = value.to_string_lossy();
            value != ".github" && value != "assets"
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write_file(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, contents).unwrap();
    }

    #[test]
    fn upload_plan_excludes_github_and_assets_roots() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path();
        write_file(&source.join("index.html"), "html");
        write_file(&source.join("docs/install.html"), "docs");
        write_file(&source.join(".github/workflows/ignored.yaml"), "workflow");
        write_file(&source.join("assets/app.js"), "asset");

        let keys = static_upload_plan(source)
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>();

        assert_eq!(keys, vec!["docs/install.html", "index.html"]);
    }

    #[test]
    fn upload_plan_is_deterministic_and_keeps_non_root_assets_paths() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path();
        write_file(&source.join("z.html"), "z");
        write_file(&source.join("docs/assets/keep.js"), "keep");
        write_file(&source.join("a.html"), "a");

        let keys = static_upload_plan(source)
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>();

        assert_eq!(keys, vec!["a.html", "docs/assets/keep.js", "z.html"]);
    }

    #[test]
    fn static_key_filter_matches_workflow_excludes() {
        assert!(should_sync_static_path(Path::new("index.html")));
        assert!(should_sync_static_path(
            Path::new("docs").join("install.html").as_path()
        ));
        assert!(!should_sync_static_path(
            Path::new("assets").join("app.js").as_path()
        ));
        assert!(!should_sync_static_path(
            Path::new(".github")
                .join("workflows")
                .join("sync.yaml")
                .as_path()
        ));
        assert!(!should_sync_static_path(Path::new("")));
    }

    #[test]
    fn static_key_filter_excludes_markdown() {
        assert!(!should_sync_static_path(Path::new(
            "THIRD_PARTY_LICENSES.md"
        )));
        assert!(!should_sync_static_path(
            Path::new("fonts").join("NOTICE.md").as_path()
        ));
        assert!(!should_sync_static_path(
            Path::new("emoji").join("README.MD").as_path()
        ));
        assert!(should_sync_static_path(Path::new("index.html")));
    }

    #[test]
    fn upload_plan_excludes_markdown_files() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path();
        write_file(&source.join("index.html"), "html");
        write_file(&source.join("THIRD_PARTY_LICENSES.md"), "licenses");
        write_file(&source.join("fonts/NOTICE.md"), "notice");

        let keys = static_upload_plan(source)
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>();

        assert_eq!(keys, vec!["index.html"]);
    }

    #[test]
    fn repair_metadata_args_default_to_app_assets_prefix() {
        let args = RepairStaticAssetMetadataArgs {
            bucket: DEFAULT_STATIC_BUCKET.to_string(),
            prefix: DEFAULT_ASSET_PREFIX.to_string(),
        };
        assert_eq!(args.bucket, "fluxer-static");
        assert_eq!(args.prefix, "assets/");
    }
}
