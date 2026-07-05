// SPDX-License-Identifier: AGPL-3.0-or-later

export interface ImageDimensions {
	width: number;
	height: number;
}

export interface AspectRatioRange {
	min: number;
	max: number;
}

export const ASSET_ASPECT_RATIO_TOLERANCE = 0.01;
export const WIDE_ASSET_ASPECT_RATIO = 16 / 9;
export const WIDE_ASSET_MIN_HEIGHT_RATIO = 0.5;
export const WIDE_ASSET_MAX_HEIGHT_RATIO = 1;

export function getAspectRatioRange(aspectRatio: number, minHeightRatio = 1, maxHeightRatio = 1): AspectRatioRange {
	const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
	const safeMinHeightRatio = Number.isFinite(minHeightRatio) && minHeightRatio > 0 ? minHeightRatio : 1;
	const safeMaxHeightRatio = Number.isFinite(maxHeightRatio) && maxHeightRatio > 0 ? maxHeightRatio : 1;
	const min = safeAspectRatio / safeMaxHeightRatio;
	const max = safeAspectRatio / safeMinHeightRatio;
	return {
		min: Math.min(min, max),
		max: Math.max(min, max),
	};
}

export const WIDE_ASSET_ASPECT_RATIO_RANGE = getAspectRatioRange(
	WIDE_ASSET_ASPECT_RATIO,
	WIDE_ASSET_MIN_HEIGHT_RATIO,
	WIDE_ASSET_MAX_HEIGHT_RATIO,
);

export function getAspectRatioFromDimensions(dimensions: ImageDimensions): number | undefined {
	const {width, height} = dimensions;
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return undefined;
	}
	return width / height;
}

export function isAspectRatioInRange(
	aspectRatio: number | undefined,
	range: AspectRatioRange,
	tolerance = ASSET_ASPECT_RATIO_TOLERANCE,
): boolean {
	if (aspectRatio == null || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
		return false;
	}
	const min = range.min * (1 - tolerance);
	const max = range.max * (1 + tolerance);
	return aspectRatio >= min && aspectRatio <= max;
}

export function clampAspectRatio(aspectRatio: number | undefined, range: AspectRatioRange): number | undefined {
	if (aspectRatio == null || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
		return undefined;
	}
	return Math.min(Math.max(aspectRatio, range.min), range.max);
}

export function clampAspectRatioFromDimensions(
	dimensions: ImageDimensions,
	range: AspectRatioRange,
): number | undefined {
	return clampAspectRatio(getAspectRatioFromDimensions(dimensions), range);
}

export function isOriginalImageWithinAssetBounds(
	dimensions: ImageDimensions,
	range: AspectRatioRange,
	maxWidth: number,
	maxHeight: number,
): boolean {
	const {width, height} = dimensions;
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return false;
	}
	if (width > maxWidth || height > maxHeight) {
		return false;
	}
	return isAspectRatioInRange(width / height, range);
}

export function clampWideAssetAspectRatio(aspectRatio: number | undefined): number | undefined {
	return clampAspectRatio(aspectRatio, WIDE_ASSET_ASPECT_RATIO_RANGE);
}

export function clampWideAssetAspectRatioFromDimensions(dimensions: ImageDimensions): number | undefined {
	return clampAspectRatioFromDimensions(dimensions, WIDE_ASSET_ASPECT_RATIO_RANGE);
}
