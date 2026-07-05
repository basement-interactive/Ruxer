// SPDX-License-Identifier: AGPL-3.0-or-later

export function isLinkWrappedInAngleBrackets(content: string, matchStart: number, matchLength: number): boolean {
	if (matchLength <= 0) return false;
	const beforeIndex = matchStart - 1;
	const afterIndex = matchStart + matchLength;
	if (beforeIndex < 0 || afterIndex >= content.length) {
		return false;
	}
	return content[beforeIndex] === '<' && content[afterIndex] === '>';
}
