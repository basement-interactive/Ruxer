// SPDX-License-Identifier: AGPL-3.0-or-later

use fluxer_markdown_parser::{EmojiContext, MarkdownParser, ParserFlags};

fn main() {
    let cases = std::env::var("MARKDOWN_STRESS_CASES")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(10_000);
    let mut seed = 0x5eed_c0de_u64;
    for _ in 0..cases {
        let input = generate_case(&mut seed);
        let mut parser = MarkdownParser::new(ParserFlags::ALL, EmojiContext::default());
        let nodes = parser.parse(&input).expect("stress parse should not fail");
        assert!(serde_json::to_string(&nodes).is_ok());
    }
}

fn generate_case(seed: &mut u64) -> String {
    const ATOMS: &[&str] = &[
        "plain",
        "# Heading",
        "||spoiler||",
        "**strong**",
        "*em*",
        "__under__",
        "`code`",
        "[same](https://example.com/path)",
        "https://example.com",
        "<https://example.com>",
        "<user@example.com>",
        "<@123>",
        "@everyone",
        "<t:1234567890:R>",
        ":smile:",
        "😄",
        "<:blob:123456789012345678>",
        "| a | b |\n| - | - |\n| c | d |",
    ];
    const SEPARATORS: &[&str] = &[" ", "\n", "\n\n", ".", "(", ")"];
    let count = 1 + (next(seed) as usize % 8);
    let mut input = String::new();
    for part in 0..count {
        if part > 0 {
            input.push_str(SEPARATORS[next(seed) as usize % SEPARATORS.len()]);
        }
        input.push_str(ATOMS[next(seed) as usize % ATOMS.len()]);
    }
    input
}

fn next(seed: &mut u64) -> u64 {
    *seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
    *seed
}
