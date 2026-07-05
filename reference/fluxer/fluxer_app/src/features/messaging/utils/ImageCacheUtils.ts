// SPDX-License-Identifier: AGPL-3.0-or-later

import {LRUCache} from 'lru-cache';

interface ImageCacheEntry {
	image?: HTMLImageElement;
}

interface PendingImageLoad {
	image: HTMLImageElement;
	onLoadCallbacks: Set<() => void>;
	onErrorCallbacks: Set<() => void>;
}

const MAX_CACHE_ENTRIES = 500;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const FALLBACK_IMAGE_BYTES = 256 * 1024;

const estimateImageBytes = (entry: ImageCacheEntry): number => {
	const width = entry.image?.naturalWidth ?? 0;
	const height = entry.image?.naturalHeight ?? 0;
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return FALLBACK_IMAGE_BYTES;
	}
	return Math.min(width * height * 4, MAX_CACHE_BYTES);
};

const imageCache = new LRUCache<string, ImageCacheEntry>({
	max: MAX_CACHE_ENTRIES,
	maxSize: MAX_CACHE_BYTES,
	sizeCalculation: estimateImageBytes,
	dispose: (entry) => {
		if (!entry.image) return;
		entry.image.onload = null;
		entry.image.onerror = null;
	},
});
const pendingImageLoads = new Map<string, PendingImageLoad>();
const isLoadedImage = (image?: HTMLImageElement): image is HTMLImageElement => {
	return Boolean(image?.complete && image.naturalWidth > 0);
};
const isCached = (src: string | null): boolean => {
	if (!src) return false;
	return isLoadedImage(imageCache.get(src)?.image);
};

export function hasImage(src: string | null): boolean {
	return isCached(src);
}

export function getImage(src: string | null): HTMLImageElement | undefined {
	if (!src) return undefined;
	const image = imageCache.get(src)?.image;
	return isLoadedImage(image) ? image : undefined;
}

export function rememberImage(src: string | null, image?: HTMLImageElement): void {
	if (!src) return;
	imageCache.set(src, image ? {image} : {});
	const currentPendingLoad = pendingImageLoads.get(src);
	pendingImageLoads.delete(src);
	if (!currentPendingLoad) return;
	currentPendingLoad.image.onload = null;
	currentPendingLoad.image.onerror = null;
	for (const callback of currentPendingLoad.onLoadCallbacks) {
		callback();
	}
}

export function forgetImage(src: string | null): void {
	if (!src) return;
	imageCache.delete(src);
	const currentPendingLoad = pendingImageLoads.get(src);
	pendingImageLoads.delete(src);
	if (!currentPendingLoad) return;
	currentPendingLoad.image.onload = null;
	currentPendingLoad.image.onerror = null;
	for (const callback of currentPendingLoad.onErrorCallbacks) {
		callback();
	}
}

export function loadImage(src: string | null, onLoad: () => void, onError?: () => void): () => void {
	if (!src) {
		onError?.();
		return () => {};
	}
	if (isCached(src)) {
		imageCache.get(src);
		onLoad();
		return () => {};
	}
	const pendingLoad = pendingImageLoads.get(src);
	if (pendingLoad) {
		pendingLoad.onLoadCallbacks.add(onLoad);
		if (onError) {
			pendingLoad.onErrorCallbacks.add(onError);
		}
		return () => {
			pendingLoad.onLoadCallbacks.delete(onLoad);
			if (onError) {
				pendingLoad.onErrorCallbacks.delete(onError);
			}
		};
	}
	const image = new Image();
	const onLoadCallbacks = new Set<() => void>([onLoad]);
	const onErrorCallbacks = new Set<() => void>();
	if (onError) {
		onErrorCallbacks.add(onError);
	}
	pendingImageLoads.set(src, {image, onLoadCallbacks, onErrorCallbacks});
	image.onload = () => {
		rememberImage(src, image);
	};
	image.onerror = () => {
		forgetImage(src);
	};
	image.src = src;
	return () => {
		onLoadCallbacks.delete(onLoad);
		if (onError) {
			onErrorCallbacks.delete(onError);
		}
	};
}

export function _clearForTests(): void {
	imageCache.clear();
	pendingImageLoads.clear();
}
