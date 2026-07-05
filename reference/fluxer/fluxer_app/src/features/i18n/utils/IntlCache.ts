// SPDX-License-Identifier: AGPL-3.0-or-later

const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();
const collatorCache = new Map<string, Intl.Collator>();

function getCacheKey(locale: string | undefined, options: object | undefined): string {
	if (!options) {
		return locale ?? '';
	}
	return `${locale ?? ''}|${JSON.stringify(options, Object.keys(options).sort())}`;
}

export function getCachedNumberFormat(locale?: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
	const key = getCacheKey(locale, options);
	let formatter = numberFormatCache.get(key);
	if (!formatter) {
		formatter = new Intl.NumberFormat(locale, options);
		numberFormatCache.set(key, formatter);
	}
	return formatter;
}

export function getCachedDateTimeFormat(locale?: string, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = getCacheKey(locale, options);
	let formatter = dateTimeFormatCache.get(key);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat(locale, options);
		dateTimeFormatCache.set(key, formatter);
	}
	return formatter;
}

export function getCachedCollator(locale?: string, options?: Intl.CollatorOptions): Intl.Collator {
	const key = getCacheKey(locale, options);
	let collator = collatorCache.get(key);
	if (!collator) {
		collator = new Intl.Collator(locale, options);
		collatorCache.set(key, collator);
	}
	return collator;
}
