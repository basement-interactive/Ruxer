// SPDX-License-Identifier: AGPL-3.0-or-later

import {hasLocaleFile} from '@fluxer/i18n/src/io/LocaleFilePath';
import type {I18nState} from '@fluxer/i18n/src/runtime/I18nTypes';

export function getEffectiveLocale<TKey extends string, TValue, TVariables>(
	state: I18nState<TKey, TValue, TVariables>,
	locale: string | null | undefined,
): string {
	if (!locale) {
		return state.config.defaultLocale;
	}
	const normalizeLocale = state.config.normalizeLocale ?? ((locale: string) => locale);
	const normalizedLocale = normalizeLocale(locale);
	if (normalizedLocale === state.config.defaultLocale) {
		return state.config.defaultLocale;
	}
	if (!hasLocaleFile(normalizedLocale, state.config.localesPath, state.config.defaultLocale)) {
		state.config.onWarning?.(`Unsupported locale, falling back to ${state.config.defaultLocale}: ${locale}`);
		return state.config.defaultLocale;
	}
	return normalizedLocale;
}
