// SPDX-License-Identifier: AGPL-3.0-or-later

import {getAnimatedMediaPlaybackAllowed} from '@app/features/app/hooks/useAnimatedMediaPlayback';
import React, {useContext, useEffect, useState} from 'react';

const PENDING_PLAY = Symbol('pendingPlay');
const PLAY_REQUEST_ID = Symbol('playRequestId');

type VideoWithPending = HTMLVideoElement & {[PENDING_PLAY]?: Promise<void> | null; [PLAY_REQUEST_ID]?: number};

export function safePlay(video: HTMLVideoElement): Promise<void> {
	if (!getAnimatedMediaPlaybackAllowed()) return Promise.resolve();
	const v = video as VideoWithPending;
	const playRequestId = (v[PLAY_REQUEST_ID] ?? 0) + 1;
	v[PLAY_REQUEST_ID] = playRequestId;
	const promise = v.play().catch(() => {});
	v[PENDING_PLAY] = promise;
	void promise.finally(() => {
		if (v[PENDING_PLAY] === promise) v[PENDING_PLAY] = null;
	});
	return promise;
}

export function safePause(video: HTMLVideoElement): void {
	const v = video as VideoWithPending;
	const pending = v[PENDING_PLAY];
	const doPause = () => {
		try {
			v.pause();
		} catch {}
	};
	if (pending) {
		const playRequestId = v[PLAY_REQUEST_ID] ?? 0;
		void pending.finally(() => {
			if (v[PLAY_REQUEST_ID] === playRequestId) doPause();
		});
	} else {
		doPause();
	}
}

class ElementPool<T> {
	private _elements: Array<T>;
	private _createElement: () => T;
	private _cleanElement: (element: T) => void;

	constructor(createElement: () => T, cleanElement: (element: T) => void) {
		this._elements = [];
		this._createElement = createElement;
		this._cleanElement = cleanElement;
	}

	getElement(): T {
		return this._elements.length === 0 ? this._createElement() : this._elements.pop()!;
	}

	poolElement(element: T): void {
		this._cleanElement(element);
		this._elements.push(element);
	}

	clearPool(): void {
		this._elements.length = 0;
	}
}

interface PooledVideo {
	getElement: (src?: string) => HTMLVideoElement;
	poolElement: (element: HTMLVideoElement, src?: string) => void;
	clearPool: () => void;
	getBlobUrl: (src: string) => Promise<string>;
	clearBlobCache: () => void;
	registerActive: (element: HTMLVideoElement) => void;
	unregisterActive: (element: HTMLVideoElement) => void;
	pauseAll: () => void;
	resumeAll: () => void;
	isGloballyPaused: () => boolean;
}

const GifVideoPoolContext = React.createContext<PooledVideo | null>(null);
export const GifVideoPoolProvider = ({children}: {children: React.ReactNode}) => {
	const [videoPool] = useState<PooledVideo>(() => {
		const basePool = new ElementPool<HTMLVideoElement>(
			() => {
				const video = document.createElement('video');
				video.autoplay = false;
				video.loop = true;
				video.muted = true;
				video.playsInline = true;
				video.setAttribute('playsinline', '');
				video.setAttribute('webkit-playsinline', '');
				video.preload = 'auto';
				video.controls = false;
				video.style.width = '100%';
				video.style.height = '100%';
				video.style.objectFit = 'cover';
				video.style.display = 'block';
				return video;
			},
			(video) => {
				video.src = '';
				video.oncanplay = null;
				video.currentTime = 0;
				const {parentNode} = video;
				if (parentNode != null) {
					parentNode.removeChild(video);
				}
			},
		);
		const elementCache = new Map<string, HTMLVideoElement>();
		const MAX_ELEMENTS = 16;
		const blobCache = new Map<string, string>();
		const inflight = new Map<string, Promise<string>>();
		const MAX_BLOBS = 32;
		const activeElements = new Set<HTMLVideoElement>();
		let globallyPaused = !getAnimatedMediaPlaybackAllowed();
		const evictOldestBlob = () => {
			const oldest = blobCache.keys().next();
			if (!oldest.done) {
				const key = oldest.value;
				const url = blobCache.get(key);
				if (url) {
					URL.revokeObjectURL(url);
				}
				blobCache.delete(key);
			}
		};
		const getBlobUrl = async (src: string): Promise<string> => {
			if (blobCache.has(src)) {
				return blobCache.get(src)!;
			}
			if (inflight.has(src)) {
				return inflight.get(src)!;
			}
			const promise = (async () => {
				const response = await fetch(src, {cache: 'force-cache'});
				const blob = await response.blob();
				const url = URL.createObjectURL(blob);
				if (blobCache.size >= MAX_BLOBS) {
					evictOldestBlob();
				}
				blobCache.set(src, url);
				return url;
			})().finally(() => {
				inflight.delete(src);
			});
			inflight.set(src, promise);
			return promise;
		};
		return {
			getElement(src?: string): HTMLVideoElement {
				if (src && elementCache.has(src)) {
					const el = elementCache.get(src)!;
					elementCache.delete(src);
					return el;
				}
				return basePool.getElement();
			},
			poolElement(element: HTMLVideoElement, src?: string): void {
				activeElements.delete(element);
				const {parentNode} = element;
				if (parentNode != null) {
					parentNode.removeChild(element);
				}
				if (src) {
					element.oncanplay = null;
					element.pause();
					element.currentTime = 0;
					element.src = '';
					if (elementCache.size >= MAX_ELEMENTS) {
						const oldestKey = elementCache.keys().next().value as string | undefined;
						if (oldestKey) {
							const oldest = elementCache.get(oldestKey);
							if (oldest) {
								basePool.poolElement(oldest);
							}
							elementCache.delete(oldestKey);
						}
					}
					elementCache.set(src, element);
					return;
				}
				basePool.poolElement(element);
			},
			clearPool(): void {
				activeElements.clear();
				elementCache.forEach((el) => {
					el.src = '';
					el.oncanplay = null;
				});
				elementCache.clear();
				basePool.clearPool();
				blobCache.forEach((url) => URL.revokeObjectURL(url));
				blobCache.clear();
				inflight.clear();
			},
			registerActive(element: HTMLVideoElement) {
				activeElements.add(element);
				if (globallyPaused) {
					safePause(element);
				}
			},
			unregisterActive(element: HTMLVideoElement) {
				activeElements.delete(element);
			},
			pauseAll() {
				globallyPaused = true;
				activeElements.forEach(safePause);
			},
			resumeAll() {
				globallyPaused = false;
				activeElements.forEach((el) => {
					void safePlay(el);
				});
			},
			isGloballyPaused() {
				return globallyPaused;
			},
			getBlobUrl,
			clearBlobCache(): void {
				blobCache.forEach((url) => URL.revokeObjectURL(url));
				blobCache.clear();
			},
		};
	});
	useEffect(() => {
		return () => {
			videoPool.clearPool();
		};
	}, [videoPool]);
	return <GifVideoPoolContext.Provider value={videoPool}>{children}</GifVideoPoolContext.Provider>;
};
export const useGifVideoPool = (): PooledVideo => {
	const pool = useContext(GifVideoPoolContext);
	if (!pool) {
		throw new Error('useGifVideoPool must be used within GifVideoPoolProvider');
	}
	return pool;
};
