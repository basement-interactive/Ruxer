// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	DEFAULT_KEYBOARD_SHORTCUTS_OVERLAY_COMBO,
	getKeyboardShortcutsOverlayComboForLayoutMap,
	type KeyboardLayoutMapReader,
	keyboardLayoutHasDirectSlashKey,
	SHIFTED_SLASH_FALLBACK_KEYBOARD_SHORTCUTS_OVERLAY_COMBO,
	shouldUseKeyboardShortcutsOverlayFallbackFromEvent,
} from '@app/features/input/utils/KeyboardShortcutLayoutUtils';
import {describe, expect, it} from 'vitest';

const layoutMap = (entries: Array<[string, string]>): KeyboardLayoutMapReader => {
	const map = new Map(entries);
	return {
		get: (code) => map.get(code),
	};
};

describe('KeyboardShortcutLayoutUtils', () => {
	it('keeps Ctrl/Cmd+/ when the keyboard layout has a direct slash key', () => {
		const usLayout = layoutMap([
			['Slash', '/'],
			['Digit7', '7'],
		]);

		expect(keyboardLayoutHasDirectSlashKey(usLayout)).toBe(true);
		expect(getKeyboardShortcutsOverlayComboForLayoutMap(usLayout)).toEqual(DEFAULT_KEYBOARD_SHORTCUTS_OVERLAY_COMBO);
	});

	it('uses Ctrl/Cmd+. when slash is only available through a shifted layout key', () => {
		const swedishLayout = layoutMap([
			['Slash', '-'],
			['Digit7', '7'],
			['NumpadDivide', '/'],
		]);

		expect(keyboardLayoutHasDirectSlashKey(swedishLayout)).toBe(false);
		expect(getKeyboardShortcutsOverlayComboForLayoutMap(swedishLayout)).toEqual(
			SHIFTED_SLASH_FALLBACK_KEYBOARD_SHORTCUTS_OVERLAY_COMBO,
		);
	});

	it('detects shifted slash events from numbered keyboard layouts', () => {
		expect(shouldUseKeyboardShortcutsOverlayFallbackFromEvent({key: '/', code: 'Digit7', shiftKey: true})).toBe(true);
		expect(shouldUseKeyboardShortcutsOverlayFallbackFromEvent({key: '/', code: 'Slash', shiftKey: false})).toBe(false);
		expect(shouldUseKeyboardShortcutsOverlayFallbackFromEvent({key: '/', code: 'NumpadDivide', shiftKey: false})).toBe(
			false,
		);
	});
});
