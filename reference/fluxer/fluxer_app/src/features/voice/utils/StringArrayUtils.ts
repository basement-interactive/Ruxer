// SPDX-License-Identifier: AGPL-3.0-or-later

export function areOrderedStringArraysEqual(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
	if (left === right) return true;
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) return false;
	}
	return true;
}
