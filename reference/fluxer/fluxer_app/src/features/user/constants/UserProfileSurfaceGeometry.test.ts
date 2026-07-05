// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	PROFILE_MODAL_BANNER_AVATAR_CUTOUT,
	PROFILE_MODAL_GEOMETRY,
	PROFILE_MODAL_GEOMETRY_STYLE,
	PROFILE_POPOUT_BANNER_AVATAR_CUTOUT,
	PROFILE_POPOUT_GEOMETRY,
	PROFILE_POPOUT_GEOMETRY_STYLE,
	PROFILE_POPOUT_OUTER_HEIGHT_PX,
	PROFILE_POPOUT_OUTER_WIDTH_PX,
} from '@app/features/user/constants/UserProfileSurfaceGeometry';
import {describe, expect, it} from 'vitest';

function rem(value: string): number {
	const match = /^(-?\d+(?:\.\d+)?)rem$/.exec(value);
	if (!match) {
		throw new Error(`Expected rem length, got ${value}`);
	}
	return Number(match[1]) * 16;
}

describe('PROFILE_POPOUT_GEOMETRY', () => {
	it('derives the reserved outer width from content width plus both borders', () => {
		expect(PROFILE_POPOUT_OUTER_WIDTH_PX).toBe(
			PROFILE_POPOUT_GEOMETRY.contentWidthPx + PROFILE_POPOUT_GEOMETRY.borderWidthPx * 2,
		);
	});

	it('derives the reserved outer height from content height plus both borders', () => {
		expect(PROFILE_POPOUT_OUTER_HEIGHT_PX).toBe(
			PROFILE_POPOUT_GEOMETRY.contentHeightPx + PROFILE_POPOUT_GEOMETRY.borderWidthPx * 2,
		);
	});

	it('exports rem CSS variables that exactly represent the geometry constants', () => {
		expect(rem(PROFILE_POPOUT_GEOMETRY_STYLE['--profile-popout-content-width'])).toBeCloseTo(
			PROFILE_POPOUT_GEOMETRY.contentWidthPx,
		);
		expect(rem(PROFILE_POPOUT_GEOMETRY_STYLE['--profile-popout-content-height'])).toBeCloseTo(
			PROFILE_POPOUT_GEOMETRY.contentHeightPx,
		);
		expect(rem(PROFILE_POPOUT_GEOMETRY_STYLE['--profile-popout-border-width'])).toBeCloseTo(
			PROFILE_POPOUT_GEOMETRY.borderWidthPx,
		);
		expect(rem(PROFILE_POPOUT_GEOMETRY_STYLE['--profile-popout-avatar-size'])).toBeCloseTo(
			PROFILE_POPOUT_GEOMETRY.avatarSizePx,
		);
		expect(rem(PROFILE_POPOUT_GEOMETRY_STYLE['--profile-popout-avatar-border'])).toBeCloseTo(
			PROFILE_POPOUT_GEOMETRY.avatarBorderPx,
		);
		expect(rem(PROFILE_POPOUT_GEOMETRY_STYLE['--profile-popout-banner-height'])).toBeCloseTo(
			PROFILE_POPOUT_GEOMETRY.bannerHeightPx,
		);
		expect(rem(PROFILE_POPOUT_GEOMETRY_STYLE['--profile-popout-header-height'])).toBeCloseTo(
			PROFILE_POPOUT_GEOMETRY.headerHeightPx,
		);
	});

	it('emits only rem lengths for both profile geometry surfaces', () => {
		for (const value of Object.values(PROFILE_POPOUT_GEOMETRY_STYLE)) {
			expect(value).toMatch(/^-?\d+(?:\.\d+)?rem$/);
		}
		for (const value of Object.values(PROFILE_MODAL_GEOMETRY_STYLE)) {
			expect(value).toMatch(/^-?\d+(?:\.\d+)?rem$/);
		}
	});

	it('represents the modal geometry constants as rem CSS variables', () => {
		expect(rem(PROFILE_MODAL_GEOMETRY_STYLE['--profile-modal-avatar-size'])).toBeCloseTo(
			PROFILE_MODAL_GEOMETRY.avatarSizePx,
		);
		expect(rem(PROFILE_MODAL_GEOMETRY_STYLE['--profile-modal-avatar-border'])).toBeCloseTo(
			PROFILE_MODAL_GEOMETRY.avatarBorderPx,
		);
		expect(rem(PROFILE_MODAL_GEOMETRY_STYLE['--profile-modal-avatar-left'])).toBeCloseTo(
			PROFILE_MODAL_GEOMETRY.avatarLeftPx,
		);
		expect(rem(PROFILE_MODAL_GEOMETRY_STYLE['--profile-modal-avatar-top'])).toBeCloseTo(
			PROFILE_MODAL_GEOMETRY.avatarTopPx,
		);
	});

	it('proves the skeleton loading shell reserves the declared content rectangle plus both borders', () => {
		const skeletonOuterWidth = PROFILE_POPOUT_GEOMETRY.contentWidthPx + PROFILE_POPOUT_GEOMETRY.borderWidthPx * 2;
		const skeletonOuterHeight = PROFILE_POPOUT_GEOMETRY.contentHeightPx + PROFILE_POPOUT_GEOMETRY.borderWidthPx * 2;

		expect(skeletonOuterWidth).toBe(PROFILE_POPOUT_OUTER_WIDTH_PX);
		expect(skeletonOuterHeight).toBe(PROFILE_POPOUT_OUTER_HEIGHT_PX);
	});

	it('uses avatar status gutter widths for profile banner avatar cutouts', () => {
		expect(PROFILE_POPOUT_GEOMETRY.avatarBorderPx).toBe(3.2);
		expect(PROFILE_MODAL_GEOMETRY.avatarBorderPx).toBe(4.8);
		expect(PROFILE_POPOUT_BANNER_AVATAR_CUTOUT.r).toBe(
			PROFILE_POPOUT_GEOMETRY.avatarSizePx / 2 + PROFILE_POPOUT_GEOMETRY.avatarBorderPx,
		);
		expect(PROFILE_MODAL_BANNER_AVATAR_CUTOUT.r).toBe(
			PROFILE_MODAL_GEOMETRY.avatarSizePx / 2 + PROFILE_MODAL_GEOMETRY.avatarBorderPx,
		);
	});
});
