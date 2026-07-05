// SPDX-License-Identifier: AGPL-3.0-or-later

import {isKeyboardActivationKey} from '@app/features/input/utils/KeyboardUtils';
import {describe, expect, it} from 'vitest';

describe('KeyboardUtils', () => {
	it('recognizes common keyboard activation key values', () => {
		expect(isKeyboardActivationKey('Enter')).toBe(true);
		expect(isKeyboardActivationKey(' ')).toBe(true);
		expect(isKeyboardActivationKey('Space')).toBe(true);
		expect(isKeyboardActivationKey('Spacebar')).toBe(true);
		expect(isKeyboardActivationKey('ArrowDown')).toBe(false);
	});
});
