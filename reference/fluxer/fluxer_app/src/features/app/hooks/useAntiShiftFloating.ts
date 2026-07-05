// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {appZoomCssPx, appZoomLayoutPx} from '@app/features/ui/utils/AppZoomUtils';
import {getAdaptivePadding} from '@app/features/ui/utils/Positioning';
import {
	autoUpdate,
	computePosition,
	flip,
	type Middleware,
	offset,
	type Padding,
	type Placement,
	type ReferenceElement,
	shift,
	size,
} from '@floating-ui/react';
import {useCallback, useLayoutEffect, useRef, useState} from 'react';

const logger = new Logger('useAntiShiftFloating');
const DEFAULT_MIDDLEWARE: Array<Middleware> = [];
const TITLEBAR_SELECTOR = '[data-native-titlebar]';
const ANTI_SHIFT_AUTO_UPDATE_OPTIONS = {
	ancestorScroll: false,
	ancestorResize: false,
	elementResize: true,
	layoutShift: true,
} as const;

type FloatingUpdateCallback = () => void | Promise<void>;

let sharedScrollListenersAttached = false;
let sharedViewportListenersAttached = false;
let sharedUpdateRaf: number | null = null;

const scrollUpdateCallbacks = new Set<FloatingUpdateCallback>();
const viewportUpdateCallbacks = new Set<FloatingUpdateCallback>();
const scheduledUpdateCallbacks = new Set<FloatingUpdateCallback>();

interface FloatingState {
	x: number;
	y: number;
	isReady: boolean;
}

interface UseAntiShiftFloatingOptions {
	placement: Placement;
	offsetMainAxis?: number;
	offsetCrossAxis?: number;
	middleware?: Array<Middleware>;
	shouldAutoUpdate?: boolean;
	shouldObserveFloatingResize?: boolean;
	enableSmartBoundary?: boolean;
	constrainHeight?: boolean;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function normalizePadding(padding: Padding): {top: number; right: number; bottom: number; left: number} {
	if (typeof padding === 'number') {
		return {top: padding, right: padding, bottom: padding, left: padding};
	}
	return {
		top: padding.top ?? 0,
		right: padding.right ?? 0,
		bottom: padding.bottom ?? 0,
		left: padding.left ?? 0,
	};
}

function clampToViewportBoundary(
	x: number,
	y: number,
	floating: HTMLElement,
	padding: Padding,
): {x: number; y: number} {
	const normalizedPadding = normalizePadding(padding);
	const rect = floating.getBoundingClientRect();
	const minX = normalizedPadding.left;
	const minY = normalizedPadding.top;
	const maxX = Math.max(minX, window.innerWidth - normalizedPadding.right - rect.width);
	const maxY = Math.max(minY, window.innerHeight - normalizedPadding.bottom - rect.height);
	return {
		x: clamp(x, minX, maxX),
		y: clamp(y, minY, maxY),
	};
}

function scheduleFloatingUpdates(callbacks: Iterable<FloatingUpdateCallback>): void {
	for (const callback of callbacks) {
		scheduledUpdateCallbacks.add(callback);
	}
	if (scheduledUpdateCallbacks.size === 0 || sharedUpdateRaf != null) return;
	sharedUpdateRaf = requestAnimationFrame(() => {
		sharedUpdateRaf = null;
		const callbacksToRun = Array.from(scheduledUpdateCallbacks);
		scheduledUpdateCallbacks.clear();
		for (const callback of callbacksToRun) {
			void callback();
		}
	});
}

function handleSharedScrollUpdate(): void {
	scheduleFloatingUpdates(scrollUpdateCallbacks);
}

function handleSharedViewportUpdate(): void {
	scheduleFloatingUpdates(scrollUpdateCallbacks);
	scheduleFloatingUpdates(viewportUpdateCallbacks);
}

function ensureSharedScrollListeners(): void {
	if (sharedScrollListenersAttached || typeof document === 'undefined') return;
	document.addEventListener('scroll', handleSharedScrollUpdate, {capture: true, passive: true});
	sharedScrollListenersAttached = true;
}

function ensureSharedViewportListeners(): void {
	if (sharedViewportListenersAttached || typeof window === 'undefined') return;
	window.addEventListener('resize', handleSharedViewportUpdate);
	if (window.visualViewport) {
		window.visualViewport.addEventListener('resize', handleSharedViewportUpdate);
		window.visualViewport.addEventListener('scroll', handleSharedViewportUpdate);
	}
	sharedViewportListenersAttached = true;
}

function releaseSharedScrollListeners(): void {
	if (!sharedScrollListenersAttached || scrollUpdateCallbacks.size > 0 || typeof document === 'undefined') return;
	document.removeEventListener('scroll', handleSharedScrollUpdate, true);
	sharedScrollListenersAttached = false;
}

function releaseSharedViewportListeners(): void {
	if (
		!sharedViewportListenersAttached ||
		scrollUpdateCallbacks.size > 0 ||
		viewportUpdateCallbacks.size > 0 ||
		typeof window === 'undefined'
	) {
		return;
	}
	window.removeEventListener('resize', handleSharedViewportUpdate);
	if (window.visualViewport) {
		window.visualViewport.removeEventListener('resize', handleSharedViewportUpdate);
		window.visualViewport.removeEventListener('scroll', handleSharedViewportUpdate);
	}
	sharedViewportListenersAttached = false;
	if (sharedUpdateRaf != null && scheduledUpdateCallbacks.size === 0) {
		cancelAnimationFrame(sharedUpdateRaf);
		sharedUpdateRaf = null;
	}
}

function removeScheduledFloatingUpdate(callback: FloatingUpdateCallback): void {
	scheduledUpdateCallbacks.delete(callback);
	if (sharedUpdateRaf != null && scheduledUpdateCallbacks.size === 0) {
		cancelAnimationFrame(sharedUpdateRaf);
		sharedUpdateRaf = null;
	}
}

function subscribeSharedScrollUpdate(callback: FloatingUpdateCallback): () => void {
	scrollUpdateCallbacks.add(callback);
	ensureSharedScrollListeners();
	ensureSharedViewportListeners();
	return () => {
		scrollUpdateCallbacks.delete(callback);
		removeScheduledFloatingUpdate(callback);
		releaseSharedScrollListeners();
		releaseSharedViewportListeners();
	};
}

function subscribeSharedViewportUpdate(callback: FloatingUpdateCallback): () => void {
	viewportUpdateCallbacks.add(callback);
	ensureSharedViewportListeners();
	return () => {
		viewportUpdateCallbacks.delete(callback);
		removeScheduledFloatingUpdate(callback);
		releaseSharedViewportListeners();
	};
}

function observeFloatingResize(floating: HTMLElement, updatePosition: () => void): () => void {
	const cleanupCallbacks: Array<() => void> = [];
	if (typeof ResizeObserver !== 'undefined') {
		const resizeObserver = new ResizeObserver(updatePosition);
		resizeObserver.observe(floating);
		cleanupCallbacks.push(() => resizeObserver.disconnect());
	}
	cleanupCallbacks.push(subscribeSharedViewportUpdate(updatePosition));
	return () => {
		for (const cleanup of cleanupCallbacks) {
			cleanup();
		}
	};
}

function getNativeTitlebarInset(): number {
	if (typeof document === 'undefined') {
		return 0;
	}
	const titlebar = document.querySelector<HTMLElement>(TITLEBAR_SELECTOR);
	if (!titlebar) {
		return 0;
	}
	const rect = titlebar.getBoundingClientRect();
	if (rect.height <= 0 || rect.bottom <= 0) {
		return 0;
	}
	return rect.bottom;
}

function getBoundaryPadding(basePadding: number): Padding {
	const titlebarInset = getNativeTitlebarInset();
	if (titlebarInset <= 0) {
		return basePadding;
	}
	return {
		top: titlebarInset + basePadding,
		right: basePadding,
		bottom: basePadding,
		left: basePadding,
	};
}

export function useAntiShiftFloating(
	target: ReferenceElement | null,
	enabled: boolean,
	options: UseAntiShiftFloatingOptions,
) {
	const {
		placement,
		offsetMainAxis = 8,
		offsetCrossAxis = 0,
		middleware: extraMiddleware = DEFAULT_MIDDLEWARE,
		shouldAutoUpdate = true,
		shouldObserveFloatingResize = true,
		enableSmartBoundary = false,
		constrainHeight = false,
	} = options;
	const floatingRef = useRef<HTMLElement>(null);
	const [state, setState] = useState<FloatingState>(() => {
		const {x, y} = target ? getInitialGuess(target, placement, offsetMainAxis, offsetCrossAxis) : {x: -9999, y: -9999};
		return {x, y, isReady: false};
	});
	const cleanupRef = useRef<(() => void) | null>(null);
	const isCalculatingRef = useRef(false);
	const rafIdRef = useRef<number | null>(null);
	const updatePositionNow = useCallback(async () => {
		if (!enabled || !target || !floatingRef.current || isCalculatingRef.current) {
			return;
		}
		isCalculatingRef.current = true;
		try {
			const floating = floatingRef.current;
			if (!floating) {
				return;
			}
			const adaptivePadding = enableSmartBoundary ? getAdaptivePadding() : 8;
			const shiftPadding = Math.max(6, adaptivePadding);
			const boundaryPadding = getBoundaryPadding(shiftPadding);
			const middleware: Array<Middleware> = [
				offset({mainAxis: offsetMainAxis, crossAxis: offsetCrossAxis}),
				flip({padding: boundaryPadding}),
				shift({padding: boundaryPadding, crossAxis: true}),
				...extraMiddleware,
			];
			if (constrainHeight) {
				middleware.push(
					size({
						apply({
							availableWidth,
							availableHeight,
							elements,
						}: {
							availableWidth: number;
							availableHeight: number;
							elements: {
								floating: HTMLElement;
							};
						}) {
							const maxWidth = Math.max(0, availableWidth);
							const maxHeight = Math.max(0, availableHeight);
							Object.assign(elements.floating.style, {
								maxWidth: appZoomCssPx(maxWidth),
								maxHeight: appZoomCssPx(maxHeight),
								overflowX: 'hidden',
								overflowY: 'auto',
								overscrollBehavior: 'contain',
							});
						},
						padding: boundaryPadding,
					}),
				);
			}
			const {x, y} = await computePosition(target, floating, {
				placement,
				middleware,
			});
			const safePosition = clampToViewportBoundary(x, y, floating, boundaryPadding);
			Object.assign(floating.style, {
				left: appZoomCssPx(safePosition.x),
				top: appZoomCssPx(safePosition.y),
				visibility: 'visible',
			});
			setState((prev) =>
				prev.x !== safePosition.x || prev.y !== safePosition.y || !prev.isReady
					? {...safePosition, isReady: true}
					: prev,
			);
		} catch (error) {
			logger.error('Error positioning floating element', error);
			if (floatingRef.current) {
				floatingRef.current.style.visibility = 'visible';
			}
		} finally {
			isCalculatingRef.current = false;
		}
	}, [
		enabled,
		target,
		placement,
		offsetMainAxis,
		offsetCrossAxis,
		extraMiddleware,
		enableSmartBoundary,
		constrainHeight,
	]);
	const updatePosition = useCallback(() => {
		if (rafIdRef.current !== null || isCalculatingRef.current) {
			return;
		}
		rafIdRef.current = requestAnimationFrame(() => {
			rafIdRef.current = null;
			void updatePositionNow();
		});
	}, [updatePositionNow]);
	useLayoutEffect(() => {
		if (!enabled || !target || !floatingRef.current) {
			setState((prev) => ({...prev, isReady: false}));
			return;
		}
		if (!isReferenceConnected(target)) {
			setState((prev) => ({...prev, isReady: false}));
			return;
		}
		updatePosition();
		if (shouldAutoUpdate) {
			const cleanupCallbacks = [
				autoUpdate(target, floatingRef.current, updatePosition, ANTI_SHIFT_AUTO_UPDATE_OPTIONS),
				subscribeSharedScrollUpdate(updatePositionNow),
			];
			cleanupRef.current = () => {
				for (const cleanup of cleanupCallbacks) {
					cleanup();
				}
			};
		} else if (shouldObserveFloatingResize) {
			cleanupRef.current = observeFloatingResize(floatingRef.current, updatePosition);
		}
		return () => {
			cleanupRef.current?.();
			cleanupRef.current = null;
			if (rafIdRef.current !== null) {
				cancelAnimationFrame(rafIdRef.current);
				rafIdRef.current = null;
			}
			setState((prev) => ({...prev, isReady: false}));
		};
	}, [enabled, target, shouldAutoUpdate, shouldObserveFloatingResize, updatePosition, updatePositionNow]);
	return {
		ref: floatingRef,
		state,
		style: {
			position: 'fixed' as const,
			left: appZoomLayoutPx(state.x),
			top: appZoomLayoutPx(state.y),
		},
		updatePosition,
	};
}

function isReferenceConnected(target: ReferenceElement): boolean {
	if (typeof Element === 'undefined' || !(target instanceof Element)) {
		return true;
	}
	return document.contains(target);
}

function getInitialGuess(
	target: ReferenceElement,
	placement: Placement,
	offsetMainAxis: number,
	offsetCrossAxis: number,
) {
	const rect = target.getBoundingClientRect();
	const [side, align = 'center'] = placement.split('-') as [string, string];
	let x = rect.left;
	let y = rect.top;
	switch (side) {
		case 'right':
			x = rect.right + offsetMainAxis;
			break;
		case 'left':
			x = rect.left - offsetMainAxis;
			break;
		case 'bottom':
			y = rect.bottom + offsetMainAxis;
			break;
		case 'top':
			y = rect.top - offsetMainAxis;
			break;
		default:
			break;
	}
	if (side === 'top' || side === 'bottom') {
		if (align === 'end') {
			x = rect.right;
		} else if (align === 'start') {
			x = rect.left;
		} else {
			x = rect.left + rect.width / 2;
		}
		x += offsetCrossAxis;
	} else {
		if (align === 'end') {
			y = rect.bottom;
		} else if (align === 'start') {
			y = rect.top;
		} else {
			y = rect.top + rect.height / 2;
		}
		y += offsetCrossAxis;
	}
	return {x, y};
}
