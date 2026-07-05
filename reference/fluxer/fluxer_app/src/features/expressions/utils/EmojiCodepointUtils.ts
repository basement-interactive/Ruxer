// SPDX-License-Identifier: AGPL-3.0-or-later

export function convertToCodePoints(emoji: string): string {
	const containsZWJ = emoji.includes('\u200D');
	const processedEmoji = containsZWJ ? emoji : emoji.replace(/\uFE0F/g, '');
	return Array.from(processedEmoji)
		.map((char) => char.codePointAt(0)?.toString(16).replace(/^0+/, '') || '')
		.join('-');
}
