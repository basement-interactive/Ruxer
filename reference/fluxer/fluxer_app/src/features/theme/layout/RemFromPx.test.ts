// SPDX-License-Identifier: AGPL-3.0-or-later

import {REM_BASE_PX, remFromPx} from '@app/features/theme/layout/RemFromPx';
import {describe, expect, it} from 'vitest';

describe('remFromPx', () => {
	it('uses a 16px base', () => {
		expect(REM_BASE_PX).toBe(16);
	});

	it('converts whole pixel sizes to rem', () => {
		expect(remFromPx(16)).toBe('1rem');
		expect(remFromPx(40)).toBe('2.5rem');
		expect(remFromPx(80)).toBe('5rem');
		expect(remFromPx(0)).toBe('0rem');
	});

	it('converts fractional pixel sizes without trailing-zero noise', () => {
		expect(remFromPx(10)).toBe('0.625rem');
		expect(remFromPx(3.2)).toBe('0.2rem');
		expect(remFromPx(4.8)).toBe('0.3rem');
		expect(remFromPx(2.5)).toBe('0.15625rem');
	});

	it('preserves the sign of negative offsets', () => {
		expect(remFromPx(-64.8)).toBe('-4.05rem');
	});

	it('always produces a value parseable as a rem length', () => {
		for (const px of [12, 14, 18, 24, 36, 55, 105, 140, 120]) {
			expect(remFromPx(px)).toMatch(/^-?\d+(?:\.\d+)?rem$/);
		}
	});
});
