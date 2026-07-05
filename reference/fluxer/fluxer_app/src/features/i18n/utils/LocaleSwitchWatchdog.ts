// SPDX-License-Identifier: AGPL-3.0-or-later

import {onLocaleChange} from '@app/features/i18n/utils/LocaleChangeListener';
import {IS_DEV} from '@app/features/platform/types/Env';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {i18n, type Messages} from '@lingui/core';

const logger = new Logger('LocaleSwitchWatchdog');
const SCAN_DELAY_MS = 2000;
const MIN_STRING_LENGTH = 4;
const MAX_REPORTED = 20;

function collectCatalogStrings(messages: Messages): Set<string> {
	const strings = new Set<string>();
	for (const value of Object.values(messages)) {
		if (typeof value === 'string' && value.trim().length >= MIN_STRING_LENGTH) {
			strings.add(value.trim());
		}
	}
	return strings;
}

function scanForStaleStrings(staleStrings: Set<string>, locale: string): void {
	if (typeof document === 'undefined' || staleStrings.size === 0) {
		return;
	}
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
	const offenders: Array<{text: string; path: string}> = [];
	while (walker.nextNode() && offenders.length < MAX_REPORTED) {
		const text = walker.currentNode.textContent?.trim();
		if (!text || !staleStrings.has(text)) {
			continue;
		}
		const element = walker.currentNode.parentElement;
		if (
			!element ||
			element.closest('input, textarea, [contenteditable], script, style, [data-locale-watchdog-ignore]')
		) {
			continue;
		}
		offenders.push({
			text,
			path: element.closest('[data-flx]')?.getAttribute('data-flx') ?? element.tagName.toLowerCase(),
		});
	}
	if (offenders.length > 0) {
		logger.warn(
			`Found ${offenders.length} stale string(s) still rendered after switching locale to ${locale}. Each was translated under the previous locale and no longer matches the active catalog; the owning component is not re-rendering on locale change.`,
			offenders,
		);
	}
}

let installed = false;
let scanTimer: ReturnType<typeof setTimeout> | null = null;

export function installLocaleSwitchWatchdog(): void {
	if (!IS_DEV || installed || typeof document === 'undefined') {
		return;
	}
	installed = true;
	let previousStrings = collectCatalogStrings(i18n.messages);
	onLocaleChange(() => {
		const currentStrings = collectCatalogStrings(i18n.messages);
		const staleOnly = new Set([...previousStrings].filter((value) => !currentStrings.has(value)));
		previousStrings = currentStrings;
		const locale = i18n.locale;
		if (scanTimer != null) {
			clearTimeout(scanTimer);
		}
		scanTimer = setTimeout(() => {
			scanTimer = null;
			try {
				scanForStaleStrings(staleOnly, locale);
			} catch (error) {
				logger.error('Stale string scan failed:', error);
			}
		}, SCAN_DELAY_MS);
	});
}
