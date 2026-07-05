// SPDX-License-Identifier: AGPL-3.0-or-later

import type {KeyCombo} from '@app/features/input/state/InputKeybind';

export function isPrintableShortcutKey(key: string | undefined | null): key is string {
	if (!key) return false;
	if (key === 'Dead' || key === 'Unidentified' || key === 'Process') return false;
	return key.length === 1;
}

export function shouldPreferLayoutKeyForShortcut(combo: Pick<KeyCombo, 'key' | 'code'>): boolean {
	if (!isPrintableShortcutKey(combo.key)) return false;
	if (combo.code && /^Numpad/.test(combo.code)) return false;
	return true;
}

export function hasAssignedKeyComboInput(combo: KeyCombo | null | undefined): combo is KeyCombo {
	return Boolean(
		combo &&
			(combo.key !== undefined ||
				combo.code !== undefined ||
				combo.mouseButton !== undefined ||
				combo.gamepadButton !== undefined),
	);
}

export function isKeybindModifierKey(key: string | undefined | null): boolean {
	if (!key) return false;
	return key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'AltGraph' || key === 'Meta';
}

function modifierSignature(combo: KeyCombo): string {
	return [!!combo.ctrlOrMeta, !!combo.ctrl, !!combo.alt, !!combo.shift, !!combo.meta].join(',');
}

export function combosConflict(a: KeyCombo, b: KeyCombo): boolean {
	if (!hasAssignedKeyComboInput(a) || !hasAssignedKeyComboInput(b)) return false;
	const aMouse = a.mouseButton ?? null;
	const bMouse = b.mouseButton ?? null;
	if (aMouse !== null || bMouse !== null) {
		return aMouse !== null && aMouse === bMouse && modifierSignature(a) === modifierSignature(b);
	}
	const aPad = a.gamepadButton ?? null;
	const bPad = b.gamepadButton ?? null;
	if (aPad !== null || bPad !== null) {
		return aPad !== null && aPad === bPad;
	}
	const aKey = ((a.code && b.code ? a.code : a.key || a.code) || '').toLowerCase();
	const bKey = ((a.code && b.code ? b.code : b.key || b.code) || '').toLowerCase();
	if (!aKey || !bKey) return false;
	if (!!a.modifierOnly !== !!b.modifierOnly) return false;
	if (!!a.bothSides !== !!b.bothSides) return false;
	return aKey === bKey && modifierSignature(a) === modifierSignature(b);
}

export function mergeStoredComboWithDefaults(stored: KeyCombo, defaultCombo: KeyCombo): KeyCombo {
	return {
		key: stored.key ?? '',
		code: stored.code,
		ctrlOrMeta: stored.ctrlOrMeta,
		ctrl: stored.ctrl,
		alt: stored.alt,
		shift: stored.shift,
		meta: stored.meta,
		global: stored.global ?? defaultCombo.global,
		enabled: stored.enabled ?? defaultCombo.enabled,
		mouseButton: stored.mouseButton,
		modifierOnly: stored.modifierOnly,
		bothSides: stored.bothSides,
		gamepadButton: stored.gamepadButton,
	};
}
