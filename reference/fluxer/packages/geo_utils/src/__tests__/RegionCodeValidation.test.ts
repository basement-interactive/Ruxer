// SPDX-License-Identifier: AGPL-3.0-or-later

import {isRegionCode, normalizeRegionCode} from '@fluxer/geo_utils/src/RegionCodeValidation';
import {describe, expect, it} from 'vitest';

describe('normalizeRegionCode', () => {
	it('returns uppercase for valid lowercase codes', () => {
		expect(normalizeRegionCode('us')).toBe('US');
		expect(normalizeRegionCode('gb')).toBe('GB');
		expect(normalizeRegionCode('fr')).toBe('FR');
	});
	it('returns uppercase for already uppercase codes', () => {
		expect(normalizeRegionCode('US')).toBe('US');
		expect(normalizeRegionCode('DE')).toBe('DE');
	});
	it('handles mixed case', () => {
		expect(normalizeRegionCode('Us')).toBe('US');
		expect(normalizeRegionCode('gB')).toBe('GB');
	});
	it('trims whitespace', () => {
		expect(normalizeRegionCode(' US ')).toBe('US');
		expect(normalizeRegionCode('\tFR\n')).toBe('FR');
	});
	it('returns undefined for empty string', () => {
		expect(normalizeRegionCode('')).toBeUndefined();
	});
	it('returns undefined for single character', () => {
		expect(normalizeRegionCode('U')).toBeUndefined();
	});
	it('returns undefined for three or more characters', () => {
		expect(normalizeRegionCode('USA')).toBeUndefined();
		expect(normalizeRegionCode('ABCD')).toBeUndefined();
	});
	it('returns undefined for non-alpha characters', () => {
		expect(normalizeRegionCode('12')).toBeUndefined();
		expect(normalizeRegionCode('A1')).toBeUndefined();
		expect(normalizeRegionCode('!@')).toBeUndefined();
	});
	it('returns undefined for whitespace-only input', () => {
		expect(normalizeRegionCode('   ')).toBeUndefined();
	});
});

describe('isRegionCode', () => {
	it('returns true for valid region codes', () => {
		expect(isRegionCode('US')).toBe(true);
		expect(isRegionCode('gb')).toBe(true);
		expect(isRegionCode(' FR ')).toBe(true);
	});
	it('returns false for invalid values', () => {
		expect(isRegionCode('')).toBe(false);
		expect(isRegionCode('USA')).toBe(false);
		expect(isRegionCode('1')).toBe(false);
		expect(isRegionCode('12')).toBe(false);
	});
});
