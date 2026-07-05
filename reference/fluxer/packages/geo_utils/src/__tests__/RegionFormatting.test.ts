// SPDX-License-Identifier: AGPL-3.0-or-later

import {getRegionDisplayName, getRegionDisplayNames} from '@fluxer/geo_utils/src/RegionFormatting';
import {describe, expect, it} from 'vitest';

describe('getRegionDisplayName', () => {
	it('returns display name for valid region code', () => {
		expect(getRegionDisplayName('US')).toBe('United States');
		expect(getRegionDisplayName('GB')).toBe('United Kingdom');
	});
	it('returns undefined for unknown region code without fallback', () => {
		expect(getRegionDisplayName('XX')).toBeUndefined();
	});
	it('returns region code when fallbackToRegionCode is enabled', () => {
		expect(getRegionDisplayName('XX', {fallbackToRegionCode: true})).toBe('XX');
	});
	it('normalizes and returns fallback for lowercase unknown codes', () => {
		expect(getRegionDisplayName('xx', {fallbackToRegionCode: true})).toBe('XX');
	});
	it('returns undefined for empty string even with fallback', () => {
		expect(getRegionDisplayName('', {fallbackToRegionCode: true})).toBeUndefined();
	});
	it('returns undefined for whitespace-only even with fallback', () => {
		expect(getRegionDisplayName('   ', {fallbackToRegionCode: true})).toBeUndefined();
	});
	it('respects locale option', () => {
		expect(getRegionDisplayName('DE', {locale: 'fr'})).toBe('Allemagne');
	});
	it('uses en-US by default', () => {
		expect(getRegionDisplayName('JP')).toBe('Japan');
	});
});

describe('getRegionDisplayNames', () => {
	it('returns display names for multiple valid codes', () => {
		const result = getRegionDisplayNames(['US', 'FR', 'DE']);
		expect(result).toEqual(['United States', 'France', 'Germany']);
	});
	it('returns undefined for invalid codes without fallback', () => {
		const result = getRegionDisplayNames(['US', 'XX']);
		expect(result).toEqual(['United States', undefined]);
	});
	it('returns fallback codes when enabled', () => {
		const result = getRegionDisplayNames(['US', 'XX'], {fallbackToRegionCode: true});
		expect(result).toEqual(['United States', 'XX']);
	});
	it('respects locale for all entries', () => {
		const result = getRegionDisplayNames(['US', 'DE'], {locale: 'fr'});
		expect(result).toEqual(['États-Unis', 'Allemagne']);
	});
	it('returns empty array for empty input', () => {
		expect(getRegionDisplayNames([])).toEqual([]);
	});
});
