// SPDX-License-Identifier: AGPL-3.0-or-later

const QUOTE_CHARS = new Set(['"', '\u201c', '\u201d', '\u201f', '\u2033', '\u00ab', '\u00bb']);
const isQuoteChar = (ch: string | undefined): boolean => ch !== undefined && QUOTE_CHARS.has(ch);
const FILTER_PREFIX_REGEX = /^[a-zA-Z_]+:/;
const isFilterPrefix = (value: string): boolean => FILTER_PREFIX_REGEX.test(value);
const skipFilterValue = (query: string, startIndex: number): number => {
	const n = query.length;
	let i = startIndex;
	while (i < n && query[i] === ' ') {
		i++;
	}
	if (i >= n) return i;
	if (isQuoteChar(query[i])) {
		i++;
		let escaped = false;
		while (i < n) {
			const ch = query[i];
			if (escaped) {
				escaped = false;
				i++;
				continue;
			}
			if (ch === '\\') {
				escaped = true;
				i++;
				continue;
			}
			if (ch === '"') {
				i++;
				break;
			}
			i++;
		}
		return i;
	}
	while (i < n && query[i] !== ' ') {
		i++;
	}
	return i;
};

export function tokenizeSearchQuery(query: string): Array<string> {
	const tokens: Array<string> = [];
	const n = query['length'];
	let i = 0;
	while (i < n) {
		while (i < n && query[i] === ' ') {
			i++;
		}
		if (i >= n) {
			break;
		}
		const remaining = query['slice'](i);
		if (isFilterPrefix(remaining)) {
			const colonIndex = remaining.indexOf(':');
			if (colonIndex !== -1) {
				i = skipFilterValue(query, i + colonIndex + 1);
				continue;
			}
		}
		if (isQuoteChar(query[i])) {
			i++;
			let token = '';
			let escaped = false;
			while (i < n) {
				const ch = query[i];
				if (escaped) {
					token += ch;
					escaped = false;
					i++;
					continue;
				}
				if (ch === '\\') {
					escaped = true;
					i++;
					continue;
				}
				if (isQuoteChar(ch)) {
					i++;
					break;
				}
				token += ch;
				i++;
			}
			const trimmed = token.trim();
			if (trimmed) {
				tokens.push(trimmed);
			}
			continue;
		}
		let token = '';
		while (i < n && query[i] !== ' ' && !isQuoteChar(query[i])) {
			token += query[i];
			i++;
		}
		const trimmed = token.trim();
		if (trimmed) {
			tokens.push(trimmed);
		}
	}
	return tokens;
}
