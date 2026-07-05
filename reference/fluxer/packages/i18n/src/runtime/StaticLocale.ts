// SPDX-License-Identifier: AGPL-3.0-or-later

import type {StaticI18nConfig} from '@fluxer/i18n/src/runtime/CreateStaticI18n';

export function getEffectiveStaticLocale<TKey extends string, TValue, TVariables>(
	config: StaticI18nConfig<TKey, TValue, TVariables>,
	locale: string | null | undefined,
): string {
	if (!locale) {
		return config.defaultLocale;
	}
	const normalizedLocale = config.normalizeLocale?.(locale) ?? locale;
	if (normalizedLocale === config.defaultLocale) {
		return config.defaultLocale;
	}
	if (config.localeMessages[normalizedLocale] === undefined) {
		config.onWarning?.(`Unsupported locale, falling back to ${config.defaultLocale}: ${locale}`);
		return config.defaultLocale;
	}
	return normalizedLocale;
}
