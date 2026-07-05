// SPDX-License-Identifier: AGPL-3.0-or-later

import {videoElementHasRenderedFrame} from '@app/features/voice/components/VideoElementFrameState';
import {i420VideoFrameLayout} from '@app/features/voice/engine/native_voice_engine/createInboundVideoBridge';
import type {NativeRetainedVideoFrame} from '@app/features/voice/engine/native_voice_engine/NativeVideoTileManager';
import {Store} from '@app/features/voice/engine/Store';
import {getVideoFrameCtor} from '@app/features/voice/utils/native_screen_capture_bridge/shared';

export const LAST_FRAME_SNAPSHOTS_MAX = 8;
export const LAST_FRAME_SNAPSHOT_WIDTH_MAX = 1280;
export const LAST_FRAME_SNAPSHOT_JPEG_QUALITY = 0.7;

function computeSnapshotDimensions(sourceWidth: number, sourceHeight: number): {width: number; height: number} {
	if (sourceWidth <= LAST_FRAME_SNAPSHOT_WIDTH_MAX) {
		return {width: sourceWidth, height: sourceHeight};
	}
	const scale = LAST_FRAME_SNAPSHOT_WIDTH_MAX / sourceWidth;
	return {
		width: LAST_FRAME_SNAPSHOT_WIDTH_MAX,
		height: Math.max(1, Math.round(sourceHeight * scale)),
	};
}

function drawSourceToDataUrl(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): string | null {
	if (typeof document === 'undefined') return null;
	if (sourceWidth <= 0 || sourceHeight <= 0) return null;
	try {
		const {width, height} = computeSnapshotDimensions(sourceWidth, sourceHeight);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) return null;
		context.drawImage(source, 0, 0, width, height);
		return canvas.toDataURL('image/jpeg', LAST_FRAME_SNAPSHOT_JPEG_QUALITY);
	} catch {
		return null;
	}
}

class LastFrameSnapshotCache extends Store {
	private snapshots = new Map<string, string>();

	get size(): number {
		return this.snapshots.size;
	}

	getSnapshotUrl(key: string): string | null {
		return this.snapshots.get(key) ?? null;
	}

	retainSnapshot(key: string, dataUrl: string): void {
		if (!key || !dataUrl) return;
		this.update(() => {
			if (this.snapshots.has(key)) {
				this.snapshots.delete(key);
			}
			this.snapshots.set(key, dataUrl);
			while (this.snapshots.size > LAST_FRAME_SNAPSHOTS_MAX) {
				const oldestKey = this.snapshots.keys().next().value;
				if (oldestKey === undefined) break;
				this.snapshots.delete(oldestKey);
			}
		});
	}

	captureFromVideoElement(key: string, video: HTMLVideoElement | null): void {
		if (!key) return;
		if (!videoElementHasRenderedFrame(video)) return;
		const renderedVideo = video as HTMLVideoElement;
		const dataUrl = drawSourceToDataUrl(renderedVideo, renderedVideo.videoWidth, renderedVideo.videoHeight);
		if (!dataUrl) return;
		this.retainSnapshot(key, dataUrl);
	}

	captureFromNativeFrame(key: string, frame: NativeRetainedVideoFrame | undefined): void {
		if (!key || !frame) return;
		const VideoFrameImpl = getVideoFrameCtor();
		if (!VideoFrameImpl) return;
		try {
			const videoFrame = new VideoFrameImpl(new Uint8Array(frame.data), {
				format: 'I420',
				codedWidth: frame.width,
				codedHeight: frame.height,
				timestamp: frame.timestampUs,
				layout: i420VideoFrameLayout(frame.width, frame.height),
			});
			try {
				const dataUrl = drawSourceToDataUrl(videoFrame as unknown as CanvasImageSource, frame.width, frame.height);
				if (dataUrl) {
					this.retainSnapshot(key, dataUrl);
				}
			} finally {
				videoFrame.close();
			}
		} catch {
			return;
		}
	}

	release(key: string): void {
		if (!this.snapshots.has(key)) return;
		this.update(() => {
			this.snapshots.delete(key);
		});
	}

	clear(): void {
		if (this.snapshots.size === 0) return;
		this.update(() => {
			this.snapshots.clear();
		});
	}
}

export default new LastFrameSnapshotCache();
export {LastFrameSnapshotCache};
