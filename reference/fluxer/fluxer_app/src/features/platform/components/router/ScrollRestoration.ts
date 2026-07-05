// SPDX-License-Identifier: AGPL-3.0-or-later

import {getBrowserNavigation} from '@app/features/platform/components/router/BrowserNavigation';

const STATE_KEY = '__fluxer_scroll_key';
const scrollMap = new Map<
	string,
	{
		x: number;
		y: number;
	}
>();

let installed = false;

const getKey = (): string => {
	const navigation = getBrowserNavigation();
	if (navigation?.currentEntry) return `n:${navigation.currentEntry.id}`;
	const state = window.history.state as Record<string, unknown> | null;
	let key = state && typeof state[STATE_KEY] === 'string' ? (state[STATE_KEY] as string) : null;
	if (!key) {
		key = `h:${Math.random().toString(36).slice(2)}`;
		try {
			window.history.replaceState({...(state ?? {}), [STATE_KEY]: key}, '', window.location.href);
		} catch {}
	}
	return key;
};
const snapshot = () => {
	if (typeof window === 'undefined') return;
	scrollMap.set(getKey(), {x: window.scrollX, y: window.scrollY});
};
const restore = () => {
	if (typeof window === 'undefined') return;
	const pos = scrollMap.get(getKey());
	if (!pos) return;
	requestAnimationFrame(() => window.scrollTo(pos.x, pos.y));
};

export function installScrollRestoration(): void {
	if (installed || typeof window === 'undefined') return;
	installed = true;
	window.history.scrollRestoration = 'manual';
	const navigation = getBrowserNavigation();
	if (navigation) {
		navigation.addEventListener('navigate', () => snapshot());
		navigation.addEventListener('navigatesuccess', () => restore());
		return;
	}
	const onPopState = () => {
		restore();
	};
	let scrollTimer: number | null = null;
	const onScroll = () => {
		if (scrollTimer !== null) window.clearTimeout(scrollTimer);
		scrollTimer = window.setTimeout(snapshot, 100);
	};
	window.addEventListener('popstate', onPopState);
	window.addEventListener('scroll', onScroll, {passive: true});
}
