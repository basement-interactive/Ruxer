// SPDX-License-Identifier: AGPL-3.0-or-later

type Callback = (entry: ResizeObserverEntry) => void;

const callbacks = new WeakMap<Element, Set<Callback>>();

let nativeObserver: ResizeObserver | null = null;
let observedElementCount = 0;

function getObserver(): ResizeObserver {
	if (nativeObserver) return nativeObserver;
	nativeObserver = new ResizeObserver((entries) => {
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			const handlers = callbacks.get(entry.target);
			if (!handlers) continue;
			for (const cb of handlers) {
				try {
					cb(entry);
				} catch (error) {
					console.error('SharedResizeObserver callback threw:', error);
				}
			}
		}
	});
	return nativeObserver;
}

export function observeResize(element: Element, callback: Callback): () => void {
	let handlers = callbacks.get(element);
	if (!handlers) {
		handlers = new Set();
		callbacks.set(element, handlers);
		observedElementCount++;
		getObserver().observe(element);
	}
	handlers.add(callback);
	return () => unobserveResize(element, callback);
}

export function unobserveResize(element: Element, callback: Callback): void {
	const handlers = callbacks.get(element);
	if (!handlers) return;
	handlers.delete(callback);
	if (handlers.size === 0) {
		callbacks.delete(element);
		nativeObserver?.unobserve?.(element);
		observedElementCount = Math.max(0, observedElementCount - 1);
		if (observedElementCount === 0) {
			nativeObserver?.disconnect();
			nativeObserver = null;
		}
	}
}
