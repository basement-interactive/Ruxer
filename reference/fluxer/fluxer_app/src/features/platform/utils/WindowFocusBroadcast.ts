// SPDX-License-Identifier: AGPL-3.0-or-later

type FocusCallback = () => void;

const callbacks = new Set<FocusCallback>();

let attached = false;

function dispatch(): void {
	for (const cb of callbacks) {
		try {
			cb();
		} catch (error) {
			console.error('WindowFocusBroadcast callback threw:', error);
		}
	}
}

function ensureAttached(): void {
	if (attached || typeof window === 'undefined') return;
	window.addEventListener('focus', dispatch);
	attached = true;
}

export function subscribeWindowFocus(callback: FocusCallback): () => void {
	ensureAttached();
	callbacks.add(callback);
	return () => {
		callbacks.delete(callback);
	};
}
