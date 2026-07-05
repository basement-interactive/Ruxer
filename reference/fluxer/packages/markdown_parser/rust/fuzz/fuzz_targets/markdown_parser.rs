#![no_main]

// SPDX-License-Identifier: AGPL-3.0-or-later

use fluxer_markdown_parser::{EmojiContext, MarkdownParser, ParserFlags};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.is_empty() {
        return;
    }
    let flag_seed = data
        .iter()
        .take(4)
        .enumerate()
        .fold(0_u32, |acc, (index, byte)| {
            acc | ((*byte as u32) << (index * 8))
        });
    let flags = flag_seed & ((ParserFlags::ALLOW_AUTOLINKS << 1) - 1);
    let input = String::from_utf8_lossy(&data[4.min(data.len())..]);
    let mut parser = MarkdownParser::new(flags, EmojiContext::default());
    if let Ok(nodes) = parser.parse(&input) {
        let _ = serde_json::to_string(&nodes);
    }
});
