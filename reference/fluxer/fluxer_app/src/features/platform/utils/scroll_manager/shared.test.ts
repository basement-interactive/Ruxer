// SPDX-License-Identifier: AGPL-3.0-or-later

import {JumpTypes} from '@fluxer/constants/src/JumpConstants';
import {describe, expect, it} from 'vitest';
import {resolveContainerResizeShift, type ScrollerState, shouldAnimateMessageJump} from './shared';

describe('shouldAnimateMessageJump', () => {
	it('animates only for explicit ANIMATED jumps', () => {
		expect(shouldAnimateMessageJump(JumpTypes.ANIMATED)).toBe(true);
		expect(shouldAnimateMessageJump(JumpTypes.INSTANT)).toBe(false);
		expect(shouldAnimateMessageJump(JumpTypes.NONE)).toBe(false);
	});
});

describe('resolveContainerResizeShift', () => {
	const state = (scrollTop: number, offsetHeight: number, scrollHeight: number): ScrollerState => ({
		scrollTop,
		offsetHeight,
		scrollHeight,
	});
	const resolve = (
		heightDelta: number,
		scrollerState: ScrollerState,
		overrides?: {isPinned?: boolean; editIsActive?: boolean},
	) =>
		resolveContainerResizeShift({
			heightDelta,
			isPinned: overrides?.isPinned ?? false,
			editIsActive: overrides?.editIsActive ?? false,
			state: scrollerState,
		});

	it('does nothing when the container height is unchanged', () => {
		expect(resolve(0, state(500, 400, 2000), {isPinned: true})).toEqual({kind: 'none'});
	});

	it('re-pins to the bottom when pinned, regardless of edit state or direction', () => {
		expect(resolve(40, state(1600, 400, 2000), {isPinned: true})).toEqual({kind: 'pin'});
		expect(resolve(-40, state(1600, 400, 2000), {isPinned: true})).toEqual({kind: 'pin'});
		expect(resolve(40, state(1600, 400, 2000), {isPinned: true, editIsActive: true})).toEqual({kind: 'pin'});
	});

	it('does nothing while an inline edit is active and not pinned', () => {
		expect(resolve(40, state(1590, 400, 2000), {editIsActive: true})).toEqual({kind: 'none'});
	});

	it('shifts by the delta when near the bottom so the bottom edge stays stable', () => {
		expect(resolve(40, state(1540, 400, 2000))).toEqual({kind: 'shift', targetScrollTop: 1580});
		expect(resolve(-40, state(1590, 400, 2040))).toEqual({kind: 'shift', targetScrollTop: 1550});
	});

	it('clamps the shifted target into the scrollable range', () => {
		expect(resolve(100, state(1590, 400, 2000))).toEqual({kind: 'shift', targetScrollTop: 1600});
		expect(resolve(-100, state(30, 400, 480))).toEqual({kind: 'shift', targetScrollTop: 0});
	});

	it('does nothing when far from the bottom', () => {
		expect(resolve(40, state(100, 400, 2000))).toEqual({kind: 'none'});
		expect(resolve(-40, state(100, 400, 2000))).toEqual({kind: 'none'});
	});

	it('widens the stick threshold for large deltas', () => {
		expect(resolve(200, state(1400, 400, 2000))).toEqual({kind: 'shift', targetScrollTop: 1600});
		expect(resolve(10, state(1400, 400, 2000))).toEqual({kind: 'none'});
	});
});
