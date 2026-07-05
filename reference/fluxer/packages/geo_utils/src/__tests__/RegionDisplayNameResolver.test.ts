// SPDX-License-Identifier: AGPL-3.0-or-later

import {resolveRegionDisplayName, resolveRegionDisplayNames} from '@fluxer/geo_utils/src/RegionDisplayNameResolver';
import {describe, expect, it} from 'vitest';

describe('resolveRegionDisplayName', () => {
	it('resolves known region codes to display names', () => {
		expect(resolveRegionDisplayName('US')).toBe('United States');
		expect(resolveRegionDisplayName('GB')).toBe('United Kingdom');
		expect(resolveRegionDisplayName('FR')).toBe('France');
	});
	it('resolves lowercase region codes', () => {
		expect(resolveRegionDisplayName('us')).toBe('United States');
		expect(resolveRegionDisplayName('de')).toBe('Germany');
	});
	it('returns undefined for invalid codes', () => {
		expect(resolveRegionDisplayName('XX')).toBeUndefined();
		expect(resolveRegionDisplayName('')).toBeUndefined();
		expect(resolveRegionDisplayName('USA')).toBeUndefined();
	});
	it('respects locale parameter', () => {
		const frenchName = resolveRegionDisplayName('DE', 'fr');
		expect(frenchName).toBe('Allemagne');
	});
	it('defaults to en-US when no locale provided', () => {
		expect(resolveRegionDisplayName('JP')).toBe('Japan');
	});
});

describe('resolveRegionDisplayNames', () => {
	it('resolves multiple region codes', () => {
		const result = resolveRegionDisplayNames(['US', 'GB', 'FR']);
		expect(result).toEqual(['United States', 'United Kingdom', 'France']);
	});
	it('returns undefined for invalid entries in the array', () => {
		const result = resolveRegionDisplayNames(['US', 'XX', 'FR']);
		expect(result).toEqual(['United States', undefined, 'France']);
	});
	it('returns empty array for empty input', () => {
		expect(resolveRegionDisplayNames([])).toEqual([]);
	});
	it('respects locale for all entries', () => {
		const result = resolveRegionDisplayNames(['US', 'DE'], 'fr');
		expect(result).toEqual(['États-Unis', 'Allemagne']);
	});
});
