// SPDX-License-Identifier: AGPL-3.0-or-later

use serde::Serialize;

use crate::ast::Node;
use crate::parser::ParseError;

#[derive(Serialize)]
struct AstEnvelope<'a> {
    nodes: &'a [Node],
}

pub fn write_ast_json(nodes: &[Node]) -> Result<String, ParseError> {
    Ok(serde_json::to_string(&AstEnvelope { nodes })?)
}
