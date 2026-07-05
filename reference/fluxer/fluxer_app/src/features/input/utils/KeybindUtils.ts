// SPDX-License-Identifier: AGPL-3.0-or-later

import type {KeyCombo} from '@app/features/input/state/InputKeybind';
import {SHIFT_KEY_LABEL} from '@app/features/input/utils/KeyboardUtils';

const isMac = () => /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const CONTROL_KEY_SYMBOL = '⌃';

const isCodeForDisplayNumpadKey = (code: string | undefined): boolean => !!code && /^Numpad/.test(code);
const isShiftKeyName = (key: string): boolean => key === 'Shift' || key === 'ShiftLeft' || key === 'ShiftRight';
const isControlKeyName = (key: string): boolean => key === 'Control' || key === 'ControlLeft' || key === 'ControlRight';
const isAltKeyName = (key: string): boolean => key === 'Alt' || key === 'AltLeft' || key === 'AltRight';
const isMetaKeyName = (key: string): boolean => key === 'Meta' || key === 'MetaLeft' || key === 'MetaRight';
const isModifierKeyName = (key: string): boolean =>
	isShiftKeyName(key) || isControlKeyName(key) || isAltKeyName(key) || isMetaKeyName(key);

export function getPrimaryKeyForComboDisplay(combo: Pick<KeyCombo, 'key' | 'code'>): string {
	if (isCodeForDisplayNumpadKey(combo.code)) return combo.code ?? '';
	return combo.key || combo.code || '';
}

export function isPrimaryKeyAlreadyRepresentedByModifier(
	combo: Pick<KeyCombo, 'key' | 'code' | 'ctrlOrMeta' | 'ctrl' | 'alt' | 'shift' | 'meta'>,
): boolean {
	const rawKey = getPrimaryKeyForComboDisplay(combo);
	if (!rawKey) return false;
	if (isShiftKeyName(rawKey)) return !!combo.shift;
	if (isControlKeyName(rawKey)) return !!combo.ctrl || !!combo.ctrlOrMeta;
	if (isAltKeyName(rawKey)) return !!combo.alt;
	if (isMetaKeyName(rawKey)) return !!combo.meta || !!combo.ctrlOrMeta;
	return false;
}

export function formatMouseButton(button: number): string {
	switch (button) {
		case 0:
			return 'Mouse Left';
		case 1:
			return 'Mouse Middle';
		case 2:
			return 'Mouse Right';
		case 3:
			return 'Mouse Back';
		case 4:
			return 'Mouse Forward';
		default:
			return `Mouse ${button}`;
	}
}

export function formatGamepadButton(button: number): string {
	const map: Record<number, string> = {
		0: 'A / Cross',
		1: 'B / Circle',
		2: 'X / Square',
		3: 'Y / Triangle',
		4: 'Left Bumper',
		5: 'Right Bumper',
		6: 'Left Trigger',
		7: 'Right Trigger',
		8: 'Back / Select',
		9: 'Start / Options',
		10: 'Left Stick Click',
		11: 'Right Stick Click',
		12: 'D-Pad Up',
		13: 'D-Pad Down',
		14: 'D-Pad Left',
		15: 'D-Pad Right',
		16: 'Guide',
	};
	const label = map[button];
	return `Gamepad ${label ?? `Button ${button}`}`;
}

function formatBothSidesModifier(combo: KeyCombo): string | null {
	let label: string | null = null;
	if (combo.shift) label = SHIFT_KEY_LABEL;
	else if (combo.ctrl) label = isMac() ? CONTROL_KEY_SYMBOL : 'Ctrl';
	else if (combo.ctrlOrMeta) label = isMac() ? '⌘' : 'Ctrl';
	else if (combo.alt) label = isMac() ? '⌥' : 'Alt';
	else if (combo.meta) label = isMac() ? '⌘' : 'Win';
	if (!label) return null;
	return `Left ${label} + Right ${label}`;
}

export function formatKeyCombo(combo: KeyCombo): string {
	const parts: Array<string> = [];
	if (combo.modifierOnly && combo.bothSides) {
		const formatted = formatBothSidesModifier(combo);
		if (formatted) return formatted;
	}
	if (combo.ctrl) {
		parts.push(isMac() ? CONTROL_KEY_SYMBOL : 'Ctrl');
	} else if (combo.ctrlOrMeta) {
		parts.push(isMac() ? '⌘' : 'Ctrl');
	}
	if (combo.meta && !combo.ctrlOrMeta) {
		parts.push(isMac() ? '⌘' : 'Win');
	}
	if (combo.shift) {
		parts.push(SHIFT_KEY_LABEL);
	}
	if (combo.alt) parts.push(isMac() ? '⌥' : 'Alt');
	if (combo.mouseButton !== undefined && combo.mouseButton !== null) {
		parts.push(formatMouseButton(combo.mouseButton));
		return parts.join(' + ');
	}
	if (combo.gamepadButton !== undefined && combo.gamepadButton !== null) {
		parts.push(formatGamepadButton(combo.gamepadButton));
		return parts.join(' + ');
	}
	const rawKey = getPrimaryKeyForComboDisplay(combo);
	if (
		isPrimaryKeyAlreadyRepresentedByModifier(combo) ||
		(combo.modifierOnly && isModifierKeyName(rawKey) && parts.length > 0)
	) {
		return parts.join(' + ');
	}
	const primarySymbol = formatPrimaryKeySymbol(rawKey);
	parts.push(primarySymbol);
	return parts.join(' + ');
}

function formatPrimaryKeySymbol(rawKey: string): string {
	if (rawKey === ' ' || rawKey === 'Spacebar') return 'Spacebar';
	if (isShiftKeyName(rawKey)) return SHIFT_KEY_LABEL;
	if (rawKey === 'ArrowUp') return '▲';
	if (rawKey === 'ArrowDown') return '▼';
	if (rawKey === 'ArrowLeft') return '◀';
	if (rawKey === 'ArrowRight') return '▶';
	if (rawKey === 'PageUp') return 'Page Up';
	if (rawKey === 'PageDown') return 'Page Down';
	if (rawKey === 'Escape') return 'Esc';
	if (rawKey === 'PrintScreen') return 'Print Screen';
	if (rawKey === 'ScrollLock') return 'Scroll Lock';
	if (rawKey === 'Pause' || rawKey === 'Break') return 'Break';
	if (rawKey === 'NumLock') return 'Num Lock';
	if (rawKey === 'ContextMenu') return 'Menu';
	if (rawKey === 'Backspace') return '⌫';
	if (rawKey === 'Enter' || rawKey === 'Return') return isMac() ? '⏎' : 'Enter';
	if (rawKey === 'Tab') return 'Tab';
	if (rawKey === 'Backquote' || rawKey === '`') return '`';
	if (rawKey === '[' || rawKey === ']') return rawKey;
	if (/^Key[A-Z]$/.test(rawKey)) {
		return rawKey.slice(3);
	}
	if (/^Digit[0-9]$/.test(rawKey)) {
		return rawKey.slice(5);
	}
	if (/^Numpad[0-9]$/.test(rawKey)) {
		return `Numpad ${rawKey.slice(6)}`;
	}
	if (rawKey === 'NumpadDecimal') return 'Numpad .';
	if (rawKey === 'NumpadAdd') return 'Numpad +';
	if (rawKey === 'NumpadSubtract') return 'Numpad -';
	if (rawKey === 'NumpadMultiply') return 'Numpad *';
	if (rawKey === 'NumpadDivide') return 'Numpad /';
	if (rawKey === 'NumpadEnter') return isMac() ? 'Numpad ⏎' : 'Numpad Enter';
	if (rawKey === 'NumpadEqual') return 'Numpad =';
	if (rawKey === 'NumpadComma') return 'Numpad ,';
	if (rawKey === 'AudioVolumeMute') return 'Volume Mute';
	if (rawKey === 'AudioVolumeDown') return 'Volume Down';
	if (rawKey === 'AudioVolumeUp') return 'Volume Up';
	if (rawKey === 'MediaTrackNext') return 'Media Next';
	if (rawKey === 'MediaTrackPrevious') return 'Media Previous';
	if (rawKey === 'MediaStop') return 'Media Stop';
	if (rawKey === 'MediaPlayPause') return 'Media Play/Pause';
	if (rawKey === 'BrowserBack') return 'Browser Back';
	if (rawKey === 'BrowserForward') return 'Browser Forward';
	if (rawKey === 'BrowserRefresh') return 'Browser Refresh';
	if (rawKey === 'BrowserStop') return 'Browser Stop';
	if (rawKey === 'BrowserSearch') return 'Browser Search';
	if (rawKey === 'BrowserFavorites') return 'Browser Favorites';
	if (rawKey === 'BrowserHome') return 'Browser Home';
	if (rawKey === 'LaunchMail') return 'Launch Mail';
	if (rawKey === 'LaunchMediaPlayer') return 'Launch Media';
	if (rawKey === 'LaunchApp1') return 'Launch App 1';
	if (rawKey === 'LaunchApp2') return 'Launch App 2';
	if (rawKey === 'Power') return 'Power';
	if (rawKey === 'Sleep') return 'Sleep';
	if (rawKey === 'WakeUp') return 'Wake Up';
	if (rawKey === 'Convert') return 'Convert';
	if (rawKey === 'NonConvert') return 'NonConvert';
	if (rawKey === 'KanaMode') return 'Kana';
	if (/^Lang[1-5]$/.test(rawKey)) return rawKey;
	if (rawKey === 'IntlBackslash') return 'Intl \\';
	if (rawKey === 'IntlRo') return 'Intl Ro';
	if (rawKey === 'IntlYen') return 'Intl Yen';
	if (rawKey.length === 1) {
		return rawKey.toUpperCase();
	}
	return rawKey;
}
