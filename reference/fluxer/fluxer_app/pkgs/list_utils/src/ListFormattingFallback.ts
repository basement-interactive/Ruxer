// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ListFormatType} from '@pkgs/list_utils/src/ListFormattingTypes';

function getFallbackConjunction(type: ListFormatType): string {
	if (type === 'disjunction') {
		return 'or';
	}
	return 'and';
}

export function formatListWithFallback(items: ReadonlyArray<string>, type: ListFormatType): string {
	if (items.length === 0) {
		return '';
	}
	if (items.length === 1) {
		return items[0] ?? '';
	}
	if (type === 'unit') {
		return items.join(', ');
	}
	const conjunction = getFallbackConjunction(type);
	if (items.length === 2) {
		return `${items[0]} ${conjunction} ${items[1]}`;
	}
	const lastItem = items[items.length - 1];
	const leadingItems = items.slice(0, -1).join(', ');
	return `${leadingItems}, ${conjunction} ${lastItem}`;
}
