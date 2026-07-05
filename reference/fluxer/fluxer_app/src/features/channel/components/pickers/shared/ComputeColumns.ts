// SPDX-License-Identifier: AGPL-3.0-or-later

export interface ComputeColumnsOptions {
	desiredItemWidth?: number;
	maxColumns?: number;
	minColumns?: number;
}

export function computeMasonryColumns(
	containerWidth: number,
	itemGutter: number,
	options: ComputeColumnsOptions = {},
): number {
	const desiredItemWidth = options.desiredItemWidth ?? 200;
	const maxColumns = options.maxColumns ?? 8;
	const minColumns = options.minColumns ?? 1;
	if (containerWidth <= 0) return minColumns;
	const columns = Math.floor((containerWidth + itemGutter) / (desiredItemWidth + itemGutter));
	return Math.max(minColumns, Math.min(columns, maxColumns));
}
