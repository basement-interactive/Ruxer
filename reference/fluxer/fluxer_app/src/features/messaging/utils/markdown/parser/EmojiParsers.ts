// SPDX-License-Identifier: AGPL-3.0-or-later

export interface UnicodeEmoji {
	surrogates: string;
}

export interface EmojiProvider {
	getSurrogateName(surrogate: string): string | null;
	findEmojiByName(name: string): UnicodeEmoji | null;
	findEmojiWithSkinTone(baseName: string, skinToneSurrogate: string): UnicodeEmoji | null;
}

export interface EmojiParserConfig {
	emojiProvider?: EmojiProvider;
	emojiRegex?: RegExp;
	skinToneSurrogates?: ReadonlyArray<string>;
	convertToCodePoints?: (emoji: string) => string;
}

let globalEmojiConfig: EmojiParserConfig | null = null;

export function setEmojiParserConfig(config: EmojiParserConfig): void {
	globalEmojiConfig = config;
}

export function getEmojiParserConfig(): EmojiParserConfig | null {
	return globalEmojiConfig;
}
