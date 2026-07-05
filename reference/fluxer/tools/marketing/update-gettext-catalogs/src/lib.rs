// SPDX-License-Identifier: AGPL-3.0-or-later

use anyhow::{Context, Result, anyhow, bail};
use chrono::{Local, NaiveDate};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use syn::{
    Expr, ExprLit, ExprMacro, Ident, Lit, Macro, Token, braced,
    parse::{Parse, ParseStream},
    visit::{self, Visit},
};

#[derive(Clone, Debug, PartialEq, Eq)]
struct Descriptor {
    const_name: String,
    key: String,
    message: String,
    comment: String,
}

pub fn find_marketing_root(current_dir: &Path) -> Result<PathBuf> {
    for ancestor in current_dir.ancestors() {
        if is_marketing_root(ancestor) {
            return Ok(ancestor.to_path_buf());
        }
        let child = ancestor.join("fluxer_marketing");
        if is_marketing_root(&child) {
            return Ok(child);
        }
    }
    bail!(
        "could not find fluxer_marketing from {}; run from the repository root or pass fluxer_marketing explicitly",
        current_dir.display()
    );
}

pub fn update_catalogs(root: &Path) -> Result<()> {
    update_catalogs_with_date(root, Local::now().date_naive())
}

pub fn update_catalogs_with_date(root: &Path, today: NaiveDate) -> Result<()> {
    let descriptors = parse_descriptors(root)?;
    let locales_dir = root.join("locales");
    if !locales_dir.is_dir() {
        return Ok(());
    }

    let mut locales = fs::read_dir(&locales_dir)
        .with_context(|| format!("failed to read {}", locales_dir.display()))?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<std::io::Result<Vec<_>>>()
        .with_context(|| format!("failed to read {}", locales_dir.display()))?
        .into_iter()
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("po"))
        .filter_map(|path| {
            path.file_stem()
                .and_then(|stem| stem.to_str())
                .map(str::to_owned)
        })
        .collect::<Vec<_>>();
    locales.sort();

    for locale in locales {
        write_catalog(&locales_dir, &locale, &descriptors, today)?;
    }
    Ok(())
}

fn is_marketing_root(path: &Path) -> bool {
    path.join("src/i18n/descriptors.rs").is_file() && path.join("locales").is_dir()
}

fn parse_descriptors(root: &Path) -> Result<Vec<Descriptor>> {
    let descriptors_path = root.join("src/i18n/descriptors.rs");
    let descriptors_dir = root.join("src/i18n/descriptors");
    let mut descriptors = Vec::new();

    for path in descriptor_sources(&descriptors_path, &descriptors_dir)? {
        let source = fs::read_to_string(&path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        let file = syn::parse_file(&source)
            .with_context(|| format!("failed to parse {}", path.display()))?;
        let mut visitor = MarketingMessageVisitor::new(&path);
        visitor.visit_file(&file);
        for descriptor in visitor.descriptors {
            descriptors.push(descriptor?);
        }
    }

    if descriptors.is_empty() {
        bail!(
            "no descriptors found under {} / {}",
            descriptors_path.display(),
            descriptors_dir.display()
        );
    }
    Ok(descriptors)
}

fn descriptor_sources(descriptors_path: &Path, descriptors_dir: &Path) -> Result<Vec<PathBuf>> {
    let mut sources = vec![descriptors_path.to_path_buf()];
    if descriptors_dir.is_dir() {
        let mut children = fs::read_dir(descriptors_dir)
            .with_context(|| format!("failed to read {}", descriptors_dir.display()))?
            .map(|entry| entry.map(|entry| entry.path()))
            .collect::<std::io::Result<Vec<_>>>()
            .with_context(|| format!("failed to read {}", descriptors_dir.display()))?
            .into_iter()
            .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("rs"))
            .collect::<Vec<_>>();
        children.sort();
        sources.extend(children);
    }
    Ok(sources)
}

struct MarketingMessageVisitor<'a> {
    descriptor_file: &'a Path,
    descriptors: Vec<Result<Descriptor>>,
}

impl<'a> MarketingMessageVisitor<'a> {
    fn new(descriptor_file: &'a Path) -> Self {
        Self {
            descriptor_file,
            descriptors: Vec::new(),
        }
    }
}

impl<'ast> Visit<'ast> for MarketingMessageVisitor<'_> {
    fn visit_macro(&mut self, node: &'ast Macro) {
        if is_marketing_message_macro(node) {
            let descriptor = node
                .parse_body::<MarketingMessageInput>()
                .with_context(|| {
                    format!(
                        "failed to parse marketing_message! descriptor in {}",
                        self.descriptor_file.display()
                    )
                })
                .and_then(|input| input.into_descriptor(self.descriptor_file));
            self.descriptors.push(descriptor);
        }
        visit::visit_macro(self, node);
    }
}

struct MarketingMessageInput {
    const_name: Ident,
    key: Expr,
    message: Expr,
    comment: Expr,
}

impl MarketingMessageInput {
    fn into_descriptor(self, descriptor_file: &Path) -> Result<Descriptor> {
        let const_name = self.const_name.to_string();
        let key = expect_string_literal(&self.key, &const_name, "key", descriptor_file)?;
        let message = parse_descriptor_message(descriptor_file, &const_name, &self.message)?;
        let comment =
            expect_string_literal(&self.comment, &const_name, "comment", descriptor_file)?;
        Ok(Descriptor {
            const_name,
            key,
            message,
            comment,
        })
    }
}

impl Parse for MarketingMessageInput {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        input.parse::<Token![pub]>()?;
        input.parse::<Token![const]>()?;
        let const_name = input.parse()?;
        input.parse::<Token![=]>()?;

        let body;
        braced!(body in input);
        let key = parse_expected_field(&body, "key")?;
        body.parse::<Token![,]>()?;
        let message = parse_expected_field(&body, "message")?;
        body.parse::<Token![,]>()?;
        let comment = parse_expected_field(&body, "comment")?;
        if body.peek(Token![,]) {
            body.parse::<Token![,]>()?;
        }
        if !body.is_empty() {
            return Err(body.error("unexpected descriptor field"));
        }

        input.parse::<Token![;]>()?;
        if !input.is_empty() {
            return Err(input.error("unexpected tokens after descriptor"));
        }

        Ok(Self {
            const_name,
            key,
            message,
            comment,
        })
    }
}

fn parse_expected_field(input: ParseStream, expected_name: &str) -> syn::Result<Expr> {
    let name: Ident = input.parse()?;
    if name != expected_name {
        return Err(syn::Error::new(
            name.span(),
            format!("expected `{expected_name}` field"),
        ));
    }
    input.parse::<Token![:]>()?;
    input.parse()
}

fn is_marketing_message_macro(node: &Macro) -> bool {
    if node.path.leading_colon.is_some() {
        return false;
    }
    let segments = node
        .path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    matches!(segments.as_slice(), [name] if name == "marketing_message")
        || matches!(segments.as_slice(), [root, name] if root == "crate" && name == "marketing_message")
}

fn expect_string_literal(
    expr: &Expr,
    const_name: &str,
    field_name: &str,
    descriptor_file: &Path,
) -> Result<String> {
    if let Expr::Lit(ExprLit {
        lit: Lit::Str(value),
        ..
    }) = expr
    {
        return Ok(value.value());
    }
    bail!(
        "descriptor {} field {} must be a string literal in {}",
        const_name,
        field_name,
        descriptor_file.display()
    );
}

fn parse_descriptor_message(
    descriptor_file: &Path,
    const_name: &str,
    message: &Expr,
) -> Result<String> {
    if let Expr::Lit(ExprLit {
        lit: Lit::Str(value),
        ..
    }) = message
    {
        return Ok(value.value());
    }
    let Expr::Macro(ExprMacro { mac, .. }) = message else {
        bail!(
            "descriptor {} message must be a string literal or include_str!(...) in {}",
            const_name,
            descriptor_file.display()
        );
    };
    if !is_include_str_macro(mac) {
        bail!(
            "descriptor {} message must be a string literal or include_str!(...) in {}",
            const_name,
            descriptor_file.display()
        );
    }
    let relative_path = mac.parse_body::<syn::LitStr>().with_context(|| {
        format!(
            "invalid include_str! descriptor message in {} for {}",
            descriptor_file.display(),
            const_name
        )
    })?;
    let source_path = descriptor_file
        .parent()
        .ok_or_else(|| anyhow!("descriptor file should have a parent directory"))?
        .join(relative_path.value());
    fs::read_to_string(&source_path)
        .with_context(|| format!("failed to read descriptor source {}", source_path.display()))
}

fn is_include_str_macro(node: &Macro) -> bool {
    node.path.leading_colon.is_none()
        && node.path.segments.len() == 1
        && node.path.segments[0].ident == "include_str"
}

fn parse_existing_translations(path: &Path) -> Result<BTreeMap<String, String>> {
    if !path.exists() {
        return Ok(BTreeMap::new());
    }
    let text =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let mut translations = BTreeMap::new();
    for entry in split_po_entries(&text) {
        let context = parse_po_field(entry, "msgctxt")?;
        let msgstr = parse_po_field(entry, "msgstr")?;
        if let (Some(context), Some(msgstr)) = (context, msgstr) {
            translations.insert(context, msgstr);
        }
    }
    Ok(translations)
}

fn split_po_entries(text: &str) -> Vec<&str> {
    let lines = text.split_inclusive('\n').collect::<Vec<_>>();
    let mut entries = Vec::new();
    let mut start = 0;
    let mut offset = 0;
    for line in lines {
        let line_start = offset;
        offset += line.len();
        if line.trim().is_empty() {
            entries.push(&text[start..line_start]);
            start = offset;
        }
    }
    if start <= text.len() {
        entries.push(&text[start..]);
    }
    entries
}

fn parse_po_field(entry: &str, field: &str) -> Result<Option<String>> {
    let prefix = format!("{field} ");
    let lines = entry.lines().collect::<Vec<_>>();
    for (index, line) in lines.iter().enumerate() {
        let Some(value) = line.strip_prefix(&prefix) else {
            continue;
        };
        let mut values = vec![value];
        for continuation in lines.iter().skip(index + 1) {
            if !continuation.starts_with('"') {
                break;
            }
            values.push(continuation);
        }

        let mut parsed = String::new();
        for value in values {
            parsed.push_str(&unescape_po_string(value)?);
        }
        return Ok(Some(parsed));
    }
    Ok(None)
}

fn unescape_po_string(quoted: &str) -> Result<String> {
    if let Ok(value) = serde_json::from_str::<String>(quoted) {
        return Ok(value);
    }

    let stripped = quoted.trim();
    if !stripped.starts_with('"') || !stripped.ends_with('"') {
        bail!("not a PO quoted string: {quoted:?}");
    }
    let inner = &stripped[1..stripped.len() - 1];
    let mut result = String::new();
    let mut chars = inner.chars();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            if let Some(next) = chars.next() {
                match next {
                    'n' => result.push('\n'),
                    't' => result.push('\t'),
                    '\\' => result.push('\\'),
                    '"' => result.push('"'),
                    other => {
                        result.push(ch);
                        result.push(other);
                    }
                }
            } else {
                result.push(ch);
            }
        } else {
            result.push(ch);
        }
    }
    Ok(result)
}

fn write_catalog(
    locales_dir: &Path,
    locale: &str,
    descriptors: &[Descriptor],
    today: NaiveDate,
) -> Result<()> {
    let path = locales_dir.join(format!("{locale}.po"));
    let existing = parse_existing_translations(&path)?;
    let today = today.to_string();
    let mut lines = vec![
        "# SPDX-License-Identifier: AGPL-3.0-or-later".to_owned(),
        "#".to_owned(),
        format!("# Fluxer marketing gettext catalog for {locale}."),
        "msgid \"\"".to_owned(),
        "msgstr \"\"".to_owned(),
        "\"Project-Id-Version: fluxer-marketing\\n\"".to_owned(),
        format!("\"POT-Creation-Date: {today} 00:00+0000\\n\""),
        format!("\"PO-Revision-Date: {today} 00:00+0000\\n\""),
        format!("\"Language: {locale}\\n\""),
        "\"MIME-Version: 1.0\\n\"".to_owned(),
        "\"Content-Type: text/plain; charset=UTF-8\\n\"".to_owned(),
        "\"Content-Transfer-Encoding: 8bit\\n\"".to_owned(),
        "\"Plural-Forms: nplurals=2; plural=(n != 1);\\n\"".to_owned(),
        String::new(),
    ];

    for descriptor in descriptors {
        let translated = if locale == "en-US" {
            descriptor.message.as_str()
        } else {
            existing
                .get(&descriptor.key)
                .map(String::as_str)
                .unwrap_or(&descriptor.message)
        };
        lines.push(format!("#. {}", descriptor.comment));
        lines.push(format!("#: fluxer_marketing/generated:{}", descriptor.key));
        write_field(&mut lines, "msgctxt", &descriptor.key);
        write_field(&mut lines, "msgid", &descriptor.message);
        write_field(&mut lines, "msgstr", translated);
        lines.push(String::new());
    }

    fs::write(&path, lines.join("\n"))
        .with_context(|| format!("failed to write {}", path.display()))
}

fn po_escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
}

fn write_field(lines: &mut Vec<String>, name: &str, value: &str) {
    if !value.contains('\n') && value.chars().count() <= 90 {
        lines.push(format!(r#"{name} "{}""#, po_escape(value)));
        return;
    }

    lines.push(format!(r#"{name} """#));
    for part in split_lines_keepends(value) {
        lines.push(format!(r#""{}""#, po_escape(part)));
    }
}

fn split_lines_keepends(value: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut start = 0;
    for (index, ch) in value.char_indices() {
        if ch == '\n' {
            let end = index + ch.len_utf8();
            parts.push(&value[start..end]);
            start = end;
        }
    }
    if start < value.len() {
        parts.push(&value[start..]);
    }
    if parts.is_empty() {
        parts.push("");
    }
    parts
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn updates_catalogs_from_literals_and_include_str_sources() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("fluxer_marketing");
        fs::create_dir_all(root.join("src/i18n/descriptors")).unwrap();
        fs::create_dir_all(root.join("locales")).unwrap();
        fs::write(
            root.join("src/i18n/descriptors.rs"),
            r#"
marketing_message!(
    pub const SHORT_DESCRIPTOR = {
        key: "app.short",
        message: "Hello \"Fluxer\"",
        comment: "Shown on the fixture page with escaped quotes for translators.",
    };
);
"#,
        )
        .unwrap();
        fs::write(
            root.join("src/i18n/descriptors/extra.rs"),
            r#"
crate::marketing_message!(
    pub const BODY_DESCRIPTOR = {
        key: "content.body",
        message: include_str!("body.txt"),
        comment: "Body copy loaded from a markdown fixture and shown on a content page.",
    };
);
"#,
        )
        .unwrap();
        fs::write(
            root.join("src/i18n/descriptors/body.txt"),
            "Body first line\nBody second \"quote\" \\ path\n",
        )
        .unwrap();
        fs::write(
            root.join("locales/en-US.po"),
            r#"
msgctxt "app.short"
msgid "Old"
msgstr "Outdated"
"#,
        )
        .unwrap();
        fs::write(
            root.join("locales/sv-SE.po"),
            r#"
msgctxt "app.short"
msgid "Old"
msgstr "Preserved short"

msgctxt "content.body"
msgid "Old body"
msgstr ""
"Preserved line one\n"
"Preserved \"quote\" \\ path\n"

msgctxt "obsolete"
msgid "Obsolete"
msgstr "Should disappear"
"#,
        )
        .unwrap();

        update_catalogs_with_date(
            &root,
            NaiveDate::from_ymd_opt(2026, 6, 4).expect("valid date"),
        )
        .unwrap();

        let en_us_path = root.join("locales/en-US.po");
        let sv_se_path = root.join("locales/sv-SE.po");
        let en_us_text = fs::read_to_string(&en_us_path).unwrap();
        let sv_se_text = fs::read_to_string(&sv_se_path).unwrap();

        assert!(en_us_text.contains("\"POT-Creation-Date: 2026-06-04 00:00+0000\\n\""));
        assert!(en_us_text.contains("msgstr \"Hello \\\"Fluxer\\\"\""));
        assert!(en_us_text.contains(
            r#"msgid ""
"Body first line\n"
"Body second \"quote\" \\ path\n""#
        ));
        assert!(sv_se_text.contains("msgstr \"Preserved short\""));
        assert!(!sv_se_text.contains("obsolete"));

        let en_us = parse_existing_translations(&en_us_path).unwrap();
        let sv_se = parse_existing_translations(&sv_se_path).unwrap();
        assert_eq!(en_us["app.short"], "Hello \"Fluxer\"");
        assert_eq!(
            en_us["content.body"],
            "Body first line\nBody second \"quote\" \\ path\n"
        );
        assert_eq!(sv_se["app.short"], "Preserved short");
        assert_eq!(
            sv_se["content.body"],
            "Preserved line one\nPreserved \"quote\" \\ path\n"
        );
    }

    #[test]
    fn writes_long_single_line_fields_as_multiline_po_strings() {
        let value = "x".repeat(91);
        let mut lines = Vec::new();

        write_field(&mut lines, "msgid", &value);

        assert_eq!(lines, vec!["msgid \"\"".to_owned(), format!("\"{value}\"")]);
    }

    #[test]
    fn unescapes_unknown_po_escapes_losslessly() {
        assert_eq!(unescape_po_string(r#""a\qb""#).unwrap(), r#"a\qb"#);
        assert_eq!(
            unescape_po_string(r#""line\nquote\"slash\\""#).unwrap(),
            "line\nquote\"slash\\"
        );
    }

    #[test]
    fn reports_missing_include_str_source() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("fluxer_marketing");
        fs::create_dir_all(root.join("src/i18n/descriptors")).unwrap();
        fs::create_dir_all(root.join("locales")).unwrap();
        fs::write(root.join("locales/en-US.po"), "").unwrap();
        fs::write(root.join("src/i18n/descriptors.rs"), "").unwrap();
        fs::write(
            root.join("src/i18n/descriptors/missing.rs"),
            r#"
crate::marketing_message!(
    pub const MISSING_DESCRIPTOR = {
        key: "missing.body",
        message: include_str!("missing.txt"),
        comment: "Body copy loaded from a missing fixture file for failure handling.",
    };
);
"#,
        )
        .unwrap();

        let err = update_catalogs_with_date(
            &root,
            NaiveDate::from_ymd_opt(2026, 6, 4).expect("valid date"),
        )
        .unwrap_err()
        .to_string();

        assert!(err.contains("failed to read descriptor source"));
        assert!(err.contains("missing.txt"));
    }

    #[test]
    fn finds_marketing_root_from_repo_or_package_directory() {
        let dir = tempdir().unwrap();
        let repo = dir.path();
        let root = repo.join("fluxer_marketing");
        fs::create_dir_all(root.join("src/i18n")).unwrap();
        fs::create_dir_all(root.join("locales")).unwrap();
        fs::write(root.join("src/i18n/descriptors.rs"), "").unwrap();
        let nested_tool_dir = repo.join("tools/marketing/update-gettext-catalogs");
        fs::create_dir_all(&nested_tool_dir).unwrap();

        assert_eq!(find_marketing_root(repo).unwrap(), root);
        assert_eq!(
            find_marketing_root(&repo.join("fluxer_marketing")).unwrap(),
            root
        );
        assert_eq!(find_marketing_root(&nested_tool_dir).unwrap(), root);
    }
}
