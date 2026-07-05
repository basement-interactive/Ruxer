// SPDX-License-Identifier: AGPL-3.0-or-later

export const REM_BASE_PX = 16;

export function remFromPx(px: number): `${number}rem` {
	const rounded = Math.round((px / REM_BASE_PX) * 1e5) / 1e5;
	return `${rounded}rem`;
}
