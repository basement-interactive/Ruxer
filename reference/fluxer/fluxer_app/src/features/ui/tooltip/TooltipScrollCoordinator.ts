// SPDX-License-Identifier: AGPL-3.0-or-later

const SCROLL_SUPPRESS_MS = 120;

let lastScrollAt = 0;
let scrollListenerAttached = false;
let scrollRaf: number | null = null;

const scrollHideListeners = new Set<() => void>();

function getNow(): number {
	return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function releaseScrollListener(): void {
	if (!scrollListenerAttached || scrollHideListeners.size > 0 || typeof document === 'undefined') return;
	document.removeEventListener('scroll', handleScroll, true);
	scrollListenerAttached = false;
	if (scrollRaf != null) {
		cancelAnimationFrame(scrollRaf);
		scrollRaf = null;
	}
}

function handleScroll(): void {
	lastScrollAt = getNow();
	if (scrollRaf != null) return;
	scrollRaf = requestAnimationFrame(() => {
		scrollRaf = null;
		for (const listener of Array.from(scrollHideListeners)) {
			listener();
		}
	});
}

function ensureScrollListener(): void {
	if (scrollListenerAttached || typeof document === 'undefined') return;
	document.addEventListener('scroll', handleScroll, {capture: true, passive: true});
	scrollListenerAttached = true;
}

export function getTooltipScrollSuppressRemainingMs(): number {
	if (lastScrollAt <= 0) return 0;
	return Math.max(0, SCROLL_SUPPRESS_MS - (getNow() - lastScrollAt));
}

export function subscribeTooltipScrollHide(listener: () => void): () => void {
	scrollHideListeners.add(listener);
	ensureScrollListener();
	return () => {
		scrollHideListeners.delete(listener);
		releaseScrollListener();
	};
}
