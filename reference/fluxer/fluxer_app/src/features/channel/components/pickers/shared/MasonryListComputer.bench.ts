// SPDX-License-Identifier: AGPL-3.0-or-later

import {MasonryListComputer} from '@app/features/channel/components/MasonryListComputer';
import {bench, describe} from 'vitest';

const ITEM_COUNT = 500;
const VIEWPORT_WIDTH = 520;
const VIEWPORT_HEIGHT = 420;
const COLUMNS = 3;
const ITEM_GUTTER = 8;
const ITEM_KEYS = Array.from({length: ITEM_COUNT}, (_, index) => `gif-${index}`);
const ITEM_HEIGHTS = Array.from({length: ITEM_COUNT}, (_, index) => 90 + ((index * 37) % 180));
const SCROLL_OFFSETS = Array.from({length: 1_000}, (_, index) => (index * 173) % 30_000);

function configureComputer(computer: MasonryListComputer, version: number): void {
	computer.mergeProps({
		sections: [ITEM_COUNT],
		columns: COLUMNS,
		itemGutter: ITEM_GUTTER,
		bufferWidth: VIEWPORT_WIDTH,
		padding: {left: 12, right: 12, top: 0, bottom: 0},
		version,
		getItemKey: (_section, itemIndex) => ITEM_KEYS[itemIndex] ?? null,
		getItemHeight: (_section, itemIndex) => ITEM_HEIGHTS[itemIndex] ?? 0,
		getSectionHeight: () => 0,
	});
}

describe('MasonryListComputer benchmarks', () => {
	bench('computes full masonry layout for 500 GIFs', () => {
		const computer = new MasonryListComputer();
		configureComputer(computer, 1);
		computer.computeVisibleSections(0, VIEWPORT_HEIGHT);
		computer.getState();
	});

	bench('computes 1k visible windows over a stable GIF layout', () => {
		const computer = new MasonryListComputer();
		configureComputer(computer, 1);
		computer.computeVisibleSections(0, VIEWPORT_HEIGHT);
		for (const scrollTop of SCROLL_OFFSETS) {
			computer.computeVisibleSections(scrollTop, scrollTop + VIEWPORT_HEIGHT + 480);
		}
		computer.getState();
	});
});
