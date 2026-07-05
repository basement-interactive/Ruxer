// SPDX-License-Identifier: AGPL-3.0-or-later

import {getNextTabIndex, getTabNavigationDirection} from '@app/features/ui/tabs/TabKeyboardNavigation';
import {describe, expect, it} from 'vitest';

describe('TabKeyboardNavigation', () => {
	it('maps horizontal tablist keys without stealing vertical scroll keys', () => {
		expect(getTabNavigationDirection('ArrowLeft', 'horizontal')).toBe('previous');
		expect(getTabNavigationDirection('ArrowRight', 'horizontal')).toBe('next');
		expect(getTabNavigationDirection('ArrowUp', 'horizontal')).toBeNull();
		expect(getTabNavigationDirection('ArrowDown', 'horizontal')).toBeNull();
	});
	it('maps vertical tablist keys without stealing horizontal keys', () => {
		expect(getTabNavigationDirection('ArrowUp', 'vertical')).toBe('previous');
		expect(getTabNavigationDirection('ArrowDown', 'vertical')).toBe('next');
		expect(getTabNavigationDirection('ArrowLeft', 'vertical')).toBeNull();
		expect(getTabNavigationDirection('ArrowRight', 'vertical')).toBeNull();
	});
	it('supports both axes for sidebar-style composites', () => {
		expect(getTabNavigationDirection('ArrowUp', 'both')).toBe('previous');
		expect(getTabNavigationDirection('ArrowLeft', 'both')).toBe('previous');
		expect(getTabNavigationDirection('ArrowDown', 'both')).toBe('next');
		expect(getTabNavigationDirection('ArrowRight', 'both')).toBe('next');
	});
	it('moves to first, last, next, and previous with wrapping', () => {
		expect(getNextTabIndex(1, 4, 'first')).toBe(0);
		expect(getNextTabIndex(1, 4, 'last')).toBe(3);
		expect(getNextTabIndex(3, 4, 'next')).toBe(0);
		expect(getNextTabIndex(0, 4, 'previous')).toBe(3);
	});
});
