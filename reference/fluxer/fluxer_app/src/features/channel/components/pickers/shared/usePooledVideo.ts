// SPDX-License-Identifier: AGPL-3.0-or-later

import {safePause, safePlay} from '@app/features/channel/components/GifVideoPool';
import {Platform} from '@app/features/platform/types/Platform';
import {useEffect, useRef} from 'react';

const BYPASS_BLOB_URL_PATH = Platform.isIOSWeb;
const HAVE_METADATA_READY_STATE = 1;

interface GifVideoPoolLike {
	getElement: (key: string) => HTMLVideoElement;
	getBlobUrl: (key: string) => Promise<string>;
	registerActive: (video: HTMLVideoElement) => void;
	unregisterActive: (video: HTMLVideoElement) => void;
	poolElement: (video: HTMLVideoElement, key: string) => void;
	isGloballyPaused?: () => boolean;
}

export function usePooledVideo({
	src,
	containerRef,
	videoPool,
	autoPlay,
	enabled = true,
	preload = 'auto',
	useBlobCache = true,
	playbackStartTime = null,
}: {
	src: string | null | undefined;
	containerRef: React.RefObject<HTMLDivElement | null>;
	videoPool: GifVideoPoolLike;
	autoPlay: boolean;
	enabled?: boolean;
	preload?: HTMLVideoElement['preload'];
	useBlobCache?: boolean;
	playbackStartTime?: number | null;
}) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	useEffect(() => {
		if (!enabled) return;
		if (!src) return;
		const container = containerRef.current;
		if (!container) return;
		let cancelled = false;
		let attached = false;
		let playOnMetadata: (() => void) | null = null;
		const video = videoPool.getElement(src);
		videoRef.current = video;
		video.autoplay = autoPlay && playbackStartTime === null;
		if (video.autoplay) {
			video.setAttribute('autoplay', '');
		} else {
			video.removeAttribute('autoplay');
		}
		video.preload = preload;
		videoPool.registerActive(video);
		attached = true;
		const seekToPlaybackStart = () => {
			if (playbackStartTime === null || playbackStartTime <= 0) return;
			const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
			const target = duration === null ? playbackStartTime : Math.min(playbackStartTime, Math.max(0, duration - 0.05));
			try {
				video.currentTime = target;
			} catch {}
		};
		const playFromStartTime = () => {
			if (cancelled) return;
			seekToPlaybackStart();
			void safePlay(video);
		};
		const run = async () => {
			if (BYPASS_BLOB_URL_PATH || !useBlobCache) {
				if (video.src !== src) video.src = src;
			} else {
				try {
					const blobUrl = await videoPool.getBlobUrl(src);
					if (cancelled) return;
					if (video.src !== blobUrl) video.src = blobUrl;
				} catch {
					if (cancelled) return;
					if (video.src !== src) video.src = src;
				}
			}
			if (cancelled) return;
			const currentContainer = containerRef.current;
			if (!currentContainer) return;
			currentContainer.appendChild(video);
			if (videoPool.isGloballyPaused?.() ?? false) {
				safePause(video);
			} else if (playbackStartTime !== null && playbackStartTime > 0 && video.readyState < HAVE_METADATA_READY_STATE) {
				playOnMetadata = playFromStartTime;
				video.addEventListener('loadedmetadata', playOnMetadata, {once: true});
			} else if (autoPlay) {
				playFromStartTime();
			}
		};
		void run();
		return () => {
			cancelled = true;
			if (playOnMetadata) {
				video.removeEventListener('loadedmetadata', playOnMetadata);
			}
			if (attached) {
				videoPool.unregisterActive(video);
			}
			safePause(video);
			try {
				video.currentTime = 0;
			} catch {}
			videoPool.poolElement(video, src);
			if (videoRef.current === video) {
				videoRef.current = null;
			}
		};
	}, [src, enabled, containerRef, videoPool, autoPlay, preload, useBlobCache, playbackStartTime]);
	return videoRef;
}
