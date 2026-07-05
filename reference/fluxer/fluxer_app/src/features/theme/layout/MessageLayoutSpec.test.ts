// SPDX-License-Identifier: AGPL-3.0-or-later

import {getMessageLayoutCssVariables, MESSAGE_LAYOUT_SPEC} from '@app/features/theme/layout/MessageLayoutSpec';
import {describe, expect, it} from 'vitest';

function collectStringValues(value: unknown, acc: Array<string>): void {
	if (typeof value === 'string') {
		acc.push(value);
		return;
	}
	if (value && typeof value === 'object') {
		for (const nested of Object.values(value)) {
			collectStringValues(nested, acc);
		}
	}
}

describe('MESSAGE_LAYOUT_SPEC', () => {
	it('declares every length in rem so message layout scales with zoom', () => {
		const values: Array<string> = [];
		collectStringValues(MESSAGE_LAYOUT_SPEC, values);
		expect(values.length).toBeGreaterThan(0);
		for (const value of values) {
			expect(value === '100%' || /^-?\d+(?:\.\d+)?rem$/.test(value)).toBe(true);
		}
	});

	it('emits CSS variables free of raw px lengths', () => {
		for (const value of Object.values(getMessageLayoutCssVariables())) {
			if (value.startsWith('calc(') || value.startsWith('clamp(')) {
				continue;
			}
			expect(value).not.toMatch(/\d+px/);
		}
	});
});
