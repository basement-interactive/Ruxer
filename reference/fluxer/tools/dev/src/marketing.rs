// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::paths::{ROOT, which};
use crate::proc::format_command;
use anyhow::{Context, Result, bail};
use clap::{Args, ValueEnum};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const DEFAULT_BLOG_OUTPUT_DIR: &str = "fluxer_marketing/static/blog";

#[derive(Debug, Clone, Args)]
pub struct PreprocessBlogImageArgs {
    #[arg(long)]
    input: PathBuf,
    #[arg(long)]
    name: String,
    #[arg(long, default_value = DEFAULT_BLOG_OUTPUT_DIR)]
    output_dir: PathBuf,
    #[arg(long, value_enum, default_value_t = ImageFallback::Png)]
    fallback: ImageFallback,
    #[arg(long, value_delimiter = ' ', default_values_t = [640, 960, 1280, 2000])]
    widths: Vec<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum ImageFallback {
    Png,
    Jpg,
}

#[derive(Debug, Clone, Args)]
pub struct PreprocessBlogVideoArgs {
    #[arg(long)]
    input: PathBuf,
    #[arg(long)]
    name: String,
    #[arg(long, default_value = DEFAULT_BLOG_OUTPUT_DIR)]
    output_dir: PathBuf,
    #[arg(long, default_value_t = 640)]
    max_width: u32,
    #[arg(long)]
    fps: Option<String>,
    #[arg(long, default_value = "0.5")]
    poster_time: String,
    #[arg(long, value_enum, default_value_t = VideoAudio::Keep)]
    audio: VideoAudio,
    #[arg(long, default_value_t = 24)]
    mp4_crf: u32,
    #[arg(long, default_value_t = 34)]
    webm_crf: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum VideoAudio {
    Keep,
    None,
}

pub fn preprocess_blog_image(args: PreprocessBlogImageArgs) -> Result<()> {
    require_tools(&["magick", "cwebp", "ffmpeg"])?;
    validate_asset_name(&args.name)?;
    ensure_input_file(&args.input)?;
    if args.widths.is_empty() {
        bail!("--widths must include at least one width");
    }
    let (original_width, _) = image::image_dimensions(&args.input)
        .with_context(|| format!("could not read image dimensions: {}", args.input.display()))?;
    if original_width == 0 {
        bail!("could not read image width: {}", args.input.display());
    }

    fs::create_dir_all(&args.output_dir)?;
    for width in target_widths(original_width, &args.widths)? {
        let base = args.output_dir.join(format!("{}-{width}", args.name));
        let fallback_file = match args.fallback {
            ImageFallback::Png => {
                let output = base.with_extension("png");
                run(&image_magick_png_command(&args.input, width, &output)?)?;
                output
            }
            ImageFallback::Jpg => {
                let output = base.with_extension("jpg");
                run(&image_magick_jpg_command(&args.input, width, &output)?)?;
                output
            }
        };
        run(&cwebp_command(
            &fallback_file,
            &base.with_extension("webp"),
        )?)?;
        run(&avif_still_command(
            &fallback_file,
            &base.with_extension("avif"),
        )?)?;
    }
    Ok(())
}

pub fn preprocess_blog_video(args: PreprocessBlogVideoArgs) -> Result<()> {
    require_tools(&["ffmpeg", "ffprobe"])?;
    validate_asset_name(&args.name)?;
    ensure_input_file(&args.input)?;
    if args.max_width < 2 {
        bail!("--max-width must be an integer greater than 1");
    }
    ensure_video_stream(&args.input)?;

    fs::create_dir_all(&args.output_dir)?;
    let base = args.output_dir.join(&args.name);
    let profile = VideoProfile::from_args(&args);
    run(&mp4_command(
        &args.input,
        &base.with_extension("mp4"),
        &profile,
    )?)?;
    run(&webm_command(
        &args.input,
        &base.with_extension("webm"),
        &profile,
    )?)?;
    run(&poster_command(
        &args.input,
        &base.with_file_name(format!("{}-poster.jpg", args.name)),
        &profile,
    )?)?;
    Ok(())
}

fn require_tools(tools: &[&str]) -> Result<()> {
    for tool in tools {
        if which(tool).is_none() {
            bail!("missing required tool: {tool}");
        }
    }
    Ok(())
}

fn validate_asset_name(name: &str) -> Result<()> {
    if name.trim().is_empty() {
        bail!("--name must not be empty");
    }
    if name.contains('/') || name.contains('\\') {
        bail!("--name must be a file name, not a path");
    }
    Ok(())
}

fn ensure_input_file(input: &Path) -> Result<()> {
    if !input.is_file() {
        bail!("input file not found: {}", input.display());
    }
    Ok(())
}

fn ensure_video_stream(input: &Path) -> Result<()> {
    let status = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
        ])
        .arg(input)
        .status()
        .with_context(|| format!("failed to run ffprobe for {}", input.display()))?;
    if !status.success() {
        bail!("could not read video stream: {}", input.display());
    }
    Ok(())
}

fn target_widths(original_width: u32, requested_widths: &[u32]) -> Result<Vec<u32>> {
    let mut seen = BTreeSet::new();
    let mut widths = Vec::new();
    for requested in requested_widths {
        if *requested == 0 {
            bail!("invalid width: {requested}");
        }
        let width = (*requested).min(original_width);
        if seen.insert(width) {
            widths.push(width);
        }
    }
    Ok(widths)
}

fn image_magick_png_command(input: &Path, width: u32, output: &Path) -> Result<Vec<String>> {
    Ok(vec![
        "magick".to_owned(),
        path_arg(input),
        "-auto-orient".to_owned(),
        "-resize".to_owned(),
        format!("{width}x>"),
        "-strip".to_owned(),
        "-alpha".to_owned(),
        "off".to_owned(),
        format!("PNG24:{}", path_arg(output)),
    ])
}

fn image_magick_jpg_command(input: &Path, width: u32, output: &Path) -> Result<Vec<String>> {
    Ok(vec![
        "magick".to_owned(),
        path_arg(input),
        "-auto-orient".to_owned(),
        "-resize".to_owned(),
        format!("{width}x>"),
        "-strip".to_owned(),
        "-alpha".to_owned(),
        "remove".to_owned(),
        "-background".to_owned(),
        "white".to_owned(),
        "-quality".to_owned(),
        "84".to_owned(),
        "-interlace".to_owned(),
        "Plane".to_owned(),
        path_arg(output),
    ])
}

fn cwebp_command(input: &Path, output: &Path) -> Result<Vec<String>> {
    Ok(vec![
        "cwebp".to_owned(),
        "-quiet".to_owned(),
        "-q".to_owned(),
        "82".to_owned(),
        "-m".to_owned(),
        "6".to_owned(),
        "-af".to_owned(),
        path_arg(input),
        "-o".to_owned(),
        path_arg(output),
    ])
}

fn avif_still_command(input: &Path, output: &Path) -> Result<Vec<String>> {
    Ok(vec![
        "ffmpeg".to_owned(),
        "-hide_banner".to_owned(),
        "-loglevel".to_owned(),
        "error".to_owned(),
        "-y".to_owned(),
        "-i".to_owned(),
        path_arg(input),
        "-frames:v".to_owned(),
        "1".to_owned(),
        "-c:v".to_owned(),
        "libaom-av1".to_owned(),
        "-still-picture".to_owned(),
        "1".to_owned(),
        "-crf".to_owned(),
        "34".to_owned(),
        "-cpu-used".to_owned(),
        "6".to_owned(),
        path_arg(output),
    ])
}

#[derive(Debug, Clone)]
struct VideoProfile {
    scale_filter: String,
    video_filter: String,
    audio_map: Vec<String>,
    mp4_audio: Vec<String>,
    webm_audio: Vec<String>,
    mp4_crf: String,
    webm_crf: String,
    poster_time: String,
}

impl VideoProfile {
    fn from_args(args: &PreprocessBlogVideoArgs) -> Self {
        let scale_filter = format!("scale='trunc(min({},iw)/2)*2':-2", args.max_width);
        let video_filter = match &args.fps {
            Some(fps) if !fps.is_empty() => format!("{scale_filter},fps={fps},format=yuv420p"),
            _ => format!("{scale_filter},format=yuv420p"),
        };
        let (audio_map, mp4_audio, webm_audio) = match args.audio {
            VideoAudio::Keep => (
                strings(&["-map", "0:v:0", "-map", "0:a?"]),
                strings(&["-c:a", "aac", "-b:a", "128k"]),
                strings(&["-c:a", "libopus", "-b:a", "96k"]),
            ),
            VideoAudio::None => (
                strings(&["-map", "0:v:0"]),
                strings(&["-an"]),
                strings(&["-an"]),
            ),
        };
        Self {
            scale_filter,
            video_filter,
            audio_map,
            mp4_audio,
            webm_audio,
            mp4_crf: args.mp4_crf.to_string(),
            webm_crf: args.webm_crf.to_string(),
            poster_time: args.poster_time.clone(),
        }
    }
}

fn mp4_command(input: &Path, output: &Path, profile: &VideoProfile) -> Result<Vec<String>> {
    let mut command = strings(&["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i"]);
    command.push(path_arg(input));
    command.extend(profile.audio_map.iter().cloned());
    command.extend(strings(&[
        "-vf",
        &profile.video_filter,
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        &profile.mp4_crf,
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
    ]));
    command.extend(profile.mp4_audio.iter().cloned());
    command.push(path_arg(output));
    Ok(command)
}

fn webm_command(input: &Path, output: &Path, profile: &VideoProfile) -> Result<Vec<String>> {
    let mut command = strings(&["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i"]);
    command.push(path_arg(input));
    command.extend(profile.audio_map.iter().cloned());
    command.extend(strings(&[
        "-vf",
        &profile.video_filter,
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        "0",
        "-crf",
        &profile.webm_crf,
        "-deadline",
        "good",
        "-cpu-used",
        "4",
        "-pix_fmt",
        "yuv420p",
    ]));
    command.extend(profile.webm_audio.iter().cloned());
    command.push(path_arg(output));
    Ok(command)
}

fn poster_command(input: &Path, output: &Path, profile: &VideoProfile) -> Result<Vec<String>> {
    Ok(vec![
        "ffmpeg".to_owned(),
        "-hide_banner".to_owned(),
        "-loglevel".to_owned(),
        "error".to_owned(),
        "-y".to_owned(),
        "-ss".to_owned(),
        profile.poster_time.clone(),
        "-i".to_owned(),
        path_arg(input),
        "-map".to_owned(),
        "0:v:0".to_owned(),
        "-frames:v".to_owned(),
        "1".to_owned(),
        "-vf".to_owned(),
        profile.scale_filter.clone(),
        "-q:v".to_owned(),
        "3".to_owned(),
        path_arg(output),
    ])
}

fn run(args: &[String]) -> Result<()> {
    println!("$ {}", format_command(args));
    let status = Command::new(&args[0])
        .args(&args[1..])
        .current_dir(ROOT.as_path())
        .status()
        .with_context(|| format!("failed to run {}", format_command(args)))?;
    if !status.success() {
        bail!(
            "command failed with exit code {}: {}",
            status.code().unwrap_or(1),
            format_command(args)
        );
    }
    Ok(())
}

fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

fn path_arg(path: &Path) -> String {
    path.display().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_widths_clamp_and_deduplicate_in_request_order() {
        assert_eq!(
            target_widths(1000, &[640, 960, 1280, 1000, 960]).unwrap(),
            vec![640, 960, 1000]
        );
        assert!(target_widths(1000, &[0]).is_err());
    }

    #[test]
    fn builds_png_fallback_command() {
        let command =
            image_magick_png_command(Path::new("in.png"), 640, Path::new("out.png")).unwrap();
        assert_eq!(command[0], "magick");
        assert!(command.contains(&"640x>".to_owned()));
        assert_eq!(command.last().unwrap(), "PNG24:out.png");
    }

    #[test]
    fn builds_jpg_fallback_command() {
        let command =
            image_magick_jpg_command(Path::new("in.png"), 640, Path::new("out.jpg")).unwrap();
        assert!(command.contains(&"-background".to_owned()));
        assert!(command.contains(&"white".to_owned()));
        assert_eq!(command.last().unwrap(), "out.jpg");
    }

    #[test]
    fn builds_video_profile_with_fps_and_no_audio() {
        let profile = VideoProfile::from_args(&PreprocessBlogVideoArgs {
            input: PathBuf::from("in.gif"),
            name: "clip".to_owned(),
            output_dir: PathBuf::from("out"),
            max_width: 640,
            fps: Some("15".to_owned()),
            poster_time: "0.5".to_owned(),
            audio: VideoAudio::None,
            mp4_crf: 24,
            webm_crf: 34,
        });
        assert_eq!(
            profile.video_filter,
            "scale='trunc(min(640,iw)/2)*2':-2,fps=15,format=yuv420p"
        );
        assert_eq!(profile.audio_map, strings(&["-map", "0:v:0"]));
        assert_eq!(profile.mp4_audio, strings(&["-an"]));
    }

    #[test]
    fn builds_video_encode_commands() {
        let profile = VideoProfile::from_args(&PreprocessBlogVideoArgs {
            input: PathBuf::from("in.gif"),
            name: "clip".to_owned(),
            output_dir: PathBuf::from("out"),
            max_width: 320,
            fps: None,
            poster_time: "1.25".to_owned(),
            audio: VideoAudio::Keep,
            mp4_crf: 20,
            webm_crf: 30,
        });
        let mp4 = mp4_command(Path::new("in.gif"), Path::new("clip.mp4"), &profile).unwrap();
        assert!(mp4.contains(&"libx264".to_owned()));
        assert!(mp4.contains(&"+faststart".to_owned()));
        assert_eq!(mp4.last().unwrap(), "clip.mp4");

        let poster =
            poster_command(Path::new("in.gif"), Path::new("clip-poster.jpg"), &profile).unwrap();
        assert!(poster.contains(&"1.25".to_owned()));
        assert_eq!(poster.last().unwrap(), "clip-poster.jpg");
    }
}
