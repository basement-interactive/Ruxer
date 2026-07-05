// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	COMPACT_CALL_RESIZE_DRAG_THRESHOLD_SQ,
	COMPACT_CALL_RESIZE_STEP,
	type CompactCallResizeListeners,
	type CompactCallResizeState,
	getCompactCallHeightMax,
} from '@app/features/channel/components/channel_view/dm_channel_view/shared';
import {appZoomLayoutPx} from '@app/features/ui/utils/AppZoomUtils';
import CompactVoiceCallHeight from '@app/features/voice/state/CompactVoiceCallHeight';
import type React from 'react';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';

interface UseCompactCallBannerResizeArgs {
	isCompactCallResizable: boolean;
	compactCallHeightKey: string | null;
	compactCallHeightMin: number;
}

interface UseCompactCallBannerResizeResult {
	compactCallBannerHeight: number | null;
	compactCallMaxHeight: number;
	isResizingCompactCallBanner: boolean;
	compactCallBannerWrapperStyle: React.CSSProperties | undefined;
	handleCompactCallResizePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
	handleCompactCallResizeKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

export function useCompactCallBannerResize({
	isCompactCallResizable,
	compactCallHeightKey,
	compactCallHeightMin,
}: UseCompactCallBannerResizeArgs): UseCompactCallBannerResizeResult {
	const compactCallResizeStateRef = useRef<CompactCallResizeState | null>(null);
	const compactCallResizeListenersRef = useRef<CompactCallResizeListeners | null>(null);
	const [isResizingCompactCallBanner, setIsResizingCompactCallBanner] = useState(false);
	const [compactCallMaxHeight, setCompactCallMaxHeight] = useState(() => getCompactCallHeightMax(compactCallHeightMin));
	const [compactCallBannerHeight, setCompactCallBannerHeight] = useState<number | null>(() => {
		if (!isCompactCallResizable || !compactCallHeightKey) return null;
		const startingHeight = CompactVoiceCallHeight.getStartingHeight(compactCallHeightKey) ?? compactCallHeightMin;
		return Math.max(compactCallHeightMin, Math.min(Math.round(startingHeight), compactCallMaxHeight));
	});
	const clampCompactCallBannerHeight = useCallback(
		(value: number) => Math.max(compactCallHeightMin, Math.min(Math.round(value), compactCallMaxHeight)),
		[compactCallHeightMin, compactCallMaxHeight],
	);
	const setCompactCallBannerHeightForKey = useCallback(
		(nextHeight: number, options: {persist?: boolean} = {}) => {
			const normalizedHeight = clampCompactCallBannerHeight(nextHeight);
			if (isCompactCallResizable && options.persist && compactCallHeightKey) {
				const persistedHeight = CompactVoiceCallHeight.setHeightForKey(compactCallHeightKey, normalizedHeight);
				setCompactCallBannerHeight(persistedHeight);
				return;
			}
			setCompactCallBannerHeight(normalizedHeight);
		},
		[clampCompactCallBannerHeight, compactCallHeightKey, isCompactCallResizable],
	);
	useEffect(() => {
		if (!isCompactCallResizable) return;
		const handleResize = () => {
			const nextMax = getCompactCallHeightMax(compactCallHeightMin);
			setCompactCallMaxHeight(nextMax);
		};
		handleResize();
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, [compactCallHeightMin, isCompactCallResizable]);
	useLayoutEffect(() => {
		if (!isCompactCallResizable || !compactCallHeightKey) {
			setCompactCallBannerHeight(null);
			return;
		}
		const storedHeight = CompactVoiceCallHeight.getStartingHeight(compactCallHeightKey);
		if (storedHeight != null) {
			setCompactCallBannerHeightForKey(storedHeight);
			return;
		}
		setCompactCallBannerHeightForKey(compactCallHeightMin);
	}, [compactCallHeightKey, compactCallHeightMin, isCompactCallResizable, setCompactCallBannerHeightForKey]);
	useLayoutEffect(() => {
		if (!isCompactCallResizable || compactCallBannerHeight == null) return;
		if (compactCallBannerHeight > compactCallMaxHeight) {
			setCompactCallBannerHeightForKey(compactCallMaxHeight);
			return;
		}
		if (compactCallBannerHeight < compactCallHeightMin) {
			setCompactCallBannerHeightForKey(compactCallHeightMin);
		}
	}, [
		compactCallBannerHeight,
		compactCallHeightMin,
		compactCallMaxHeight,
		isCompactCallResizable,
		setCompactCallBannerHeightForKey,
	]);
	const cleanupCompactCallResizeListeners = useCallback(() => {
		const listeners = compactCallResizeListenersRef.current;
		if (!listeners) return;
		window.removeEventListener('pointermove', listeners.move);
		window.removeEventListener('pointerup', listeners.up);
		window.removeEventListener('pointercancel', listeners.up);
		compactCallResizeListenersRef.current = null;
	}, []);
	const handleCompactCallResizePointerMove = useCallback(
		(event: PointerEvent) => {
			if (!isCompactCallResizable) return;
			const resizeState = compactCallResizeStateRef.current;
			if (!resizeState || resizeState.pointerId !== event.pointerId) return;
			const deltaY = appZoomLayoutPx(event.clientY - resizeState.startY);
			if (!resizeState.dragging) {
				if (deltaY * deltaY <= COMPACT_CALL_RESIZE_DRAG_THRESHOLD_SQ) return;
				resizeState.dragging = true;
				setIsResizingCompactCallBanner(true);
			}
			const nextHeight = clampCompactCallBannerHeight(resizeState.startHeight + deltaY);
			resizeState.lastHeight = nextHeight;
			setCompactCallBannerHeightForKey(nextHeight);
		},
		[clampCompactCallBannerHeight, isCompactCallResizable, setCompactCallBannerHeightForKey],
	);
	const handleCompactCallResizePointerUp = useCallback(
		(event: PointerEvent) => {
			if (!isCompactCallResizable) return;
			const resizeState = compactCallResizeStateRef.current;
			if (!resizeState || resizeState.pointerId !== event.pointerId) return;
			cleanupCompactCallResizeListeners();
			if (resizeState.dragging) {
				setIsResizingCompactCallBanner(false);
				if (resizeState.lastHeight != null) {
					setCompactCallBannerHeightForKey(resizeState.lastHeight, {persist: true});
				}
			}
			compactCallResizeStateRef.current = null;
		},
		[cleanupCompactCallResizeListeners, isCompactCallResizable, setCompactCallBannerHeightForKey],
	);
	const handleCompactCallResizePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (!isCompactCallResizable || event.button !== 0 || !compactCallHeightKey) return;
			event.preventDefault();
			event.stopPropagation();
			const startHeight =
				compactCallBannerHeight ??
				CompactVoiceCallHeight.getStartingHeight(compactCallHeightKey) ??
				compactCallHeightMin;
			compactCallResizeStateRef.current = {
				pointerId: event.pointerId,
				startY: event.clientY,
				startHeight,
				dragging: false,
			};
			const moveListener = (moveEvent: PointerEvent) => handleCompactCallResizePointerMove(moveEvent);
			const upListener = (upEvent: PointerEvent) => handleCompactCallResizePointerUp(upEvent);
			compactCallResizeListenersRef.current = {move: moveListener, up: upListener};
			window.addEventListener('pointermove', moveListener);
			window.addEventListener('pointerup', upListener);
			window.addEventListener('pointercancel', upListener);
		},
		[
			compactCallBannerHeight,
			compactCallHeightKey,
			compactCallHeightMin,
			handleCompactCallResizePointerMove,
			handleCompactCallResizePointerUp,
			isCompactCallResizable,
		],
	);
	const handleCompactCallResizeKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (!isCompactCallResizable) return;
			if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
			if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
			event.preventDefault();
			const direction = event.key === 'ArrowUp' ? -1 : 1;
			const baseHeight =
				compactCallBannerHeight ??
				(compactCallHeightKey ? CompactVoiceCallHeight.getStartingHeight(compactCallHeightKey) : null) ??
				compactCallHeightMin;
			setCompactCallBannerHeightForKey(baseHeight + COMPACT_CALL_RESIZE_STEP * direction, {persist: true});
		},
		[
			compactCallBannerHeight,
			compactCallHeightKey,
			compactCallHeightMin,
			isCompactCallResizable,
			setCompactCallBannerHeightForKey,
		],
	);
	useEffect(() => {
		return () => {
			cleanupCompactCallResizeListeners();
		};
	}, [cleanupCompactCallResizeListeners]);
	useEffect(() => {
		if (!isResizingCompactCallBanner) return;
		const previousCursor = document.body.style.cursor;
		const previousUserSelect = document.body.style.userSelect;
		document.body.style.cursor = 'ns-resize';
		document.body.style.userSelect = 'none';
		return () => {
			document.body.style.cursor = previousCursor;
			document.body.style.userSelect = previousUserSelect;
		};
	}, [isResizingCompactCallBanner]);
	const compactCallBannerWrapperStyle = useMemo(() => {
		if (!isCompactCallResizable || compactCallBannerHeight == null) return undefined;
		return {
			height: compactCallBannerHeight,
			minHeight: compactCallHeightMin,
			maxHeight: compactCallMaxHeight,
		} satisfies React.CSSProperties;
	}, [compactCallBannerHeight, compactCallHeightMin, compactCallMaxHeight, isCompactCallResizable]);
	return {
		compactCallBannerHeight,
		compactCallMaxHeight,
		isResizingCompactCallBanner,
		compactCallBannerWrapperStyle,
		handleCompactCallResizePointerDown,
		handleCompactCallResizeKeyDown,
	};
}
