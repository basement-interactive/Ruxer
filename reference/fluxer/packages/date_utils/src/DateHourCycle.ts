// SPDX-License-Identifier: AGPL-3.0-or-later

const TWELVE_HOUR_LOCALES = [
	'en-us',
	'en-ca',
	'en-au',
	'en-nz',
	'en-ph',
	'en-in',
	'en-pk',
	'en-bd',
	'en-za',
	'es-mx',
	'es-co',
	'ar',
	'hi',
	'bn',
	'ur',
	'fil',
	'tl',
];

export function localeUses12Hour(locale: string): boolean {
	const lang = locale.toLowerCase();
	return TWELVE_HOUR_LOCALES.some((l) => lang.startsWith(l));
}
