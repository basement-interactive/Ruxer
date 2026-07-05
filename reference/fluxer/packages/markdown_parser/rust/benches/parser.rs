// SPDX-License-Identifier: AGPL-3.0-or-later

use criterion::{Criterion, criterion_group, criterion_main};
use fluxer_markdown_parser::{EmojiContext, MarkdownParser, ParserFlags};
use std::hint::black_box;

fn bench_parser(c: &mut Criterion) {
    let input = "# Heading\n\n> [!NOTE]\n> hello **world**\n\n| a | b |\n| - | - |\n| https://example.com | :smile: |";
    let emoji_context = "C\tsmile\t😄\t1f604\n";
    c.bench_function("parse_mixed_markdown", |b| {
        b.iter(|| {
            let mut parser =
                MarkdownParser::new(ParserFlags::ALL, EmojiContext::parse(emoji_context));
            let nodes = parser.parse(black_box(input)).expect("parse succeeds");
            black_box(nodes);
        });
    });
}

criterion_group!(benches, bench_parser);
criterion_main!(benches);
