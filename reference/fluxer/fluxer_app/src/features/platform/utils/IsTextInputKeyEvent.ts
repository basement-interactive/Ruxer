// SPDX-License-Identifier: AGPL-3.0-or-later

export function isTextInputKeyEvent(event: KeyboardEvent): boolean {
	const {key, ctrlKey, metaKey} = event;
	if (!key || key === 'Unidentified') {
		return false;
	}
	if (ctrlKey || metaKey) {
		return false;
	}
	if (key === 'Dead') {
		return true;
	}
	if (key.length > 1 && NAMED_KEY_PATTERN.test(key)) {
		return false;
	}
	const firstCodePoint = key.codePointAt(0)!;
	if (firstCodePoint <= 0x1f || (firstCodePoint >= 0x7f && firstCodePoint <= 0x9f)) {
		return false;
	}
	return true;
}

const NAMED_KEY_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
