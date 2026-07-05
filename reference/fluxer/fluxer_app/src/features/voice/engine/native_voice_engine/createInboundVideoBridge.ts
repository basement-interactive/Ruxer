// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {
	getGeneratorVideoCtor,
	getVideoFrameCtor,
	MAX_GENERATOR_PENDING_VIDEO_FRAMES,
	type RendererVideoFrame,
	type VideoFrameInit,
} from '@app/features/voice/utils/native_screen_capture_bridge/shared';

const logger = new Logger('InboundVideoBridge');

const DISPOSE_FAILURE_COUNT_MAX = 1_000_000;
const DISPOSE_FAILURE_LOG_INTERVAL = 100;

export function i420VideoFrameLayout(width: number, height: number): Array<{offset: number; stride: number}> {
	const chromaWidth = width >> 1;
	const yPlaneBytes = width * height;
	const uPlaneBytes = chromaWidth * (height >> 1);
	return [
		{offset: 0, stride: width},
		{offset: yPlaneBytes, stride: chromaWidth},
		{offset: yPlaneBytes + uPlaneBytes, stride: chromaWidth},
	];
}

export function tightI420ByteLength(width: number, height: number): number {
	const chromaWidth = width >> 1;
	const chromaHeight = height >> 1;
	return width * height + 2 * chromaWidth * chromaHeight;
}

export interface InboundVideoFrameInput {
	width: number;
	height: number;
	timestampUs: number;
	data: ArrayBuffer;
}

export interface InboundVideoBridgeHandle {
	track: MediaStreamTrack;
	stream: MediaStream;
	pushFrame: (frame: InboundVideoFrameInput) => void;
	cleanup: () => Promise<void>;
}

class InboundVideoFrameRing {
	private readonly frames: Array<RendererVideoFrame | null>;
	private head = 0;
	private tail = 0;
	private count = 0;

	constructor() {
		assert.ok(MAX_GENERATOR_PENDING_VIDEO_FRAMES > 0, 'inbound video queue capacity must be positive');
		this.frames = new Array(MAX_GENERATOR_PENDING_VIDEO_FRAMES).fill(null);
	}

	get length(): number {
		return this.count;
	}

	push(frame: RendererVideoFrame, closeFrame: (frame: RendererVideoFrame) => void): void {
		assert.ok(frame);
		assert.equal(typeof closeFrame, 'function');
		if (this.count >= MAX_GENERATOR_PENDING_VIDEO_FRAMES) {
			const dropped = this.frames[this.head];
			this.frames[this.head] = null;
			this.head = (this.head + 1) % MAX_GENERATOR_PENDING_VIDEO_FRAMES;
			this.count -= 1;
			if (dropped) closeFrame(dropped);
		}
		this.frames[this.tail] = frame;
		this.tail = (this.tail + 1) % MAX_GENERATOR_PENDING_VIDEO_FRAMES;
		this.count += 1;
		assert.ok(this.count <= MAX_GENERATOR_PENDING_VIDEO_FRAMES, 'inbound video queue exceeded its cap');
	}

	pop(): RendererVideoFrame | null {
		if (this.count === 0) return null;
		const frame = this.frames[this.head];
		this.frames[this.head] = null;
		this.head = (this.head + 1) % MAX_GENERATOR_PENDING_VIDEO_FRAMES;
		this.count -= 1;
		assert.ok(this.count >= 0, 'inbound video queue count underflowed');
		return frame;
	}

	drain(closeFrame: (frame: RendererVideoFrame) => void): void {
		assert.equal(typeof closeFrame, 'function');
		let frame = this.pop();
		while (frame) {
			closeFrame(frame);
			frame = this.pop();
		}
	}
}

function isValidInboundFrame(frame: InboundVideoFrameInput): boolean {
	if (!Number.isSafeInteger(frame.width) || frame.width <= 0 || frame.width % 2 !== 0) return false;
	if (!Number.isSafeInteger(frame.height) || frame.height <= 0 || frame.height % 2 !== 0) return false;
	if (!(frame.data instanceof ArrayBuffer)) return false;
	return frame.data.byteLength >= tightI420ByteLength(frame.width, frame.height);
}

export function createInboundVideoBridge(diagnosticKey: string): InboundVideoBridgeHandle | null {
	const Generator = getGeneratorVideoCtor();
	const VideoFrameImpl = getVideoFrameCtor();
	if (!Generator || !VideoFrameImpl) {
		logger.warn('MediaStreamTrackGenerator path unavailable for inbound native video', {diagnosticKey});
		return null;
	}
	const generator = new Generator({kind: 'video'});
	const writer = generator.writable.getWriter();
	const stream = new MediaStream([generator]);
	let cleanedUp = false;
	let activeWrite: Promise<void> | null = null;
	const pendingFrames = new InboundVideoFrameRing();
	let disposeFailureCount = 0;
	const noteDisposeFailure = (operation: string, error: unknown): void => {
		disposeFailureCount = Math.min(disposeFailureCount + 1, DISPOSE_FAILURE_COUNT_MAX);
		const shouldLog = disposeFailureCount === 1 || disposeFailureCount % DISPOSE_FAILURE_LOG_INTERVAL === 0;
		if (shouldLog) {
			logger.debug('Inbound video bridge disposal failed', {
				diagnosticKey,
				operation,
				failureCount: disposeFailureCount,
				error,
			});
		}
	};
	const closeFrame = (frame: RendererVideoFrame): void => {
		try {
			frame.close();
		} catch (error) {
			noteDisposeFailure('frame.close', error);
		}
	};
	let cachedFrameInit: VideoFrameInit | null = null;
	const getFrameInit = (width: number, height: number, timestamp: number): VideoFrameInit => {
		if (!cachedFrameInit || cachedFrameInit.codedWidth !== width || cachedFrameInit.codedHeight !== height) {
			cachedFrameInit = {
				format: 'I420',
				codedWidth: width,
				codedHeight: height,
				displayWidth: width,
				displayHeight: height,
				timestamp,
				layout: i420VideoFrameLayout(width, height),
			};
		}
		cachedFrameInit.timestamp = timestamp;
		return cachedFrameInit;
	};
	const pumpPendingFrames = (): void => {
		if (cleanedUp || activeWrite || pendingFrames.length === 0) return;
		const videoFrame = pendingFrames.pop();
		if (!videoFrame) return;
		try {
			activeWrite = writer
				.write(videoFrame)
				.catch((error) => {
					logger.warn('Failed to write inbound video frame to generator', {diagnosticKey, error});
				})
				.finally(() => {
					closeFrame(videoFrame);
					activeWrite = null;
					pumpPendingFrames();
				});
		} catch (error) {
			logger.warn('Failed to write inbound video frame to generator', {diagnosticKey, error});
			closeFrame(videoFrame);
			activeWrite = null;
			pumpPendingFrames();
		}
	};
	const enqueueVideoFrame = (videoFrame: RendererVideoFrame): void => {
		if (cleanedUp) {
			closeFrame(videoFrame);
			return;
		}
		pendingFrames.push(videoFrame, closeFrame);
		pumpPendingFrames();
	};
	const buildVideoFrame = (frame: InboundVideoFrameInput): RendererVideoFrame | null => {
		try {
			const view = new Uint8Array(frame.data);
			const timestamp = Math.max(0, Math.round(frame.timestampUs));
			return new VideoFrameImpl(view, getFrameInit(frame.width, frame.height, timestamp));
		} catch (error) {
			logger.warn('Failed to construct inbound I420 VideoFrame', {diagnosticKey, error});
			return null;
		}
	};
	const pushFrame = (frame: InboundVideoFrameInput): void => {
		if (cleanedUp) return;
		if (!isValidInboundFrame(frame)) {
			logger.debug('Dropping invalid inbound video frame', {
				diagnosticKey,
				width: frame.width,
				height: frame.height,
				byteLength: frame.data?.byteLength,
			});
			return;
		}
		const videoFrame = buildVideoFrame(frame);
		if (videoFrame) {
			enqueueVideoFrame(videoFrame);
		}
	};
	const cleanup = async (): Promise<void> => {
		if (cleanedUp) return;
		cleanedUp = true;
		pendingFrames.drain(closeFrame);
		if (activeWrite) {
			await activeWrite;
		}
		try {
			await writer.close();
		} catch (error) {
			noteDisposeFailure('writer.close', error);
		}
		try {
			generator.stop();
		} catch (error) {
			noteDisposeFailure('generator.stop', error);
		}
	};
	return {track: generator, stream, pushFrame, cleanup};
}
