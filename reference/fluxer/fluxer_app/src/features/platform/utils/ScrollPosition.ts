// SPDX-License-Identifier: AGPL-3.0-or-later

export interface ScrollMetrics {
	scrollTop: number;
	scrollHeight: number;
	offsetHeight: number;
}

export interface ScrollPinOptions {
	tolerance?: number;
	stickyTolerance?: number;
	hasMoreAfter?: boolean;
	wasPinned?: boolean;
	allowPinWhenHasMoreAfter?: boolean;
}

export interface ScrollPinResult {
	distanceFromBottom: number;
	isAtBottom: boolean;
	isPinned: boolean;
}

const DEFAULT_TOLERANCE = 8;
const DEFAULT_STICKY_TOLERANCE = 64;

export function evaluateScrollPinning(metrics: ScrollMetrics, options: ScrollPinOptions = {}): ScrollPinResult {
	const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
	const stickyTolerance = options.stickyTolerance ?? DEFAULT_STICKY_TOLERANCE;
	const hasMoreAfter = options.hasMoreAfter ?? false;
	const allowPinWhenHasMoreAfter = options.allowPinWhenHasMoreAfter ?? true;
	const wasPinned = options.wasPinned ?? false;
	const distanceFromBottom = Math.max(metrics.scrollHeight - metrics.offsetHeight - metrics.scrollTop, 0);
	const isWithinTolerance = distanceFromBottom <= tolerance;
	const isWithinStickyRange = distanceFromBottom <= stickyTolerance;
	const shouldPin =
		(isWithinTolerance || (wasPinned && isWithinStickyRange)) && (allowPinWhenHasMoreAfter || !hasMoreAfter);
	return {
		distanceFromBottom,
		isAtBottom: isWithinTolerance,
		isPinned: shouldPin,
	};
}
