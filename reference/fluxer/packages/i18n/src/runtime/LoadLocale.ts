// SPDX-License-Identifier: AGPL-3.0-or-later

import * as fs from 'node:fs';
import {localeFilePath} from '@fluxer/i18n/src/io/LocaleFilePath';
import {parseYamlRecord} from '@fluxer/i18n/src/io/ParseYamlRecord';
import {buildTemplates} from '@fluxer/i18n/src/runtime/BuildTemplates';
import type {I18nState} from '@fluxer/i18n/src/runtime/I18nTypes';

export function loadLocaleIfNotLoaded<TKey extends string, TValue, TVariables>(
	state: I18nState<TKey, TValue, TVariables>,
	locale: string,
): void {
	if (locale === state.config.defaultLocale) {
		return;
	}
	if (state.loadedLocales.has(locale)) {
		return;
	}
	const filePath = localeFilePath(locale, state.config.localesPath);
	if (!fs.existsSync(filePath)) {
		state.config.onWarning?.(
			`Locale file not found for ${locale}: ${filePath}. Falling back to ${state.config.defaultLocale}.`,
		);
		return;
	}
	const raw = fs.readFileSync(filePath, 'utf8');
	const parsed = parseYamlRecord(raw);
	const templates = buildTemplates(parsed, state.config, filePath);
	let localeMap = state.templatesByLocale.get(locale);
	if (!localeMap) {
		localeMap = new Map();
		state.templatesByLocale.set(locale, localeMap);
	}
	for (const [key, template] of templates) {
		localeMap.set(key, template);
	}
	state.loadedLocales.add(locale);
}
