// SPDX-License-Identifier: AGPL-3.0-or-later

use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaKind {
    Image,
    Video,
    Audio,
}

pub fn detect_media_kind(url: &Url) -> Option<MediaKind> {
    let path = url.path().to_ascii_lowercase();
    let dot_idx = path.rfind('.')?;
    let ext = &path[dot_idx..];

    match ext {
        ".png" | ".jpg" | ".jpeg" | ".gif" | ".webp" | ".avif" | ".svg" | ".bmp" | ".apng"
        | ".heic" | ".heif" | ".tif" | ".tiff" => Some(MediaKind::Image),

        ".mp4" | ".webm" | ".mov" | ".avi" | ".mkv" | ".m4v" | ".ogv" | ".mpeg" | ".mpg"
        | ".3gp" | ".3g2" | ".m3u8" | ".ts" => Some(MediaKind::Video),

        ".mp3" | ".ogg" | ".wav" | ".flac" | ".m4a" | ".aac" | ".opus" | ".weba" | ".oga"
        | ".aif" | ".aiff" | ".amr" | ".mid" | ".midi" => Some(MediaKind::Audio),

        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn detects_image_extensions() {
        for ext in &[
            "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "apng",
        ] {
            let url = u(&format!("https://e.com/f.{ext}"));
            assert_eq!(
                detect_media_kind(&url),
                Some(MediaKind::Image),
                "failed for .{ext}"
            );
        }
    }

    #[test]
    fn detects_video_extensions() {
        for ext in &["mp4", "webm", "mov", "avi", "mkv", "m4v", "ogv"] {
            let url = u(&format!("https://e.com/f.{ext}"));
            assert_eq!(
                detect_media_kind(&url),
                Some(MediaKind::Video),
                "failed for .{ext}"
            );
        }
    }

    #[test]
    fn detects_audio_extensions() {
        for ext in &["mp3", "ogg", "wav", "flac", "m4a", "aac", "opus"] {
            let url = u(&format!("https://e.com/f.{ext}"));
            assert_eq!(
                detect_media_kind(&url),
                Some(MediaKind::Audio),
                "failed for .{ext}"
            );
        }
    }

    #[test]
    fn returns_none_for_non_media() {
        assert_eq!(detect_media_kind(&u("https://e.com/page.html")), None);
        assert_eq!(detect_media_kind(&u("https://e.com/data.json")), None);
        assert_eq!(detect_media_kind(&u("https://e.com/no-ext")), None);
    }

    #[test]
    fn case_insensitive_extensions() {
        assert_eq!(
            detect_media_kind(&u("https://e.com/f.PNG")),
            Some(MediaKind::Image)
        );
        assert_eq!(
            detect_media_kind(&u("https://e.com/f.MP4")),
            Some(MediaKind::Video)
        );
        assert_eq!(
            detect_media_kind(&u("https://e.com/f.FLAC")),
            Some(MediaKind::Audio)
        );
    }

    #[test]
    fn extension_list_matches_old_ts_unfurler_service() {
        let image_exts = [
            ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".bmp", ".apng", ".heic",
            ".heif", ".tif", ".tiff",
        ];
        let video_exts = [
            ".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".ogv", ".mpeg", ".mpg", ".3gp",
            ".3g2", ".m3u8", ".ts",
        ];
        let audio_exts = [
            ".mp3", ".ogg", ".wav", ".flac", ".m4a", ".aac", ".opus", ".weba", ".oga", ".aif",
            ".aiff", ".amr", ".mid", ".midi",
        ];

        for ext in &image_exts {
            assert_eq!(
                detect_media_kind(&u(&format!("https://e.com/f{ext}"))),
                Some(MediaKind::Image),
                "expected Image for {ext}"
            );
        }
        for ext in &video_exts {
            assert_eq!(
                detect_media_kind(&u(&format!("https://e.com/f{ext}"))),
                Some(MediaKind::Video),
                "expected Video for {ext}"
            );
        }
        for ext in &audio_exts {
            assert_eq!(
                detect_media_kind(&u(&format!("https://e.com/f{ext}"))),
                Some(MediaKind::Audio),
                "expected Audio for {ext}"
            );
        }
    }

    #[test]
    fn query_params_do_not_interfere() {
        assert_eq!(
            detect_media_kind(&u("https://e.com/image.png?size=large")),
            Some(MediaKind::Image)
        );
    }

    #[test]
    fn url_with_fragment_still_detected() {
        assert_eq!(
            detect_media_kind(&u("https://e.com/video.mp4#t=10")),
            Some(MediaKind::Video)
        );
    }

    #[test]
    fn no_dot_in_path_returns_none() {
        assert_eq!(detect_media_kind(&u("https://e.com/pathonly")), None);
    }
}
