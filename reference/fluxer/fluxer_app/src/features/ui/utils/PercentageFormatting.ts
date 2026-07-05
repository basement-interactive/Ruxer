// SPDX-License-Identifier: AGPL-3.0-or-later

export function roundPercentage(value: number): number {
	return Number.isFinite(value) ? Math.round(value) : 0;
}

export function formatRoundedPercentage(value: number): string {
	return `${roundPercentage(value)}%`;
}
