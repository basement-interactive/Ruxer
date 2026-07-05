// SPDX-License-Identifier: AGPL-3.0-or-later

export function getInitialsFromName(name: string) {
	const trimmed = name.trim();
	if (!trimmed) {
		return '';
	}
	const words = trimmed.split(/\s+/).filter((word) => word.length > 0);
	if (words.length === 0) {
		return '';
	}
	const initials = words.map((word) => Array.from(word)[0]).filter(Boolean);
	return initials.join('');
}
