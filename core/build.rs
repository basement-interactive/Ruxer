//! Build script for the `fluxer` core crate (F.24).
//!
//! Generates Rust model structs from the Fluxer OpenAPI spec
//! (`core/openapi.json`) using `typify-impl`, producing ONLY the curated
//! subset of schemas the client actually uses (plus their transitive `$ref`
//! dependencies). The generated types are written to `$OUT_DIR/types.rs` and
//! included via `core/src/api/generated/mod.rs`.
//!
//! This replaces the hand-written `core/src/models.rs` structs with types
//! derived from the canonical spec, while keeping the hand-written
//! `http.rs` + `ratelimit.rs` transport untouched (the locked hybrid
//! decision from PLAN.md).
//!
//! The full spec contains ~690 structs / ~125 enums; generating all of them
//! would bloat compile time massively. We feed typify only the root schemas
//! we use and let `add_ref_types` resolve their `$ref` graph from the full
//! `components/schemas` map (typify only emits types that are actually
//! referenced by the roots we add).
//!
//! Re-runs when `openapi.json` changes.

use proc_macro2::TokenStream;
use std::collections::BTreeMap;
use typify_impl::{TypeSpace, TypeSpaceSettings};

/// The root schema names (as they appear in `components/schemas`) that the
/// client uses directly. Their transitive `$ref` dependencies are resolved
/// automatically by typify from the full schema map passed to
/// `add_ref_types`.
///
/// The naming convention in the spec uses `*Response` / `*ResponseSchema` /
/// `*Request` suffixes; `generated/mod.rs` re-exports these under the bare
/// names the rest of the crate expects (e.g. `User` = `UserPartialResponse`).
const ROOT_SCHEMAS: &[&str] = &[
    // Core response types.
    "UserPartialResponse",
    "UserPrivateResponse",
    "GuildResponse",
    "ChannelResponse",
    "GuildMemberResponse",
    "GuildRoleResponse",
    "GuildEmojiResponse",
    "MessageResponseSchema",
    "MessageReactionResponse",
    "MessageAttachmentResponse",
    "ReadStateResponse",
    "InviteResponseSchema",
    "RelationshipResponse",
    "GatewayBotResponse",
    "GuildBanResponse",
    "ChannelOverwriteResponse",
    // Auth flow (E.23).
    "AuthLoginResponse",
    "AuthTokenWithUserIdResponse",
    "LoginRequest",
    "MfaTotpRequest",
    // Error envelope.
    "Error",
];

fn main() {
    // Always re-run when the spec changes. The spec lives next to Cargo.toml.
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let spec_path = format!("{manifest_dir}/openapi.json");
    println!("cargo:rerun-if-changed={spec_path}");

    let spec = match std::fs::read_to_string(&spec_path) {
        Ok(s) => s,
        Err(e) => {
            // If the spec isn't present (e.g. a source distribution without
            // the vendored spec), emit a stub so the crate still compiles.
            // The generated module will be empty; hand-written models remain
            // the source of truth in that case.
            println!(
                "cargo:warning=openapi.json not found at {spec_path} ({e}); \
                 skipping type generation"
            );
            let out_dir = std::env::var("OUT_DIR").unwrap();
            std::fs::create_dir_all(&out_dir).ok();
            std::fs::write(format!("{out_dir}/types.rs"), "// spec unavailable; no generated types\n").ok();
            return;
        }
    };

    let root: serde_json::Value = match serde_json::from_str(&spec) {
        Ok(v) => v,
        Err(e) => {
            panic!("failed to parse openapi.json: {e}");
        }
    };

    let components = root
        .pointer("/components/schemas")
        .and_then(|c| c.as_object())
        .cloned()
        .unwrap_or_default();

    // Convert every component schema (JSON Value) into a schemars Schema so
    // typify can resolve `$ref`s across the whole graph.
    let all_schemas: BTreeMap<String, schemars::schema::Schema> = components
        .iter()
        .filter_map(|(name, schema_val)| {
            let schema: schemars::schema::Schema =
                serde_json::from_value(schema_val.clone()).ok()?;
            Some((name.clone(), schema))
        })
        .collect();

    let settings = TypeSpaceSettings::default();
    let mut space = TypeSpace::new(&settings);

    // Register the full schema map so `$ref`s across the whole graph resolve,
    // BUT only the types we explicitly add below will be emitted by
    // `to_stream()`. `add_ref_types` registers types for $ref resolution and
    // emits them — so we DON'T pass the full map there. Instead we build a
    // self-contained sub-map: only the root schemas we use plus the schemas
    // they transitively $ref. This keeps the emitted output to just the types
    // the client actually needs (the full spec is ~690 structs; we need ~60).
    let emit_schemas = collect_transitive(&all_schemas, ROOT_SCHEMAS);
    let ref_pairs: Vec<(String, schemars::schema::Schema)> = emit_schemas
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    if let Err(e) = space.add_ref_types(ref_pairs) {
        panic!("typify add_ref_types error: {e}");
    }

    let stream: TokenStream = space.to_stream();
    let source = stream.to_string();

    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR");
    std::fs::create_dir_all(&out_dir).ok();
    let dest = format!("{out_dir}/types.rs");
    std::fs::write(&dest, &source).expect("write generated types.rs");

    println!(
        "cargo:warning=typify generated {} schemas ({} bytes) to {dest}",
        emit_schemas.len(),
        source.len()
    );
}

/// Walk the schema map starting from `roots` and collect every schema that is
/// transitively reachable via `$ref` (including the roots themselves). This
/// is the closure we feed typify so only the types we use are emitted.
fn collect_transitive(
    all: &BTreeMap<String, schemars::schema::Schema>,
    roots: &[&str],
) -> BTreeMap<String, schemars::schema::Schema> {
    let mut out: BTreeMap<String, schemars::schema::Schema> = BTreeMap::new();
    let mut stack: Vec<String> = roots.iter().map(|s| (*s).to_string()).collect();
    while let Some(name) = stack.pop() {
        if out.contains_key(&name) {
            continue;
        }
        let Some(schema) = all.get(&name) else { continue };
        out.insert(name.clone(), schema.clone());
        // Find all $refs inside this schema and push them onto the stack.
        let schema_json = serde_json::to_value(schema).unwrap_or(serde_json::Value::Null);
        for ref_name in find_refs(&schema_json) {
            if !out.contains_key(&ref_name) {
                stack.push(ref_name);
            }
        }
    }
    out
}

/// Recursively find all `#/components/schemas/<Name>` $ref values in a JSON
/// value (schema or sub-schema).
fn find_refs(v: &serde_json::Value) -> Vec<String> {
    let mut out = Vec::new();
    walk_refs(v, &mut out);
    out
}

fn walk_refs(v: &serde_json::Value, out: &mut Vec<String>) {
    match v {
        serde_json::Value::Object(map) => {
            if let Some(r) = map.get("$ref").and_then(|x| x.as_str()) {
                if let Some(name) = r.strip_prefix("#/components/schemas/") {
                    out.push(name.to_string());
                }
            }
            for (_, child) in map {
                walk_refs(child, out);
            }
        }
        serde_json::Value::Array(arr) => {
            for child in arr {
                walk_refs(child, out);
            }
        }
        _ => {}
    }
}