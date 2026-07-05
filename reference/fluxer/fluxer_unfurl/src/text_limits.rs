// SPDX-License-Identifier: AGPL-3.0-or-later

pub const TITLE_MAX: usize = 256;

pub const DESCRIPTION_MAX: usize = 4096;

pub const DESCRIPTION_LINES_MAX: usize = 20;

pub const AUTHOR_NAME_MAX: usize = 256;

pub const PROVIDER_NAME_MAX: usize = 256;

pub const FOOTER_TEXT_MAX: usize = 2048;

pub const MEDIA_DESCRIPTION_MAX: usize = 4096;

pub const FIELD_NAME_MAX: usize = 256;

pub const FIELD_VALUE_MAX: usize = 1024;

pub const HTML_MAX: usize = 12000;

pub const MAX_FIELDS: usize = 25;

pub const MAX_CHILDREN: usize = 1;

pub fn truncate(s: &str, max_len: usize) -> String {
    if s.chars().count() <= max_len {
        return s.to_owned();
    }
    let truncated: String = s.chars().take(max_len.saturating_sub(1)).collect();
    format!("{truncated}\u{2026}")
}

pub fn clamp_lines(s: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = s.lines().collect();
    if lines.len() <= max_lines {
        return s.to_owned();
    }
    let mut result: Vec<&str> = lines[..max_lines].to_vec();
    result.push("\u{2026}");
    result.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_short_string() {
        assert_eq!(truncate("hello", 10), "hello");
    }

    #[test]
    fn truncate_long_string() {
        let result = truncate("hello world", 6);
        assert_eq!(result, "hello\u{2026}");
    }

    #[test]
    fn clamp_lines_within_limit() {
        assert_eq!(clamp_lines("a\nb\nc", 5), "a\nb\nc");
    }

    #[test]
    fn clamp_lines_over_limit() {
        let result = clamp_lines("a\nb\nc\nd", 2);
        assert_eq!(result, "a\nb\n\u{2026}");
    }

    #[test]
    fn truncate_preserves_multibyte_boundaries() {
        let s = "hello 🎉🎊🎁 world";
        let result = truncate(s, 10);
        assert!(result.chars().count() <= 10);
        assert!(result.ends_with('\u{2026}'));
    }

    #[test]
    fn truncate_at_exact_limit() {
        assert_eq!(truncate("12345", 5), "12345");
        assert_eq!(truncate("123456", 5), "1234\u{2026}");
    }

    #[test]
    fn truncate_empty_string() {
        assert_eq!(truncate("", 10), "");
    }

    #[test]
    fn truncate_limit_one() {
        assert_eq!(truncate("ab", 1), "\u{2026}");
    }

    #[test]
    fn clamp_lines_single_line() {
        assert_eq!(clamp_lines("hello", 1), "hello");
    }

    #[test]
    fn clamp_lines_empty() {
        assert_eq!(clamp_lines("", 5), "");
    }

    #[test]
    fn clamp_lines_at_exact_limit() {
        assert_eq!(clamp_lines("a\nb", 2), "a\nb");
        assert_eq!(clamp_lines("a\nb\nc", 2), "a\nb\n\u{2026}");
    }

    #[test]
    fn field_limits_match_old_ts_unfurl_embed_text_limits() {
        assert_eq!(TITLE_MAX, 256);
        assert_eq!(DESCRIPTION_MAX, 4096);
        assert_eq!(DESCRIPTION_LINES_MAX, 20);
        assert_eq!(AUTHOR_NAME_MAX, 256);
        assert_eq!(PROVIDER_NAME_MAX, 256);
        assert_eq!(FOOTER_TEXT_MAX, 2048);
        assert_eq!(MEDIA_DESCRIPTION_MAX, 4096);
        assert_eq!(FIELD_NAME_MAX, 256);
        assert_eq!(FIELD_VALUE_MAX, 1024);
        assert_eq!(HTML_MAX, 12000);
        assert_eq!(MAX_FIELDS, 25);
        assert_eq!(MAX_CHILDREN, 1);
    }
}
