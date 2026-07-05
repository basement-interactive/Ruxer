// SPDX-License-Identifier: AGPL-3.0-or-later

import type {I18nConfig} from '@fluxer/i18n/src/runtime/I18nTypes';

export function buildTemplates<TKey extends string, TValue, TVariables>(
	record: Record<string, unknown>,
	config: I18nConfig<TKey, TValue, TVariables>,
	filePath: string,
): Map<TKey, TValue> {
	const templates = new Map<TKey, TValue>();
	for (const [key, value] of Object.entries(record)) {
		const template = config.parseTemplate(value, key);
		if (template !== null) {
			templates.set(key as TKey, template);
		} else {
			config.onWarning?.(`Skipping invalid template in ${filePath}: ${key}`);
		}
	}
	return templates;
}
