// SPDX-License-Identifier: AGPL-3.0-or-later

import {useEffect} from 'react';

type ImagePreloadStatus = 'loading' | 'loaded' | 'error';

interface ImagePreloadEntry {
	status: ImagePreloadStatus;
	promise: Promise<void> | null;
	lastUsed: number;
	failedAt: number | null;
}

const MAX_IMAGE_PRELOAD_CACHE_ENTRIES = 512;
const IDLE_PRELOAD_BATCH_SIZE = 12;
const IMAGE_PRELOAD_ERROR_RETRY_DELAY_MS = 5000;

const imagePreloadCache = new Map<string, ImagePreloadEntry>();

function shouldRetryFailedEntry(entry: ImagePreloadEntry): boolean {
	return (
		entry.status === 'error' &&
		entry.failedAt !== null &&
		Date.now() - entry.failedAt >= IMAGE_PRELOAD_ERROR_RETRY_DELAY_MS
	);
}

function touchEntry(url: string, entry: ImagePreloadEntry): ImagePreloadEntry {
	entry.lastUsed = Date.now();
	imagePreloadCache.delete(url);
	imagePreloadCache.set(url, entry);
	return entry;
}

function pruneImagePreloadCache(): void {
	while (imagePreloadCache.size > MAX_IMAGE_PRELOAD_CACHE_ENTRIES) {
		const oldestUrl = imagePreloadCache.keys().next().value;
		if (oldestUrl === undefined) {
			return;
		}
		const entry = imagePreloadCache.get(oldestUrl);
		if (entry?.status === 'loading') {
			imagePreloadCache.delete(oldestUrl);
			imagePreloadCache.set(oldestUrl, entry);
			return;
		}
		imagePreloadCache.delete(oldestUrl);
	}
}

function scheduleImagePreload(callback: () => void): void {
	if (typeof window === 'undefined') {
		return;
	}
	if (typeof window.requestIdleCallback === 'function') {
		window.requestIdleCallback(callback, {timeout: 250});
		return;
	}
	window.setTimeout(callback, 0);
}

export function preloadExpressionImage(url: string | null | undefined): Promise<void> | null {
	if (!url || typeof window === 'undefined' || typeof Image === 'undefined') {
		return null;
	}
	const existing = imagePreloadCache.get(url);
	if (existing) {
		if (shouldRetryFailedEntry(existing)) {
			imagePreloadCache.delete(url);
		} else {
			touchEntry(url, existing);
			return existing.promise;
		}
	}
	const image = new Image();
	const entry: ImagePreloadEntry = {
		status: 'loading',
		promise: null,
		lastUsed: Date.now(),
		failedAt: null,
	};
	entry.promise = new Promise<void>((resolve) => {
		image.onload = () => {
			image.onload = null;
			image.onerror = null;
			entry.status = 'loaded';
			entry.promise = null;
			entry.failedAt = null;
			resolve();
		};
		image.onerror = () => {
			image.onload = null;
			image.onerror = null;
			entry.status = 'error';
			entry.promise = null;
			entry.failedAt = Date.now();
			resolve();
		};
	});
	try {
		image.decoding = 'async';
	} catch {}
	image.src = url;
	imagePreloadCache.set(url, entry);
	pruneImagePreloadCache();
	return entry.promise;
}

export function preloadExpressionImages(urls: ReadonlyArray<string | null | undefined>): void {
	if (urls.length === 0) {
		return;
	}
	const uniqueUrls = Array.from(new Set(urls.filter((url): url is string => Boolean(url))));
	if (uniqueUrls.length === 0) {
		return;
	}
	let index = 0;
	const preloadNextBatch = () => {
		const end = Math.min(index + IDLE_PRELOAD_BATCH_SIZE, uniqueUrls.length);
		for (; index < end; index++) {
			preloadExpressionImage(uniqueUrls[index]);
		}
		if (index < uniqueUrls.length) {
			scheduleImagePreload(preloadNextBatch);
		}
	};
	scheduleImagePreload(preloadNextBatch);
}

export function useExpressionImagePreload(url: string | null | undefined): void {
	useEffect(() => {
		void preloadExpressionImage(url);
	}, [url]);
}

export function useExpressionImagesPreload(urls: ReadonlyArray<string | null | undefined>): void {
	useEffect(() => {
		preloadExpressionImages(urls);
	}, [urls]);
}

export function getExpressionImagePreloadStatus(url: string | null | undefined): ImagePreloadStatus | null {
	if (!url) {
		return null;
	}
	return imagePreloadCache.get(url)?.status ?? null;
}

export function clearExpressionImagePreloadCacheForTests(): void {
	imagePreloadCache.clear();
}
