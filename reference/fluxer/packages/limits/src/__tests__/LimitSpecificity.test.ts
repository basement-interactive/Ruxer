// SPDX-License-Identifier: AGPL-3.0-or-later

import {calculateSpecificity, compareSpecificity} from '@fluxer/limits/src/LimitSpecificity';
import {describe, expect, test} from 'vitest';

describe('LimitSpecificity', () => {
	test('calculateSpecificity returns 0 for undefined filters', () => {
		expect(calculateSpecificity(undefined)).toBe(0);
	});
	test('calculateSpecificity returns 0 for empty filters', () => {
		expect(calculateSpecificity({})).toBe(0);
	});
	test('calculateSpecificity counts traits', () => {
		expect(calculateSpecificity({traits: ['premium']})).toBe(1);
		expect(calculateSpecificity({traits: ['premium', 'verified']})).toBe(2);
	});
	test('calculateSpecificity counts guild features', () => {
		expect(calculateSpecificity({guildFeatures: ['MORE_EMOJI']})).toBe(1);
		expect(calculateSpecificity({guildFeatures: ['MORE_EMOJI', 'MORE_STICKERS']})).toBe(2);
	});
	test('calculateSpecificity counts combined traits and guild features', () => {
		expect(calculateSpecificity({traits: ['premium'], guildFeatures: ['MORE_EMOJI']})).toBe(2);
		expect(
			calculateSpecificity({
				traits: ['premium', 'verified'],
				guildFeatures: ['MORE_EMOJI', 'MORE_STICKERS'],
			}),
		).toBe(4);
	});
	test('compareSpecificity returns negative when a is less specific', () => {
		expect(compareSpecificity(undefined, {traits: ['premium']})).toBeLessThan(0);
		expect(compareSpecificity({traits: ['premium']}, {traits: ['premium', 'verified']})).toBeLessThan(0);
	});
	test('compareSpecificity returns 0 when equal specificity', () => {
		expect(compareSpecificity(undefined, undefined)).toBe(0);
		expect(compareSpecificity({traits: ['premium']}, {traits: ['verified']})).toBe(0);
	});
	test('compareSpecificity returns positive when a is more specific', () => {
		expect(compareSpecificity({traits: ['premium']}, undefined)).toBeGreaterThan(0);
		expect(compareSpecificity({traits: ['premium', 'verified']}, {traits: ['premium']})).toBeGreaterThan(0);
	});
});
