// SPDX-License-Identifier: AGPL-3.0-or-later

import {observeResize} from '@app/features/platform/utils/SharedResizeObserver';
import {useEffect, useState} from 'react';

type Callback = (el: Element) => void;

function observeElement(el: Element, cb: Callback): () => void {
	if (typeof ResizeObserver === 'undefined') return () => {};
	return observeResize(el, () => cb(el));
}

type OverflowAxis = 'horizontal' | 'vertical' | 'both';

function getElementOverflowState(el: HTMLElement, axis: OverflowAxis): boolean {
	const {scrollWidth, clientWidth, scrollHeight, clientHeight} = el;
	const horizontalOverflowing = scrollWidth - clientWidth > 1;
	const verticalOverflowing = scrollHeight - clientHeight > 1;
	return axis === 'horizontal'
		? horizontalOverflowing
		: axis === 'vertical'
			? verticalOverflowing
			: horizontalOverflowing || verticalOverflowing;
}

export function useElementOverflow(element: HTMLElement | null, axis: OverflowAxis = 'horizontal'): boolean {
	const [isOverflowing, setIsOverflowing] = useState(false);
	useEffect(() => {
		if (!element) {
			setIsOverflowing(false);
			return;
		}
		let rafId: number | null = null;
		const checkOverflow = () => {
			rafId = null;
			const overflowing = getElementOverflowState(element, axis);
			setIsOverflowing((prev) => (prev === overflowing ? prev : overflowing));
		};
		const scheduleCheckOverflow = () => {
			if (rafId != null) return;
			rafId = requestAnimationFrame(checkOverflow);
		};
		scheduleCheckOverflow();
		const unobserve = observeElement(element, scheduleCheckOverflow);
		return () => {
			if (rafId != null) {
				cancelAnimationFrame(rafId);
			}
			unobserve();
		};
	}, [element, axis]);
	return isOverflowing;
}

export function useTextOverflow(ref: React.RefObject<HTMLElement | null>, axis: OverflowAxis = 'horizontal'): boolean {
	const [isOverflowing, setIsOverflowing] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el) {
			setIsOverflowing(false);
			return;
		}
		let rafId: number | null = null;
		const checkOverflow = () => {
			rafId = null;
			const overflowing = getElementOverflowState(el, axis);
			setIsOverflowing((prev) => (prev === overflowing ? prev : overflowing));
		};
		const scheduleCheckOverflow = () => {
			if (rafId != null) return;
			rafId = requestAnimationFrame(checkOverflow);
		};
		scheduleCheckOverflow();
		const unobserve = observeElement(el, scheduleCheckOverflow);
		return () => {
			if (rafId != null) {
				cancelAnimationFrame(rafId);
			}
			unobserve();
		};
	}, [ref, axis]);
	return isOverflowing;
}
