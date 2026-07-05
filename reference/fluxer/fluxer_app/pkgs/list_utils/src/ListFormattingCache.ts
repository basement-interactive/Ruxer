// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ResolvedListFormatterConfig} from '@pkgs/list_utils/src/ListFormattingTypes';

const formatterCache = new Map<string, Intl.ListFormat>();

export function getCachedListFormatter(config: ResolvedListFormatterConfig): Intl.ListFormat {
	const cacheKey = `${config.locale}:${config.style}:${config.type}`;
	const cachedFormatter = formatterCache.get(cacheKey);
	if (cachedFormatter != null) {
		return cachedFormatter;
	}
	const formatter = new Intl.ListFormat(config.locale, {
		style: config.style,
		type: config.type,
	});
	formatterCache.set(cacheKey, formatter);
	return formatter;
}
