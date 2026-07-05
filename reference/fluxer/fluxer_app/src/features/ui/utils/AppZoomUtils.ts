// SPDX-License-Identifier: AGPL-3.0-or-later

let cachedZoomFactor: number | null = null;
let clearZoomCacheRafId: number | null = null;

export interface AppZoomPoint {
	x: number;
	y: number;
}

export interface AppZoomSize {
	width: number;
	height: number;
}

export interface AppZoomElectronApi {
	setZoomFactor?: (factor: number) => void;
}

function scheduleZoomCacheClear(): void {
	if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
		cachedZoomFactor = null;
		return;
	}
	if (clearZoomCacheRafId != null) return;
	clearZoomCacheRafId = window.requestAnimationFrame(() => {
		clearZoomCacheRafId = null;
		cachedZoomFactor = null;
	});
}

export function clearAppZoomCache(): void {
	cachedZoomFactor = null;
	if (clearZoomCacheRafId == null || typeof window === 'undefined') return;
	if (typeof window.cancelAnimationFrame === 'function') {
		window.cancelAnimationFrame(clearZoomCacheRafId);
	}
	clearZoomCacheRafId = null;
}

export function getAppZoomFactor(): number {
	if (typeof document === 'undefined') {
		return 1;
	}
	if (cachedZoomFactor != null) {
		return cachedZoomFactor;
	}
	const root = document.documentElement;
	const customZoom = root.classList.contains('platform-native')
		? Number.parseFloat(getComputedStyle(root).getPropertyValue('--custom-zoom'))
		: 100;
	cachedZoomFactor = Number.isFinite(customZoom) && customZoom > 0 ? customZoom / 100 : 1;
	scheduleZoomCacheClear();
	return cachedZoomFactor;
}

export function applyAppZoomToDocument(zoomPercent: number, electronApi?: AppZoomElectronApi | null): void {
	if (typeof document === 'undefined') {
		clearAppZoomCache();
		return;
	}
	const root = document.documentElement;
	const normalizedZoomPercent = Number.isFinite(zoomPercent)
		? Math.max(50, Math.min(200, Math.round(zoomPercent)))
		: 100;
	root.style.removeProperty('zoom');
	root.style.removeProperty('--app-zoom-factor');
	root.style.removeProperty('font-size');
	if (electronApi) {
		root.style.setProperty('--custom-zoom', String(normalizedZoomPercent));
		electronApi.setZoomFactor?.(1);
	} else {
		root.style.removeProperty('--custom-zoom');
	}
	clearAppZoomCache();
}

export function appZoomLayoutPx(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return value;
}

export function appZoomClientPoint(clientX: number, clientY: number): AppZoomPoint {
	return {
		x: appZoomLayoutPx(clientX),
		y: appZoomLayoutPx(clientY),
	};
}

export function getAppZoomViewportSize(): AppZoomSize {
	if (typeof window === 'undefined') {
		return {width: 0, height: 0};
	}
	const documentElement = typeof document === 'undefined' ? null : document.documentElement;
	return {
		width: window.innerWidth || documentElement?.clientWidth || 0,
		height: window.innerHeight || documentElement?.clientHeight || 0,
	};
}

export function appZoomCssPx(value: number): string {
	return `${appZoomLayoutPx(value)}px`;
}
