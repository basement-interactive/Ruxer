// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {getEffectiveVideoLayoutDimensions, hasDifferentAspectRatio, resolveVideoLayout} from './VideoDimensionUtils';

describe('getEffectiveVideoLayoutDimensions', () => {
	it('prefers decoded dimensions over declared upload dimensions', () => {
		expect(getEffectiveVideoLayoutDimensions({width: 1280, height: 700}, {width: 1920, height: 700})).toEqual({
			width: 1920,
			height: 700,
		});
	});

	it('prefers decoded dimensions for rotated portrait video', () => {
		expect(getEffectiveVideoLayoutDimensions({width: 1920, height: 1080}, {width: 1080, height: 1920})).toEqual({
			width: 1080,
			height: 1920,
		});
	});

	it('falls back to declared dimensions until metadata decodes', () => {
		expect(getEffectiveVideoLayoutDimensions({width: 640, height: 360}, null)).toEqual({width: 640, height: 360});
	});

	it('falls back to a 16:9 default when nothing is known', () => {
		expect(getEffectiveVideoLayoutDimensions(null, null)).toEqual({width: 16, height: 9});
	});

	it('ignores invalid decoded dimensions', () => {
		expect(getEffectiveVideoLayoutDimensions({width: 640, height: 360}, {width: 0, height: 0})).toEqual({
			width: 640,
			height: 360,
		});
	});
});

describe('poster aspect-ratio mismatch detection', () => {
	it('flags an anamorphic thumbnail as mismatched against the decoded video', () => {
		expect(hasDifferentAspectRatio({width: 1920, height: 700}, {width: 1280, height: 700}, 0.05)).toBe(true);
	});

	it('flags a rotated (inverted) thumbnail as mismatched', () => {
		expect(hasDifferentAspectRatio({width: 1080, height: 1920}, {width: 1920, height: 1080}, 0.05)).toBe(true);
	});

	it('treats a matching thumbnail as consistent within tolerance', () => {
		expect(hasDifferentAspectRatio({width: 1920, height: 1080}, {width: 1280, height: 720}, 0.05)).toBe(false);
	});
});

describe('resolveVideoLayout', () => {
	it('produces an aspect ratio matching the decoded display dimensions', () => {
		const {aspectRatio} = resolveVideoLayout({width: 1920, height: 700}, {maxWidth: 400, maxHeight: 400});
		const [w, h] = aspectRatio.split(' / ').map(Number);
		expect(w / h).toBeCloseTo(1920 / 700, 1);
	});
});
