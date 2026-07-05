// SPDX-License-Identifier: AGPL-3.0-or-later

export const WORKER_CACHE_PREFIX = 'fluxer';
const LEGACY_EXPRESSION_ASSET_CACHE_PREFIX = `${WORKER_CACHE_PREFIX}-expression-assets`;

export function isLegacyExpressionAssetCacheName(cacheName: string): boolean {
	return (
		cacheName === LEGACY_EXPRESSION_ASSET_CACHE_PREFIX ||
		cacheName.startsWith(`${LEGACY_EXPRESSION_ASSET_CACHE_PREFIX}-`)
	);
}

export function shouldDeleteWorkerCache(cacheName: string, expectedCaches: ReadonlySet<string>): boolean {
	if (isLegacyExpressionAssetCacheName(cacheName)) {
		return true;
	}
	if (!cacheName.startsWith(`${WORKER_CACHE_PREFIX}-`) || expectedCaches.has(cacheName)) {
		return false;
	}
	if (cacheName.startsWith(`${WORKER_CACHE_PREFIX}-assets-`)) {
		return false;
	}
	return true;
}
