// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {
	clampMediaTime,
	clampPercentage,
	getBufferedPercentage,
	getSeekPercentageFromClientX,
	resolveDoubleTapSeekDirection,
} from './MediaSeekUtils';

function mediaWithBufferedRanges({
	duration,
	currentTime,
	ranges,
}: {
	duration: number;
	currentTime: number;
	ranges: Array<[number, number]>;
}): HTMLMediaElement {
	return {
		duration,
		currentTime,
		buffered: {
			length: ranges.length,
			start: (index: number) => ranges[index]![0],
			end: (index: number) => ranges[index]![1],
		},
	} as unknown as HTMLMediaElement;
}

describe('MediaSeekUtils', () => {
	it('clamps progress and time values', () => {
		expect(clampPercentage(-25)).toBe(0);
		expect(clampPercentage(42)).toBe(42);
		expect(clampPercentage(125)).toBe(100);
		expect(clampPercentage(Number.NaN)).toBe(0);

		expect(clampMediaTime(-5, 100)).toBe(0);
		expect(clampMediaTime(30, 100)).toBe(30);
		expect(clampMediaTime(130, 100)).toBe(100);
	});

	it('maps pointer coordinates to a clamped seek percentage', () => {
		const rect = {left: 20, width: 200};

		expect(getSeekPercentageFromClientX(20, rect)).toBe(0);
		expect(getSeekPercentageFromClientX(120, rect)).toBe(50);
		expect(getSeekPercentageFromClientX(260, rect)).toBe(100);
		expect(getSeekPercentageFromClientX(-10, rect)).toBe(0);
	});

	it('uses the active buffered range when available', () => {
		const media = mediaWithBufferedRanges({
			duration: 100,
			currentTime: 25,
			ranges: [
				[0, 10],
				[20, 40],
				[60, 80],
			],
		});

		expect(getBufferedPercentage(media)).toBe(40);
	});

	it('falls back to the furthest buffered range outside the active range', () => {
		const media = mediaWithBufferedRanges({
			duration: 100,
			currentTime: 50,
			ranges: [
				[0, 10],
				[20, 40],
				[60, 80],
			],
		});

		expect(getBufferedPercentage(media)).toBe(80);
	});

	it('detects same-side double taps for mobile video seeking', () => {
		const first = {x: 20, width: 100, time: 1000};

		expect(resolveDoubleTapSeekDirection(first, {x: 24, width: 100, time: 1200})).toBe('backward');
		expect(resolveDoubleTapSeekDirection({x: 90, width: 100, time: 1000}, {x: 84, width: 100, time: 1200})).toBe(
			'forward',
		);
		expect(resolveDoubleTapSeekDirection(first, {x: 50, width: 100, time: 1200})).toBeNull();
		expect(resolveDoubleTapSeekDirection(first, {x: 24, width: 100, time: 1500})).toBeNull();
	});
});
