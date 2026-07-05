// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MessageArgsForTemplate, MessageVariablesForTemplate} from '@fluxer/i18n/src/runtime/MessageCatalogTypes';
import {
	defineStaticLocaleMessages,
	extractMessageTemplateVariables,
	validateMessageTemplateVariables,
} from '@fluxer/i18n/src/runtime/MessageCatalogTypes';
import {describe, expect, expectTypeOf, it} from 'vitest';

describe('message catalog type helpers', () => {
	it('extracts only ICU input variables from plural templates', () => {
		const template = 'Successfully disconnected {count} {count, plural, one {participant} other {participants}}.';
		expect([...extractMessageTemplateVariables(template)]).toEqual(['count']);
		expect(validateMessageTemplateVariables(template, {count: 1})).toBeNull();
	});
	it('extracts nested placeholders inside ICU variants', () => {
		const template = '{count, plural, one {{userName} has one invite} other {{userName} has # invites}}';
		expect([...extractMessageTemplateVariables(template)].sort()).toEqual(['count', 'userName']);
		expect(validateMessageTemplateVariables(template, {count: 2})).toBe('Missing required i18n variable: userName');
	});
	it('types placeholders from literal templates', () => {
		type Variables =
			MessageVariablesForTemplate<'Hello {userName}, you have {count, plural, one {one invite} other {# invites}}.'>;
		type Args = MessageArgsForTemplate<'Hello {userName}.'>;
		type NoArgs = MessageArgsForTemplate<'Hello.'>;
		expectTypeOf<Variables>().toEqualTypeOf<{userName: string | number | boolean | Date; count: number}>();
		expectTypeOf<Args>().toEqualTypeOf<[variables: {userName: string | number | boolean | Date}]>();
		expectTypeOf<NoArgs>().toEqualTypeOf<[variables?: undefined]>();
	});
	it('defines locale messages with source placeholders preserved', () => {
		const defineMessages = defineStaticLocaleMessages<{
			greeting: 'Hello {userName}.';
			count: '{count, plural, one {# item} other {# items}}';
		}>();
		const messages = defineMessages({
			greeting: 'Salut {userName}.',
			count: '{count, plural, one {# element} other {# elements}}',
		});
		expect(messages.greeting).toBe('Salut {userName}.');
	});
});
