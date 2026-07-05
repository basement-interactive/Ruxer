// SPDX-License-Identifier: AGPL-3.0-or-later

import type MessageFormat from '@messageformat/core';

type I18nErrorKind = 'missing-template' | 'invalid-variables' | 'compile-failed';

export interface I18nError<TKey extends string> {
	kind: I18nErrorKind;
	key: TKey;
	message: string;
}

export type I18nResult<TKey extends string, TValue> =
	| {
			ok: true;
			value: TValue;
			locale: string;
	  }
	| {
			ok: false;
			error: I18nError<TKey>;
			locale: string;
	  };

export interface I18nState<TKey extends string, TValue, TVariables> {
	loadedLocales: Set<string>;
	templatesByLocale: Map<string, Map<TKey, TValue>>;
	messageFormatCache: Map<string, MessageFormat>;
	config: I18nConfig<TKey, TValue, TVariables>;
}

export interface I18nConfig<TKey extends string, TValue, TVariables> {
	localesPath: string;
	defaultLocale: string;
	defaultMessagesFile: string;
	normalizeLocale?: (locale: string) => string;
	parseTemplate: (value: unknown, key: string) => TValue | null;
	onWarning?: (message: string) => void;
	validateVariables?: (key: TKey, template: TValue, variables: TVariables) => string | null;
}

export type TemplateCompiler<TValue, TVariables> = (
	template: TValue,
	variables: TVariables,
	mf: MessageFormat,
) => TValue;
