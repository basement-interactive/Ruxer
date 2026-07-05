// SPDX-License-Identifier: AGPL-3.0-or-later

import {compileTemplate} from '@fluxer/i18n/src/runtime/CompileTemplate';
import {getEffectiveLocale} from '@fluxer/i18n/src/runtime/GetEffectiveLocale';
import type {I18nResult, I18nState, TemplateCompiler} from '@fluxer/i18n/src/runtime/I18nTypes';
import {loadLocaleIfNotLoaded} from '@fluxer/i18n/src/runtime/LoadLocale';
import MessageFormat from '@messageformat/core';

export function getTemplate<TKey extends string, TValue, TVariables>(
	state: I18nState<TKey, TValue, TVariables>,
	key: TKey,
	locale: string | null,
	variables: TVariables,
	compile: TemplateCompiler<TValue, TVariables>,
): I18nResult<TKey, TValue> {
	const effectiveLocale = getEffectiveLocale(state, locale);
	loadLocaleIfNotLoaded(state, effectiveLocale);
	const sourceTemplate = state.templatesByLocale.get(state.config.defaultLocale)?.get(key);
	if (!sourceTemplate) {
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
	const translatedTemplate = state.templatesByLocale.get(effectiveLocale)?.get(key);
	const template = translatedTemplate ?? sourceTemplate;
	const validationError = state.config.validateVariables?.(key, template, variables);
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
		const compiled = compileTemplate(compile, template, variables, getMessageFormat(state, effectiveLocale));
		return {ok: true, value: compiled, locale: effectiveLocale};
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
}

function getMessageFormat<TKey extends string, TValue, TVariables>(
	state: I18nState<TKey, TValue, TVariables>,
	locale: string,
): MessageFormat {
	const cached = state.messageFormatCache.get(locale);
	if (cached) {
		return cached;
	}
	const mf = new MessageFormat(locale);
	state.messageFormatCache.set(locale, mf);
	return mf;
}
