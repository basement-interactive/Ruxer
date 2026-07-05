// SPDX-License-Identifier: AGPL-3.0-or-later

import {useCallback, useEffect, useRef} from 'react';

interface ScrollAnchorOptions {
	containerSelector?: string;
	durationMs?: number;
}

interface ActiveAnchor {
	container: HTMLElement;
	targetTop: number;
	deadline: number;
	cleanupUserScrollListeners: () => void;
}

function findScrollContainer(el: HTMLElement, selector: string | undefined): HTMLElement | null {
	if (selector !== undefined) {
		const found = el.closest(selector);
		return found instanceof HTMLElement ? found : null;
	}
	let current: HTMLElement | null = el.parentElement;
	while (current !== null && current !== document.body) {
		const style = window.getComputedStyle(current);
		const overflowY = style.overflowY;
		if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
			if (current.scrollHeight > current.clientHeight) {
				return current;
			}
		}
		current = current.parentElement;
	}
	return null;
}

export function useScrollAnchor<T extends HTMLElement = HTMLElement>(options: ScrollAnchorOptions = {}) {
	const {containerSelector, durationMs = 400} = options;
	const anchorRef = useRef<T | null>(null);
	const rafRef = useRef<number | null>(null);
	const stateRef = useRef<ActiveAnchor | null>(null);
	const cancel = useCallback(() => {
		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
		stateRef.current?.cleanupUserScrollListeners();
		stateRef.current = null;
	}, []);
	const anchor = useCallback(() => {
		const el = anchorRef.current;
		if (el === null) return;
		const container = findScrollContainer(el, containerSelector);
		if (container === null) return;
		const anchorRect = el.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();
		const targetTop = anchorRect.top - containerRect.top;
		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
		stateRef.current?.cleanupUserScrollListeners();
		const cancelForUserScroll = () => cancel();
		const passiveOptions: AddEventListenerOptions = {passive: true};
		const keyOptions: AddEventListenerOptions = {capture: true};
		container.addEventListener('wheel', cancelForUserScroll, passiveOptions);
		container.addEventListener('touchstart', cancelForUserScroll, passiveOptions);
		container.addEventListener('touchmove', cancelForUserScroll, passiveOptions);
		container.addEventListener('pointerdown', cancelForUserScroll, passiveOptions);
		window.addEventListener('keydown', cancelForUserScroll, keyOptions);
		const cleanupUserScrollListeners = () => {
			container.removeEventListener('wheel', cancelForUserScroll, passiveOptions);
			container.removeEventListener('touchstart', cancelForUserScroll, passiveOptions);
			container.removeEventListener('touchmove', cancelForUserScroll, passiveOptions);
			container.removeEventListener('pointerdown', cancelForUserScroll, passiveOptions);
			window.removeEventListener('keydown', cancelForUserScroll, keyOptions);
		};
		stateRef.current = {
			container,
			targetTop,
			deadline: performance.now() + durationMs,
			cleanupUserScrollListeners,
		};
		const tick = () => {
			const state = stateRef.current;
			const node = anchorRef.current;
			if (state === null || node === null) {
				rafRef.current = null;
				stateRef.current = null;
				return;
			}
			const ar = node.getBoundingClientRect();
			const cr = state.container.getBoundingClientRect();
			const currentTop = ar.top - cr.top;
			const delta = currentTop - state.targetTop;
			if (Math.abs(delta) > 0.5) {
				state.container.scrollTop += delta;
			}
			if (performance.now() < state.deadline) {
				rafRef.current = requestAnimationFrame(tick);
			} else {
				state.cleanupUserScrollListeners();
				rafRef.current = null;
				stateRef.current = null;
			}
		};
		rafRef.current = requestAnimationFrame(tick);
	}, [cancel, containerSelector, durationMs]);
	useEffect(() => cancel, [cancel]);
	return {anchorRef, anchor};
}
