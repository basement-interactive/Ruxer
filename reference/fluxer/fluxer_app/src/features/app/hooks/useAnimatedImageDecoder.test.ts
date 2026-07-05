// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {getNextAnimatedImageFrame} from './useAnimatedImageDecoder';

describe('getNextAnimatedImageFrame', () => {
	it('stops on the final frame when the image has no repetitions', () => {
		let state = {frameIndex: 0, frameCount: 3, repetitionCount: 0, completedRepetitions: 0};
		const secondFrame = getNextAnimatedImageFrame(state);
		expect(secondFrame).toEqual({frameIndex: 1, completedRepetitions: 0});
		state = {...state, ...secondFrame!};
		const finalFrame = getNextAnimatedImageFrame(state);
		expect(finalFrame).toEqual({frameIndex: 2, completedRepetitions: 0});
		state = {...state, ...finalFrame!};
		expect(getNextAnimatedImageFrame(state)).toBeNull();
	});
	it('allows the configured number of finite repetitions before stopping', () => {
		let state = {frameIndex: 0, frameCount: 2, repetitionCount: 1, completedRepetitions: 0};
		const finalFrame = getNextAnimatedImageFrame(state);
		expect(finalFrame).toEqual({frameIndex: 1, completedRepetitions: 0});
		state = {...state, ...finalFrame!};
		const repeatedFirstFrame = getNextAnimatedImageFrame(state);
		expect(repeatedFirstFrame).toEqual({frameIndex: 0, completedRepetitions: 1});
		state = {...state, ...repeatedFirstFrame!};
		const repeatedFinalFrame = getNextAnimatedImageFrame(state);
		expect(repeatedFinalFrame).toEqual({frameIndex: 1, completedRepetitions: 1});
		state = {...state, ...repeatedFinalFrame!};
		expect(getNextAnimatedImageFrame(state)).toBeNull();
	});
	it('keeps advancing indefinitely for infinite repetitions', () => {
		let state = {frameIndex: 1, frameCount: 2, repetitionCount: Infinity, completedRepetitions: 99};
		const firstFrame = getNextAnimatedImageFrame(state);
		expect(firstFrame).toEqual({frameIndex: 0, completedRepetitions: 100});
		state = {...state, ...firstFrame!};
		expect(getNextAnimatedImageFrame(state)).toEqual({frameIndex: 1, completedRepetitions: 100});
	});
	it('does not loop single-frame images or invalid repetition counts', () => {
		expect(
			getNextAnimatedImageFrame({
				frameIndex: 0,
				frameCount: 1,
				repetitionCount: Infinity,
				completedRepetitions: 0,
			}),
		).toBeNull();
		expect(
			getNextAnimatedImageFrame({
				frameIndex: 1,
				frameCount: 2,
				repetitionCount: Number.NaN,
				completedRepetitions: 0,
			}),
		).toBeNull();
	});
});
