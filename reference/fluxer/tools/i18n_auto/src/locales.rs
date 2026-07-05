// SPDX-License-Identifier: AGPL-3.0-or-later

pub const LOCALE_DISPLAY_NAMES: &[(&str, &str)] = &[
    ("ar", "Arabic"),
    ("bg", "Bulgarian"),
    ("cs", "Czech"),
    ("da", "Danish"),
    ("de", "German"),
    ("el", "Greek"),
    ("en-GB", "English (United Kingdom)"),
    ("es-419", "Spanish (Latin America)"),
    ("es-ES", "Spanish (Spain)"),
    ("fi", "Finnish"),
    ("fr", "French"),
    ("he", "Hebrew"),
    ("hi", "Hindi"),
    ("hr", "Croatian"),
    ("hu", "Hungarian"),
    ("id", "Indonesian"),
    ("it", "Italian"),
    ("ja", "Japanese"),
    ("ko", "Korean"),
    ("lt", "Lithuanian"),
    ("nl", "Dutch"),
    ("no", "Norwegian Bokmal"),
    ("pl", "Polish"),
    ("pt-BR", "Portuguese (Brazil)"),
    ("ro", "Romanian"),
    ("ru", "Russian"),
    ("sv-SE", "Swedish (Sweden)"),
    ("th", "Thai"),
    ("tr", "Turkish"),
    ("uk", "Ukrainian"),
    ("vi", "Vietnamese"),
    ("zh-CN", "Simplified Chinese (Mainland China)"),
    ("zh-TW", "Traditional Chinese (Taiwan)"),
];

pub fn display_name(locale: &str) -> &str {
    LOCALE_DISPLAY_NAMES
        .iter()
        .find_map(|(candidate, name)| (*candidate == locale).then_some(*name))
        .unwrap_or(locale)
}

pub fn is_supported_locale(locale: &str) -> bool {
    LOCALE_DISPLAY_NAMES
        .iter()
        .any(|(candidate, _name)| *candidate == locale)
}
