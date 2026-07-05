// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';

import {normalizeGifProviderInfo} from './GifProviderConfig';

describe('normalizeGifProviderInfo', () => {
	it('uses KLIPY as the default GIF provider display name', () => {
		expect(normalizeGifProviderInfo()).toEqual({
			name: 'klipy',
			displayName: 'KLIPY',
			attributionRequired: true,
		});
	});

	it('uses the canonical Tenor display name for the tenor provider', () => {
		expect(normalizeGifProviderInfo({provider: 'tenor', attributionRequired: false})).toEqual({
			name: 'tenor',
			displayName: 'Tenor',
			attributionRequired: false,
		});
	});

	it('falls back unknown provider names to KLIPY', () => {
		expect(normalizeGifProviderInfo({name: 'other'})).toEqual({
			name: 'klipy',
			displayName: 'KLIPY',
			attributionRequired: true,
		});
	});
});
