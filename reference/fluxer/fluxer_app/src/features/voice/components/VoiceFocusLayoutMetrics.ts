// SPDX-License-Identifier: AGPL-3.0-or-later

export const FOCUS_EXPANDED_MINI_TILE_ASPECT_RATIO = 16 / 9;
export const FOCUS_EXPANDED_TOGGLE_HEIGHT_PX = 44;
export const FOCUS_EXPANDED_RESERVED_STATIC_GAP_PX = 40;
export const FOCUS_EXPANDED_MAIN_MIN_HEIGHT_PX = 180;
export const FOCUS_EXPANDED_SECTION_MAX_WIDTH_PX = 1680;
export const FOCUS_EXPANDED_SECTION_WIDTH_RATIO = 0.96;
export const FOCUS_EXPANDED_MINI_DEFAULT_GAP_PX = 12;
export const FOCUS_EXPANDED_MINI_DEFAULT_MAX_WIDTH_PX = 380;
export const FOCUS_EXPANDED_MINI_COLUMN_RULES = [
	{columns: 4, minWidth: 1040},
	{columns: 3, minWidth: 760},
	{columns: 2, minWidth: 620},
] as const;

export interface FocusExpandedMainMetricsInput {
	containerWidth: number;
	containerHeight: number;
	rootFontSizePx?: number;
}

export interface FocusExpandedMainMetrics {
	miniColumns: number;
	miniGridGap: number;
	miniTileMaxWidth: number;
	miniSectionWidth: number;
	miniSectionPaddingInline: number;
	miniContentWidth: number;
	miniColumnWidth: number;
	miniRowHeight: number;
	reservedBottomHeight: number;
	mainMaxHeight: number;
}

function sanitizeDimension(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, value);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function getFocusExpandedMiniColumnCount(containerWidth: number): number {
	const width = sanitizeDimension(containerWidth);
	for (const rule of FOCUS_EXPANDED_MINI_COLUMN_RULES) {
		if (width >= rule.minWidth) {
			return rule.columns;
		}
	}
	return 1;
}

export function resolveFocusExpandedMainMetrics({
	containerWidth,
	containerHeight,
	rootFontSizePx = 16,
}: FocusExpandedMainMetricsInput): FocusExpandedMainMetrics {
	const width = sanitizeDimension(containerWidth);
	const height = sanitizeDimension(containerHeight);
	const rootFontSize = rootFontSizePx > 0 && Number.isFinite(rootFontSizePx) ? rootFontSizePx : 16;
	const miniColumns = getFocusExpandedMiniColumnCount(width);
	const miniGridGap = FOCUS_EXPANDED_MINI_DEFAULT_GAP_PX;
	const miniTileMaxWidth = FOCUS_EXPANDED_MINI_DEFAULT_MAX_WIDTH_PX;
	const miniSectionWidth = Math.min(width * FOCUS_EXPANDED_SECTION_WIDTH_RATIO, FOCUS_EXPANDED_SECTION_MAX_WIDTH_PX);
	const miniSectionPaddingInline = clamp(
		Math.max(rootFontSize * 0.5, width * 0.012),
		rootFontSize * 0.5,
		rootFontSize * 1.25,
	);
	const miniContentWidth = Math.max(0, miniSectionWidth - 2 * miniSectionPaddingInline);
	const miniColumnWidth = Math.max(0, (miniContentWidth - (miniColumns - 1) * miniGridGap) / miniColumns);
	const miniRowHeight = (Math.min(miniTileMaxWidth, miniColumnWidth) * 9) / 16;
	const reservedBottomHeight = FOCUS_EXPANDED_TOGGLE_HEIGHT_PX + FOCUS_EXPANDED_RESERVED_STATIC_GAP_PX + miniRowHeight;
	const mainMaxHeight = Math.max(FOCUS_EXPANDED_MAIN_MIN_HEIGHT_PX, height - reservedBottomHeight);
	return {
		miniColumns,
		miniGridGap,
		miniTileMaxWidth,
		miniSectionWidth,
		miniSectionPaddingInline,
		miniContentWidth,
		miniColumnWidth,
		miniRowHeight,
		reservedBottomHeight,
		mainMaxHeight,
	};
}
