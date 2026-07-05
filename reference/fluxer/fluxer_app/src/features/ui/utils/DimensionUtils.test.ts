// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {createCalculator} from './DimensionUtils';

describe('MediaDimensionCalculator', () => {
	it('does not upscale small portrait media', () => {
		const calculator = createCalculator({maxWidth: 400, maxHeight: 300});

		const {dimensions, style} = calculator.calculate({width: 43, height: 48});

		expect(dimensions).toEqual({width: 43, height: 48});
		expect(style).toMatchObject({
			maxWidth: 'min(100%, 2.6875rem)',
			width: '100%',
			aspectRatio: '43/48',
		});
	});

	it('still scales large portrait media down to the max height', () => {
		const calculator = createCalculator({maxWidth: 400, maxHeight: 300});

		const {dimensions, style} = calculator.calculate({width: 860, height: 960});

		expect(dimensions).toEqual({width: 269, height: 300});
		expect(style).toMatchObject({
			maxWidth: 'min(100%, 16.8125rem)',
			width: '100%',
			aspectRatio: '269/300',
		});
	});
});
