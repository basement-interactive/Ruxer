// SPDX-License-Identifier: AGPL-3.0-or-later

export function isIntlListFormatSupported(): boolean {
	return typeof Intl !== 'undefined' && typeof Intl.ListFormat !== 'undefined';
}

export function isIntlListFormatLocaleSupported(locale: string): boolean {
	if (!isIntlListFormatSupported()) {
		return false;
	}
	try {
		return Intl.ListFormat.supportedLocalesOf([locale]).length > 0;
	} catch {
		return false;
	}
}
