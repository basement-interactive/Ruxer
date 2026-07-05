// SPDX-License-Identifier: AGPL-3.0-or-later

use std::collections::HashMap;
use std::ops::Range;
use std::path::PathBuf;

use anyhow::{Context, Result, bail};

use crate::po::{Entry, Translation};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StaticTsCatalogKind {
    SimpleMessages,
    EmailTemplates,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StaticTsCatalogConfig {
    pub kind: StaticTsCatalogKind,
    pub source_path: PathBuf,
    pub source_export: String,
    pub locale_function: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ObjectRange {
    body: Range<usize>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ParsedStringProperty {
    key: String,
    value: String,
    value_range: Range<usize>,
    line_number: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ParsedObjectProperty {
    key: String,
    body: Range<usize>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct StaticSourceMessage {
    context: String,
    source: String,
    line_number: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct StaticTargetCatalog {
    object_body: Range<usize>,
    values: HashMap<String, ParsedStringProperty>,
    template_objects: HashMap<String, ParsedObjectProperty>,
}

pub fn read_static_ts_entries(
    config: &StaticTsCatalogConfig,
    source_content: &str,
    target_content: &str,
    reset: bool,
) -> Result<Vec<Entry>> {
    let source_messages = parse_source_messages(config, source_content)?;
    let target_catalog = parse_target_catalog(config, target_content)?;
    Ok(source_messages
        .into_iter()
        .map(|source| {
            let msgstr = if reset {
                String::new()
            } else {
                target_catalog
                    .values
                    .get(&source.context)
                    .map(|target| target.value.clone())
                    .unwrap_or_default()
            };
            Entry {
                comments: static_comments(config, &source.context),
                references: vec![format!(
                    "#: {}:{}",
                    config.source_path.display(),
                    source.line_number
                )],
                msgctxt: Some(source.context),
                msgid: source.source,
                msgstr,
                line_number: source.line_number,
            }
        })
        .collect())
}

pub fn rebuild_static_ts_allow_replacing(
    config: &StaticTsCatalogConfig,
    source_content: &str,
    target_content: &str,
    translations: &[Translation],
) -> Result<String> {
    let source_messages = parse_source_messages(config, source_content)?;
    let target_catalog = parse_target_catalog(config, target_content)?;
    let translations_by_context = translations
        .iter()
        .filter_map(|translation| {
            translation
                .msgctxt
                .as_ref()
                .map(|context| (context.clone(), translation))
        })
        .collect::<HashMap<_, _>>();
    let mut replacements = Vec::new();
    for (context, translation) in &translations_by_context {
        if let Some(target) = target_catalog.values.get(context) {
            replacements.push((
                target.value_range.clone(),
                escape_ts_single_quoted(&translation.msgstr),
            ));
        }
    }
    match config.kind {
        StaticTsCatalogKind::SimpleMessages => {
            add_missing_simple_translations(
                target_content,
                &target_catalog,
                &source_messages,
                &translations_by_context,
                &mut replacements,
            );
        }
        StaticTsCatalogKind::EmailTemplates => {
            add_missing_email_translations(
                target_content,
                &target_catalog,
                &source_messages,
                &translations_by_context,
                &mut replacements,
            )?;
        }
    }
    apply_replacements(target_content, replacements)
}

pub fn reset_static_ts_translations(
    config: &StaticTsCatalogConfig,
    target_content: &str,
) -> Result<String> {
    let target_catalog = parse_target_catalog(config, target_content)?;
    let replacements = target_catalog
        .values
        .values()
        .map(|target| (target.value_range.clone(), "''".to_string()))
        .collect::<Vec<_>>();
    apply_replacements(target_content, replacements)
}

fn static_comments(config: &StaticTsCatalogConfig, context: &str) -> Vec<String> {
    match config.kind {
        StaticTsCatalogKind::SimpleMessages => {
            vec![format!("#. Static catalog key: {context}")]
        }
        StaticTsCatalogKind::EmailTemplates => {
            vec![format!("#. Email template field: {context}")]
        }
    }
}

fn parse_source_messages(
    config: &StaticTsCatalogConfig,
    source_content: &str,
) -> Result<Vec<StaticSourceMessage>> {
    let object = find_const_object(source_content, &config.source_export)?;
    match config.kind {
        StaticTsCatalogKind::SimpleMessages => {
            parse_string_properties(source_content, &object.body).map(|properties| {
                properties
                    .into_iter()
                    .map(|property| StaticSourceMessage {
                        context: property.key,
                        source: property.value,
                        line_number: property.line_number,
                    })
                    .collect()
            })
        }
        StaticTsCatalogKind::EmailTemplates => {
            let mut messages = Vec::new();
            for template in parse_object_properties(source_content, &object.body)? {
                for field in parse_string_properties(source_content, &template.body)? {
                    if field.key == "subject" || field.key == "body" {
                        messages.push(StaticSourceMessage {
                            context: format!("{}.{}", template.key, field.key),
                            source: field.value,
                            line_number: field.line_number,
                        });
                    }
                }
            }
            Ok(messages)
        }
    }
}

fn parse_target_catalog(
    config: &StaticTsCatalogConfig,
    target_content: &str,
) -> Result<StaticTargetCatalog> {
    let object = find_call_object(target_content, &config.locale_function)?;
    match config.kind {
        StaticTsCatalogKind::SimpleMessages => {
            let values = parse_string_properties(target_content, &object.body)?
                .into_iter()
                .map(|property| (property.key.clone(), property))
                .collect::<HashMap<_, _>>();
            Ok(StaticTargetCatalog {
                object_body: object.body,
                values,
                template_objects: HashMap::new(),
            })
        }
        StaticTsCatalogKind::EmailTemplates => {
            let mut values = HashMap::new();
            let mut template_objects = HashMap::new();
            for template in parse_object_properties(target_content, &object.body)? {
                for field in parse_string_properties(target_content, &template.body)? {
                    if field.key == "subject" || field.key == "body" {
                        values.insert(format!("{}.{}", template.key, field.key), field);
                    }
                }
                template_objects.insert(template.key.clone(), template);
            }
            Ok(StaticTargetCatalog {
                object_body: object.body,
                values,
                template_objects,
            })
        }
    }
}

fn add_missing_simple_translations(
    target_content: &str,
    target_catalog: &StaticTargetCatalog,
    source_messages: &[StaticSourceMessage],
    translations_by_context: &HashMap<String, &Translation>,
    replacements: &mut Vec<(Range<usize>, String)>,
) {
    let lines = source_messages
        .iter()
        .filter(|source| !target_catalog.values.contains_key(&source.context))
        .filter_map(|source| {
            translations_by_context
                .get(&source.context)
                .map(|translation| {
                    format!(
                        "\t{}: {},",
                        escape_property_key(&source.context),
                        escape_ts_single_quoted(&translation.msgstr)
                    )
                })
        })
        .collect::<Vec<_>>();
    if !lines.is_empty() {
        replacements.push(append_to_object_body(
            target_content,
            &target_catalog.object_body,
            lines,
        ));
    }
}

fn add_missing_email_translations(
    target_content: &str,
    target_catalog: &StaticTargetCatalog,
    source_messages: &[StaticSourceMessage],
    translations_by_context: &HashMap<String, &Translation>,
    replacements: &mut Vec<(Range<usize>, String)>,
) -> Result<()> {
    let source_by_context = source_messages
        .iter()
        .map(|source| (source.context.clone(), source.source.clone()))
        .collect::<HashMap<_, _>>();
    let mut source_template_order = Vec::new();
    for source in source_messages {
        let (template_key, _field) = split_email_context(&source.context)?;
        if !source_template_order
            .iter()
            .any(|candidate| candidate == template_key)
        {
            source_template_order.push(template_key.to_string());
        }
    }
    for template_key in &source_template_order {
        if let Some(template) = target_catalog.template_objects.get(template_key) {
            let lines = ["subject", "body"]
                .into_iter()
                .filter_map(|field| {
                    let context = format!("{template_key}.{field}");
                    if target_catalog.values.contains_key(&context) {
                        return None;
                    }
                    translations_by_context.get(&context).map(|translation| {
                        format!(
                            "\t\t{field}: {},",
                            escape_ts_single_quoted(&translation.msgstr)
                        )
                    })
                })
                .collect::<Vec<_>>();
            if !lines.is_empty() {
                replacements.push(append_to_object_body(target_content, &template.body, lines));
            }
        }
    }
    let mut template_blocks = Vec::new();
    for template_key in &source_template_order {
        if target_catalog.template_objects.contains_key(template_key) {
            continue;
        }
        let subject_context = format!("{template_key}.subject");
        let body_context = format!("{template_key}.body");
        let has_selected_translation = translations_by_context.contains_key(&subject_context)
            || translations_by_context.contains_key(&body_context);
        if !has_selected_translation {
            continue;
        }
        let subject = translations_by_context
            .get(&subject_context)
            .map(|translation| translation.msgstr.as_str())
            .or_else(|| source_by_context.get(&subject_context).map(String::as_str))
            .with_context(|| format!("missing source subject for email template {template_key}"))?;
        let body = translations_by_context
            .get(&body_context)
            .map(|translation| translation.msgstr.as_str())
            .or_else(|| source_by_context.get(&body_context).map(String::as_str))
            .with_context(|| format!("missing source body for email template {template_key}"))?;
        template_blocks.push(format!(
            "\t{}: {{\n\t\tsubject: {},\n\t\tbody: {},\n\t}},",
            escape_identifier_or_key(template_key),
            escape_ts_single_quoted(subject),
            escape_ts_single_quoted(body)
        ));
    }
    if !template_blocks.is_empty() {
        replacements.push(append_to_object_body(
            target_content,
            &target_catalog.object_body,
            template_blocks,
        ));
    }
    Ok(())
}

fn split_email_context(context: &str) -> Result<(&str, &str)> {
    let Some((template, field)) = context.rsplit_once('.') else {
        bail!("email catalog context must be <template>.<subject|body>: {context}");
    };
    if field != "subject" && field != "body" {
        bail!("email catalog field must be subject or body: {context}");
    }
    Ok((template, field))
}

fn append_to_object_body(
    content: &str,
    body: &Range<usize>,
    lines: Vec<String>,
) -> (Range<usize>, String) {
    let body_content = &content[body.clone()];
    let trimmed_len = body_content.trim_end().len();
    let insert_at = body.start + trimmed_len;
    let has_existing_entries = !body_content[..trimmed_len].trim().is_empty();
    let mut insertion = String::new();
    if has_existing_entries && !body_content[..trimmed_len].trim_end().ends_with(',') {
        insertion.push(',');
    }
    insertion.push('\n');
    insertion.push_str(&lines.join("\n"));
    (insert_at..insert_at, insertion)
}

fn apply_replacements(
    content: &str,
    mut replacements: Vec<(Range<usize>, String)>,
) -> Result<String> {
    replacements.sort_by(|(left, _), (right, _)| {
        right
            .start
            .cmp(&left.start)
            .then_with(|| right.end.cmp(&left.end))
    });
    let mut rebuilt = content.to_string();
    let mut previous_start = content.len() + 1;
    for (range, replacement) in replacements {
        if range.end > previous_start {
            bail!("overlapping static TS catalog replacements");
        }
        rebuilt.replace_range(range.clone(), &replacement);
        previous_start = range.start;
    }
    Ok(rebuilt)
}

fn find_const_object(content: &str, export_name: &str) -> Result<ObjectRange> {
    let export_index = content
        .find(export_name)
        .with_context(|| format!("failed to find static catalog export {export_name}"))?;
    let open_relative = content[export_index..]
        .find('{')
        .with_context(|| format!("failed to find object literal for {export_name}"))?;
    object_range_at(content, export_index + open_relative)
}

fn find_call_object(content: &str, function_name: &str) -> Result<ObjectRange> {
    let mut search_start = 0;
    while let Some(relative_index) = content[search_start..].find(function_name) {
        let function_index = search_start + relative_index;
        let mut index = function_index + function_name.len();
        index = skip_ws_comments(content, index, content.len())?;
        if byte_at(content, index) != Some(b'(') {
            search_start = index;
            continue;
        }
        index = skip_ws_comments(content, index + 1, content.len())?;
        if byte_at(content, index) != Some(b'{') {
            search_start = index;
            continue;
        }
        return object_range_at(content, index);
    }
    bail!("failed to find static locale function call {function_name}");
}

fn object_range_at(content: &str, open_index: usize) -> Result<ObjectRange> {
    if byte_at(content, open_index) != Some(b'{') {
        bail!("expected object literal at byte {open_index}");
    }
    let close_index = find_matching_brace(content, open_index)?;
    Ok(ObjectRange {
        body: open_index + 1..close_index,
    })
}

fn find_matching_brace(content: &str, open_index: usize) -> Result<usize> {
    let bytes = content.as_bytes();
    let mut depth = 0usize;
    let mut index = open_index;
    let mut state = ScanState::Normal;
    while index < bytes.len() {
        match state {
            ScanState::Normal => match bytes[index] {
                b'\'' | b'"' | b'`' => {
                    state = ScanState::String {
                        quote: bytes[index],
                        escaped: false,
                    };
                    index += 1;
                }
                b'/' if byte_at(content, index + 1) == Some(b'/') => {
                    state = ScanState::LineComment;
                    index += 2;
                }
                b'/' if byte_at(content, index + 1) == Some(b'*') => {
                    state = ScanState::BlockComment;
                    index += 2;
                }
                b'{' => {
                    depth += 1;
                    index += 1;
                }
                b'}' => {
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        return Ok(index);
                    }
                    index += 1;
                }
                _ => index += 1,
            },
            ScanState::String { quote, escaped } => {
                if escaped {
                    state = ScanState::String {
                        quote,
                        escaped: false,
                    };
                } else if bytes[index] == b'\\' {
                    state = ScanState::String {
                        quote,
                        escaped: true,
                    };
                } else if bytes[index] == quote {
                    state = ScanState::Normal;
                }
                index += 1;
            }
            ScanState::LineComment => {
                if bytes[index] == b'\n' {
                    state = ScanState::Normal;
                }
                index += 1;
            }
            ScanState::BlockComment => {
                if bytes[index] == b'*' && byte_at(content, index + 1) == Some(b'/') {
                    state = ScanState::Normal;
                    index += 2;
                } else {
                    index += 1;
                }
            }
        }
    }
    bail!("unterminated object literal")
}

#[derive(Clone, Copy)]
enum ScanState {
    Normal,
    String { quote: u8, escaped: bool },
    LineComment,
    BlockComment,
}

fn parse_string_properties(
    content: &str,
    body: &Range<usize>,
) -> Result<Vec<ParsedStringProperty>> {
    let mut properties = Vec::new();
    let mut index = body.start;
    while index < body.end {
        index = skip_ws_comments(content, index, body.end)?;
        if index >= body.end {
            break;
        }
        if byte_at(content, index) == Some(b',') {
            index += 1;
            continue;
        }
        let (key, next_index) = parse_property_key(content, index, body.end)?;
        index = skip_ws_comments(content, next_index, body.end)?;
        if byte_at(content, index) != Some(b':') {
            bail!("expected ':' after property key {key}");
        }
        index = skip_ws_comments(content, index + 1, body.end)?;
        let value = parse_ts_string(content, index, body.end)
            .with_context(|| format!("expected string literal value for property {key}"))?;
        index = value.value_range.end;
        properties.push(ParsedStringProperty {
            key,
            value: value.value,
            value_range: value.value_range,
            line_number: line_number_at(content, index),
        });
    }
    Ok(properties)
}

fn parse_object_properties(
    content: &str,
    body: &Range<usize>,
) -> Result<Vec<ParsedObjectProperty>> {
    let mut properties = Vec::new();
    let mut index = body.start;
    while index < body.end {
        index = skip_ws_comments(content, index, body.end)?;
        if index >= body.end {
            break;
        }
        if byte_at(content, index) == Some(b',') {
            index += 1;
            continue;
        }
        let (key, next_index) = parse_property_key(content, index, body.end)?;
        index = skip_ws_comments(content, next_index, body.end)?;
        if byte_at(content, index) != Some(b':') {
            bail!("expected ':' after object property key {key}");
        }
        index = skip_ws_comments(content, index + 1, body.end)?;
        let object = object_range_at(content, index)
            .with_context(|| format!("expected object literal value for property {key}"))?;
        index = object.body.end + 1;
        properties.push(ParsedObjectProperty {
            key,
            body: object.body,
        });
    }
    Ok(properties)
}

fn parse_property_key(content: &str, index: usize, end: usize) -> Result<(String, usize)> {
    match byte_at(content, index) {
        Some(b'\'') | Some(b'"') => {
            let parsed = parse_ts_string(content, index, end)?;
            Ok((parsed.value, parsed.value_range.end))
        }
        Some(byte) if is_identifier_start(byte) => {
            let mut next = index + 1;
            while next < end && byte_at(content, next).is_some_and(is_identifier_part) {
                next += 1;
            }
            Ok((content[index..next].to_string(), next))
        }
        _ => bail!("expected property key at byte {index}"),
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ParsedTsString {
    value: String,
    value_range: Range<usize>,
}

fn parse_ts_string(content: &str, start: usize, end: usize) -> Result<ParsedTsString> {
    let quote = byte_at(content, start).context("expected TS string literal")?;
    if quote != b'\'' && quote != b'"' {
        bail!("expected TS string literal at byte {start}");
    }
    let mut value = String::new();
    let mut index = start + 1;
    while index < end {
        let character = content[index..]
            .chars()
            .next()
            .context("invalid TS string literal")?;
        if character as u32 == quote as u32 {
            return Ok(ParsedTsString {
                value,
                value_range: start..index + 1,
            });
        }
        if character == '\\' {
            index += 1;
            let escaped = content[index..]
                .chars()
                .next()
                .context("unterminated escape sequence in TS string literal")?;
            match escaped {
                '\'' => value.push('\''),
                '"' => value.push('"'),
                '\\' => value.push('\\'),
                'n' => value.push('\n'),
                'r' => value.push('\r'),
                't' => value.push('\t'),
                'b' => value.push('\u{0008}'),
                'f' => value.push('\u{000c}'),
                'v' => value.push('\u{000b}'),
                '0' => value.push('\0'),
                'x' => {
                    let (parsed, next_index) = parse_hex_escape(content, index + 1, 2)?;
                    value.push(parsed);
                    index = next_index;
                    continue;
                }
                'u' => {
                    let (parsed, next_index) = parse_unicode_escape(content, index + 1)?;
                    value.push(parsed);
                    index = next_index;
                    continue;
                }
                '\n' => {}
                '\r' => {}
                other => value.push(other),
            }
            index += escaped.len_utf8();
        } else {
            value.push(character);
            index += character.len_utf8();
        }
    }
    bail!("unterminated TS string literal at byte {start}")
}

fn parse_hex_escape(content: &str, start: usize, len: usize) -> Result<(char, usize)> {
    let end = start + len;
    let value = u32::from_str_radix(
        content
            .get(start..end)
            .with_context(|| format!("invalid hex escape at byte {start}"))?,
        16,
    )
    .with_context(|| format!("invalid hex escape at byte {start}"))?;
    let character =
        char::from_u32(value).with_context(|| format!("invalid code point at byte {start}"))?;
    Ok((character, end))
}

fn parse_unicode_escape(content: &str, start: usize) -> Result<(char, usize)> {
    if byte_at(content, start) == Some(b'{') {
        let close_relative = content[start + 1..]
            .find('}')
            .with_context(|| format!("unterminated unicode escape at byte {start}"))?;
        let digits_start = start + 1;
        let digits_end = digits_start + close_relative;
        let value = u32::from_str_radix(&content[digits_start..digits_end], 16)
            .with_context(|| format!("invalid unicode escape at byte {start}"))?;
        let character =
            char::from_u32(value).with_context(|| format!("invalid code point at byte {start}"))?;
        Ok((character, digits_end + 1))
    } else {
        parse_hex_escape(content, start, 4)
    }
}

fn skip_ws_comments(content: &str, mut index: usize, end: usize) -> Result<usize> {
    while index < end {
        match byte_at(content, index) {
            Some(byte) if byte.is_ascii_whitespace() => index += 1,
            Some(b'/') if byte_at(content, index + 1) == Some(b'/') => {
                index += 2;
                while index < end && byte_at(content, index) != Some(b'\n') {
                    index += 1;
                }
            }
            Some(b'/') if byte_at(content, index + 1) == Some(b'*') => {
                let close_relative = content[index + 2..end]
                    .find("*/")
                    .with_context(|| format!("unterminated block comment at byte {index}"))?;
                index = index + 2 + close_relative + 2;
            }
            _ => break,
        }
    }
    Ok(index)
}

fn byte_at(content: &str, index: usize) -> Option<u8> {
    content.as_bytes().get(index).copied()
}

fn line_number_at(content: &str, index: usize) -> usize {
    content[..index]
        .bytes()
        .filter(|byte| *byte == b'\n')
        .count()
        + 1
}

fn is_identifier_start(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || byte == b'_' || byte == b'$'
}

fn is_identifier_part(byte: u8) -> bool {
    is_identifier_start(byte) || byte.is_ascii_digit()
}

fn is_identifier(value: &str) -> bool {
    let mut bytes = value.bytes();
    let Some(first) = bytes.next() else {
        return false;
    };
    is_identifier_start(first) && bytes.all(is_identifier_part)
}

fn escape_property_key(value: &str) -> String {
    escape_ts_single_quoted(value)
}

fn escape_identifier_or_key(value: &str) -> String {
    if is_identifier(value) {
        value.to_string()
    } else {
        escape_ts_single_quoted(value)
    }
}

fn escape_ts_single_quoted(value: &str) -> String {
    let mut escaped = String::from("'");
    for character in value.chars() {
        match character {
            '\\' => escaped.push_str("\\\\"),
            '\'' => escaped.push_str("\\'"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            '\u{2028}' => escaped.push_str("\\u2028"),
            '\u{2029}' => escaped.push_str("\\u2029"),
            other => escaped.push(other),
        }
    }
    escaped.push('\'');
    escaped
}

#[cfg(test)]
mod tests {
    use super::*;

    fn simple_config() -> StaticTsCatalogConfig {
        StaticTsCatalogConfig {
            kind: StaticTsCatalogKind::SimpleMessages,
            source_path: PathBuf::from("SourceMessages.ts"),
            source_export: "SOURCE_MESSAGES".to_string(),
            locale_function: "defineLocaleMessages".to_string(),
        }
    }

    fn email_config() -> StaticTsCatalogConfig {
        StaticTsCatalogConfig {
            kind: StaticTsCatalogKind::EmailTemplates,
            source_path: PathBuf::from("EmailMessages.ts"),
            source_export: "EMAIL_MESSAGES".to_string(),
            locale_function: "defineEmailMessages".to_string(),
        }
    }

    #[test]
    fn reads_and_updates_simple_static_catalogs() {
        let source = "export const SOURCE_MESSAGES = {\n\t'hello.world': 'Hello world',\n\t'bye': 'Bye',\n} as const;\n";
        let target = "import {defineLocaleMessages} from '../Messages';\n\nexport const DE = defineLocaleMessages({\n\t'hello.world': 'Hallo Welt',\n});\n";
        let entries = read_static_ts_entries(&simple_config(), source, target, false).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].msgctxt.as_deref(), Some("hello.world"));
        assert_eq!(entries[0].msgstr, "Hallo Welt");
        assert_eq!(entries[1].msgstr, "");
        let rebuilt = rebuild_static_ts_allow_replacing(
            &simple_config(),
            source,
            target,
            &[
                Translation::new(Some("hello.world".to_string()), "Hello world", "Hallo"),
                Translation::new(Some("bye".to_string()), "Bye", "Tschüss"),
            ],
        )
        .unwrap();
        assert!(rebuilt.contains("'hello.world': 'Hallo',"));
        assert!(rebuilt.contains("'bye': 'Tschüss',"));
    }

    #[test]
    fn reads_and_updates_email_template_catalogs() {
        let source = "export const EMAIL_MESSAGES = {\n\twelcome: {\n\t\tsubject: 'Welcome to {product_name}',\n\t\tbody: 'Hello {username}\\nWelcome.',\n\t},\n\treset_password: {\n\t\tsubject: 'Reset password',\n\t\tbody: 'Use {resetUrl}',\n\t},\n} as const;\n";
        let target = "import {defineEmailMessages} from '../EmailMessages';\n\nexport const DE = defineEmailMessages({\n\twelcome: {\n\t\tsubject: 'Willkommen bei {product_name}',\n\t\tbody: 'Hallo {username}\\nWillkommen.',\n\t},\n});\n";
        let entries = read_static_ts_entries(&email_config(), source, target, false).unwrap();
        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0].msgctxt.as_deref(), Some("welcome.subject"));
        assert_eq!(entries[1].msgid, "Hello {username}\nWelcome.");
        assert_eq!(entries[2].msgstr, "");
        let rebuilt = rebuild_static_ts_allow_replacing(
            &email_config(),
            source,
            target,
            &[
                Translation::new(
                    Some("welcome.body".to_string()),
                    "Hello {username}\nWelcome.",
                    "Hallo {username}\nGuten Tag.",
                ),
                Translation::new(
                    Some("reset_password.subject".to_string()),
                    "Reset password",
                    "Passwort zurücksetzen",
                ),
            ],
        )
        .unwrap();
        assert!(rebuilt.contains("body: 'Hallo {username}\\nGuten Tag.',"));
        assert!(rebuilt.contains("reset_password: {"));
        assert!(rebuilt.contains("subject: 'Passwort zurücksetzen',"));
        assert!(rebuilt.contains("body: 'Use {resetUrl}',"));
    }

    #[test]
    fn reset_clears_existing_static_catalog_values() {
        let target =
            "export const DE = defineLocaleMessages({\n\t'hello.world': 'Hallo Welt',\n});\n";
        let reset = reset_static_ts_translations(&simple_config(), target).unwrap();
        assert!(reset.contains("'hello.world': '',"));
    }
}
