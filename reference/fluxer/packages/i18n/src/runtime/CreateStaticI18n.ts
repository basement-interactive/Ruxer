// SPDX-License-Identifier: AGPL-3.0-or-later

import type {I18nResult, TemplateCompiler} from '@fluxer/i18n/src/runtime/I18nTypes';
import {getEffectiveStaticLocale} from '@fluxer/i18n/src/runtime/StaticLocale';
import MessageFormat from '@messageformat/core';

export type StaticLocaleMessages<TKey extends string, TValue> = Partial<Record<TKey, TValue>>;

export interface StaticI18nConfig<TKey extends string, TValue, TVariables> {
	defaultLocale: string;
	defaultMessages: Record<TKey, TValue>;
	localeMessages: Record<string, StaticLocaleMessages<TKey, TValue>>;
	normalizeLocale?: (locale: string) => string;
	onWarning?: (message: string) => void;
	validateVariables?: (key: TKey, template: TValue, variables: TVariables) => string | null;
}

interface StaticI18nModule<TKey extends string, TValue, TVariables> {
	getTemplate(key: TKey, locale: string | null, variables: TVariables): I18nResult<TKey, TValue>;
	hasLocale(locale: string): boolean;
	getLoadedLocales(): Set<string>;
	reset(): void;
}

export function createStaticI18n<TKey extends string, TValue, TVariables>(
	config: StaticI18nConfig<TKey, TValue, TVariables>,
	compile: TemplateCompiler<TValue, TVariables>,
): StaticI18nModule<TKey, TValue, TVariables> {
	const loadedLocales = new Set<string>([config.defaultLocale]);
	const messageFormatCache = new Map<string, MessageFormat>();
	function getMessageFormat(locale: string): MessageFormat {
		const cached = messageFormatCache.get(locale);
		if (cached) {
			return cached;
		}
		const messageFormat = new MessageFormat(locale);
		messageFormatCache.set(locale, messageFormat);
		return messageFormat;
	}
	return {
		getTemplate(key: TKey, locale: string | null, variables: TVariables): I18nResult<TKey, TValue> {
			const effectiveLocale = getEffectiveStaticLocale(config, locale);
			loadedLocales.add(effectiveLocale);
			const sourceTemplate = config.defaultMessages[key];
			if (sourceTemplate === undefined) {
				return {
					ok: false,
					error: {
						kind: 'missing-template',
						key,
						message: `Missing template ${key}`,
					},
					locale: effectiveLocale,
				};
			}
			const translatedTemplate = config.localeMessages[effectiveLocale]?.[key];
			const template = translatedTemplate ?? sourceTemplate;
			const validationError = config.validateVariables?.(key, template, variables);
			if (validationError) {
				return {
					ok: false,
					error: {
						kind: 'invalid-variables',
						key,
						message: validationError,
					},
					locale: effectiveLocale,
				};
			}
			try {
				return {
					ok: true,
					value: compile(template, variables, getMessageFormat(effectiveLocale)),
					locale: effectiveLocale,
				};
			} catch (error) {
				return {
					ok: false,
					error: {
						kind: 'compile-failed',
						key,
						message: error instanceof Error ? error.message : 'Failed to compile template',
					},
					locale: effectiveLocale,
				};
			}
		},
		hasLocale(locale: string): boolean {
			const normalizedLocale = config.normalizeLocale?.(locale) ?? locale;
			return normalizedLocale === config.defaultLocale || config.localeMessages[normalizedLocale] !== undefined;
		},
		getLoadedLocales(): Set<string> {
			return new Set(loadedLocales);
		},
		reset(): void {
			loadedLocales.clear();
			loadedLocales.add(config.defaultLocale);
			messageFormatCache.clear();
		},
	};
}
