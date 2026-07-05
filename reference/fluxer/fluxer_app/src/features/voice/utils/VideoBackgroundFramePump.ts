// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {getBackgroundImageURL} from '@app/features/theme/utils/BackgroundImageDB';
import type {VoiceEngineV2BridgeProcessedCameraFrame} from '@fluxer/voice_engine_v2/bridge';

const logger = new Logger('VideoBackgroundFramePump');

export const VIDEO_BACKGROUND_PUMP_FPS_MAX = 24;
export const VIDEO_BACKGROUND_PUMP_DIMENSION_MIN = 2;
export const VIDEO_BACKGROUND_PUMP_IN_FLIGHT_FRAMES_MAX = 2;
export const VIDEO_BACKGROUND_PUMP_WEBCODECS_FAILURES_MAX = 3;
const VIDEO_BACKGROUND_PUMP_FALLBACK_INTERVAL_MS = Math.ceil(1000 / VIDEO_BACKGROUND_PUMP_FPS_MAX);
const RGBA_BYTES_PER_PIXEL = 4;
const VIDEO_READY_STATE_HAS_CURRENT_DATA = 2;

const BT601_Y_R = 66;
const BT601_Y_G = 129;
const BT601_Y_B = 25;
const BT601_U_R = -38;
const BT601_U_G = -74;
const BT601_U_B = 112;
const BT601_V_R = 112;
const BT601_V_G = -94;
const BT601_V_B = -18;
const BT601_FIXED_POINT_ROUNDING = 128;
const BT601_FIXED_POINT_SHIFT = 8;
const BT601_Y_OFFSET = 16;
const BT601_CHROMA_OFFSET = 128;

export interface VideoBackgroundFrameBridge {
	pushCameraBackgroundFrame(frame: VoiceEngineV2BridgeProcessedCameraFrame): Promise<boolean>;
	clearCameraBackgroundFrame(): Promise<void>;
}

export interface VideoBackgroundCaptureDimensions {
	width: number;
	height: number;
}

export interface VideoBackgroundFramePumpHooks {
	resolveBackgroundUrl: (backgroundId: string) => Promise<string | null>;
	createVideoElement: () => HTMLVideoElement;
	createCanvasContext: (width: number, height: number) => CanvasRenderingContext2D | null;
	revokeObjectUrl: (url: string) => void;
	now: () => number;
}

export function createDefaultVideoBackgroundFramePumpHooks(): VideoBackgroundFramePumpHooks {
	return {
		resolveBackgroundUrl: (backgroundId) => getBackgroundImageURL(backgroundId),
		createVideoElement: () => document.createElement('video'),
		createCanvasContext: (width, height) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			return canvas.getContext('2d', {willReadFrequently: true});
		},
		revokeObjectUrl: (url) => URL.revokeObjectURL(url),
		now: () => Date.now(),
	};
}

export function floorToEvenDimension(value: number): number {
	assert.ok(Number.isFinite(value), 'video background dimension must be finite');
	const floored = Math.max(VIDEO_BACKGROUND_PUMP_DIMENSION_MIN, Math.floor(value));
	return floored - (floored % 2);
}

export function shouldEmitVideoBackgroundFrame(nowMs: number, lastEmitMs: number | null, fpsMax: number): boolean {
	assert.ok(Number.isFinite(nowMs), 'video background frame clock must be finite');
	assert.ok(fpsMax > 0, 'video background frame fps cap must be positive');
	if (lastEmitMs === null) return true;
	return nowMs - lastEmitMs >= 1000 / fpsMax;
}

function clampByte(value: number): number {
	return value < 0 ? 0 : value > 255 ? 255 : value;
}

function packChromaPlanes(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, i420: Uint8Array): void {
	const chromaWidth = width / 2;
	const uPlaneOffset = width * height;
	const vPlaneOffset = uPlaneOffset + chromaWidth * (height / 2);
	for (let blockY = 0; blockY < height / 2; blockY++) {
		for (let blockX = 0; blockX < chromaWidth; blockX++) {
			let rSum = 0;
			let gSum = 0;
			let bSum = 0;
			for (let dy = 0; dy < 2; dy++) {
				for (let dx = 0; dx < 2; dx++) {
					const offset = ((blockY * 2 + dy) * width + blockX * 2 + dx) * RGBA_BYTES_PER_PIXEL;
					rSum += rgba[offset];
					gSum += rgba[offset + 1];
					bSum += rgba[offset + 2];
				}
			}
			const r = rSum >> 2;
			const g = gSum >> 2;
			const b = bSum >> 2;
			const chromaIndex = blockY * chromaWidth + blockX;
			i420[uPlaneOffset + chromaIndex] = clampByte(
				((BT601_U_R * r + BT601_U_G * g + BT601_U_B * b + BT601_FIXED_POINT_ROUNDING) >> BT601_FIXED_POINT_SHIFT) +
					BT601_CHROMA_OFFSET,
			);
			i420[vPlaneOffset + chromaIndex] = clampByte(
				((BT601_V_R * r + BT601_V_G * g + BT601_V_B * b + BT601_FIXED_POINT_ROUNDING) >> BT601_FIXED_POINT_SHIFT) +
					BT601_CHROMA_OFFSET,
			);
		}
	}
}

function i420FrameByteLength(width: number, height: number): number {
	assert.equal(width % 2, 0, 'i420 width must be even');
	assert.equal(height % 2, 0, 'i420 height must be even');
	return width * height + (width / 2) * (height / 2) * 2;
}

export function rgbaToI420Bt601Into(
	rgba: Uint8Array | Uint8ClampedArray,
	width: number,
	height: number,
	i420: Uint8Array,
): void {
	assert.ok(width >= VIDEO_BACKGROUND_PUMP_DIMENSION_MIN, 'rgba to i420 width must be at least 2');
	assert.ok(height >= VIDEO_BACKGROUND_PUMP_DIMENSION_MIN, 'rgba to i420 height must be at least 2');
	assert.equal(width % 2, 0, 'rgba to i420 width must be even');
	assert.equal(height % 2, 0, 'rgba to i420 height must be even');
	assert.equal(rgba.length, width * height * RGBA_BYTES_PER_PIXEL, 'rgba buffer must match dimensions');
	assert.equal(i420.length, i420FrameByteLength(width, height), 'i420 buffer must match dimensions');
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const offset = (y * width + x) * RGBA_BYTES_PER_PIXEL;
			const r = rgba[offset];
			const g = rgba[offset + 1];
			const b = rgba[offset + 2];
			i420[y * width + x] = clampByte(
				((BT601_Y_R * r + BT601_Y_G * g + BT601_Y_B * b + BT601_FIXED_POINT_ROUNDING) >> BT601_FIXED_POINT_SHIFT) +
					BT601_Y_OFFSET,
			);
		}
	}
	packChromaPlanes(rgba, width, height, i420);
}

export function rgbaToI420Bt601(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
	const i420 = new Uint8Array(i420FrameByteLength(width, height));
	rgbaToI420Bt601Into(rgba, width, height, i420);
	return i420;
}

interface VideoBackgroundI420Buffer {
	data: Uint8Array;
	inUse: boolean;
}

interface VideoBackgroundPumpSession {
	backgroundId: string;
	generation: number;
	video: HTMLVideoElement;
	objectUrl: string;
	context: CanvasRenderingContext2D | null;
	contextWidth: number;
	contextHeight: number;
	frameCallbackId: number | null;
	timeoutId: NodeJS.Timeout | null;
	lastEmitMs: number | null;
	i420Buffers: Array<VideoBackgroundI420Buffer>;
	i420BufferWidth: number;
	i420BufferHeight: number;
	poolExhaustedWarned: boolean;
	webCodecsI420Unavailable: boolean;
	webCodecsI420ConsecutiveFailures: number;
}

interface I420VideoFrame {
	copyTo?: (destination: Uint8Array, options: {format: 'I420'}) => Promise<unknown>;
	close: () => void;
}

interface I420VideoFrameConstructor {
	new (source: CanvasImageSource, init: {timestamp: number}): I420VideoFrame;
}

interface ResolvedVideoFrameTime {
	nowMs: number;
	timestampUs: number;
}

function getI420VideoFrameConstructor(): I420VideoFrameConstructor | null {
	const videoFrameConstructor = (
		window as typeof window & {
			VideoFrame?: I420VideoFrameConstructor;
		}
	).VideoFrame;
	return videoFrameConstructor ?? null;
}

function finiteNonNegative(value: number | undefined): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function resolveVideoFrameTime(
	metadata: VideoFrameCallbackMetadata | null,
	fallbackNowMs: number,
): ResolvedVideoFrameTime {
	assert.ok(Number.isFinite(fallbackNowMs), 'video background fallback clock must be finite');
	const frameNowMs = finiteNonNegative(metadata?.presentationTime)
		? metadata.presentationTime
		: finiteNonNegative(metadata?.expectedDisplayTime)
			? metadata.expectedDisplayTime
			: fallbackNowMs;
	const timestampUs = Math.max(1, Math.round(frameNowMs * 1000));
	return {nowMs: frameNowMs, timestampUs};
}

export class VideoBackgroundFramePump {
	private readonly bridge: VideoBackgroundFrameBridge;
	private readonly getCaptureDimensions: () => VideoBackgroundCaptureDimensions;
	private readonly hooks: VideoBackgroundFramePumpHooks;
	private session: VideoBackgroundPumpSession | null = null;
	private generation = 0;

	constructor(options: {
		bridge: VideoBackgroundFrameBridge;
		getCaptureDimensions: () => VideoBackgroundCaptureDimensions;
		hooks?: VideoBackgroundFramePumpHooks;
	}) {
		this.bridge = options.bridge;
		this.getCaptureDimensions = options.getCaptureDimensions;
		this.hooks = options.hooks ?? createDefaultVideoBackgroundFramePumpHooks();
	}

	isRunning(): boolean {
		return this.session !== null;
	}

	getRunningBackgroundId(): string | null {
		return this.session?.backgroundId ?? null;
	}

	async start(backgroundId: string): Promise<boolean> {
		assert.ok(backgroundId.length > 0, 'video background pump requires a background id');
		if (this.session?.backgroundId === backgroundId) return true;
		if (this.session) {
			await this.stop();
		}
		const generation = ++this.generation;
		const objectUrl = await this.hooks.resolveBackgroundUrl(backgroundId);
		if (!objectUrl) {
			logger.warn('Video background media is unavailable for pumping', {backgroundId});
			return false;
		}
		if (generation !== this.generation) {
			this.hooks.revokeObjectUrl(objectUrl);
			return false;
		}
		const video = this.hooks.createVideoElement();
		video.muted = true;
		video.loop = true;
		video.playsInline = true;
		video.src = objectUrl;
		this.session = {
			backgroundId,
			generation,
			video,
			objectUrl,
			context: null,
			contextWidth: 0,
			contextHeight: 0,
			frameCallbackId: null,
			timeoutId: null,
			lastEmitMs: null,
			i420Buffers: [],
			i420BufferWidth: 0,
			i420BufferHeight: 0,
			poolExhaustedWarned: false,
			webCodecsI420Unavailable: false,
			webCodecsI420ConsecutiveFailures: 0,
		};
		const playResult = video.play();
		if (playResult && typeof playResult.catch === 'function') {
			playResult.catch((error) => {
				logger.warn('Video background playback failed to start', {backgroundId, error});
			});
		}
		this.scheduleNextFrame(generation);
		return true;
	}

	async stop(): Promise<void> {
		const session = this.session;
		this.generation++;
		this.session = null;
		if (!session) return;
		this.clearScheduledFrame(session);
		session.video.pause();
		session.video.removeAttribute('src');
		this.hooks.revokeObjectUrl(session.objectUrl);
		try {
			await this.bridge.clearCameraBackgroundFrame();
		} catch (error) {
			logger.warn('Failed to clear native camera background frame on pump stop', {error});
		}
	}

	private clearScheduledFrame(session: VideoBackgroundPumpSession): void {
		if (session.frameCallbackId !== null && typeof session.video.cancelVideoFrameCallback === 'function') {
			session.video.cancelVideoFrameCallback(session.frameCallbackId);
		}
		if (session.timeoutId !== null) {
			clearTimeout(session.timeoutId);
		}
		session.frameCallbackId = null;
		session.timeoutId = null;
	}

	private scheduleNextFrame(generation: number): void {
		const session = this.session;
		if (!session || session.generation !== generation) return;
		if (typeof session.video.requestVideoFrameCallback === 'function') {
			const frameCallbackId = session.video.requestVideoFrameCallback((_now, metadata) => {
				session.frameCallbackId = null;
				if (session.timeoutId !== null) {
					clearTimeout(session.timeoutId);
					session.timeoutId = null;
				}
				this.pumpFrame(generation, metadata);
			});
			session.frameCallbackId = frameCallbackId;
		}
		session.timeoutId = setTimeout(() => {
			session.timeoutId = null;
			if (session.frameCallbackId !== null && typeof session.video.cancelVideoFrameCallback === 'function') {
				session.video.cancelVideoFrameCallback(session.frameCallbackId);
				session.frameCallbackId = null;
			}
			this.pumpFrame(generation, null);
		}, VIDEO_BACKGROUND_PUMP_FALLBACK_INTERVAL_MS);
	}

	private resolveSessionContext(session: VideoBackgroundPumpSession): CanvasRenderingContext2D | null {
		const dimensions = this.getCaptureDimensions();
		const width = floorToEvenDimension(dimensions.width);
		const height = floorToEvenDimension(dimensions.height);
		if (session.context && session.contextWidth === width && session.contextHeight === height) {
			return session.context;
		}
		session.context = this.hooks.createCanvasContext(width, height);
		session.contextWidth = width;
		session.contextHeight = height;
		session.i420Buffers = this.createI420BufferPool(width, height);
		session.i420BufferWidth = width;
		session.i420BufferHeight = height;
		session.poolExhaustedWarned = false;
		session.webCodecsI420Unavailable = false;
		session.webCodecsI420ConsecutiveFailures = 0;
		return session.context;
	}

	private createI420BufferPool(width: number, height: number): Array<VideoBackgroundI420Buffer> {
		const byteLength = i420FrameByteLength(width, height);
		const buffers: Array<VideoBackgroundI420Buffer> = [];
		for (let i = 0; i < VIDEO_BACKGROUND_PUMP_IN_FLIGHT_FRAMES_MAX; i += 1) {
			buffers.push({data: new Uint8Array(byteLength), inUse: false});
		}
		return buffers;
	}

	private acquireI420Buffer(session: VideoBackgroundPumpSession): VideoBackgroundI420Buffer | null {
		assert.equal(session.i420BufferWidth, session.contextWidth, 'i420 pool width must match capture width');
		assert.equal(session.i420BufferHeight, session.contextHeight, 'i420 pool height must match capture height');
		for (const buffer of session.i420Buffers) {
			if (!buffer.inUse) {
				buffer.inUse = true;
				return buffer;
			}
		}
		if (!session.poolExhaustedWarned) {
			session.poolExhaustedWarned = true;
			logger.warn('Video background pump skipped a frame because the bounded native push pool is exhausted', {
				inFlightFramesMax: VIDEO_BACKGROUND_PUMP_IN_FLIGHT_FRAMES_MAX,
			});
		}
		return null;
	}

	private releaseI420Buffer(buffer: VideoBackgroundI420Buffer): void {
		assert.ok(buffer.inUse, 'released video background buffer must be in use');
		buffer.inUse = false;
	}

	private async copyCanvasToI420WithWebCodecs(
		session: VideoBackgroundPumpSession,
		i420Buffer: VideoBackgroundI420Buffer,
		timestampUs: number,
	): Promise<boolean> {
		if (session.webCodecsI420Unavailable) return false;
		const VideoFrameImpl = getI420VideoFrameConstructor();
		if (!VideoFrameImpl) {
			session.webCodecsI420Unavailable = true;
			return false;
		}
		let frame: I420VideoFrame | null = null;
		try {
			assert.ok(session.context !== null, 'video background WebCodecs context must exist');
			frame = new VideoFrameImpl(session.context.canvas, {timestamp: timestampUs});
			if (typeof frame.copyTo !== 'function') {
				session.webCodecsI420Unavailable = true;
				return false;
			}
			await frame.copyTo(i420Buffer.data, {format: 'I420'});
			session.webCodecsI420ConsecutiveFailures = 0;
			return true;
		} catch (error) {
			session.webCodecsI420ConsecutiveFailures += 1;
			assert.ok(session.webCodecsI420ConsecutiveFailures > 0, 'webcodecs failure count must be positive');
			if (session.webCodecsI420ConsecutiveFailures >= VIDEO_BACKGROUND_PUMP_WEBCODECS_FAILURES_MAX) {
				session.webCodecsI420Unavailable = true;
			}
			logger.debug('Video background WebCodecs I420 copy failed; falling back to canvas readback', {
				error,
				consecutiveFailures: session.webCodecsI420ConsecutiveFailures,
				latched: session.webCodecsI420Unavailable,
			});
			return false;
		} finally {
			frame?.close();
		}
	}

	private copyCanvasToI420WithReadback(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
		i420Buffer: VideoBackgroundI420Buffer,
	): void {
		const imageData = context.getImageData(0, 0, width, height);
		rgbaToI420Bt601Into(imageData.data, width, height, i420Buffer.data);
	}

	private async captureAndPushFrame(
		session: VideoBackgroundPumpSession,
		i420Buffer: VideoBackgroundI420Buffer,
		frameTime: ResolvedVideoFrameTime,
	): Promise<void> {
		const context = session.context;
		assert.ok(context !== null, 'video background capture context must exist');
		const width = session.contextWidth;
		const height = session.contextHeight;
		const timestampUs = frameTime.timestampUs;
		try {
			context.drawImage(session.video, 0, 0, width, height);
			const copiedWithWebCodecs = await this.copyCanvasToI420WithWebCodecs(session, i420Buffer, timestampUs);
			if (!copiedWithWebCodecs) {
				this.copyCanvasToI420WithReadback(context, width, height, i420Buffer);
			}
			session.lastEmitMs = frameTime.nowMs;
			await this.bridge.pushCameraBackgroundFrame({
				format: 'i420',
				width,
				height,
				timestampUs,
				data: i420Buffer.data,
			});
		} catch (error) {
			logger.warn('Failed to capture video background frame', {error});
		} finally {
			this.releaseI420Buffer(i420Buffer);
		}
	}

	private pumpFrame(generation: number, metadata: VideoFrameCallbackMetadata | null = null): void {
		const session = this.session;
		if (!session || session.generation !== generation) return;
		if (session.video.readyState < VIDEO_READY_STATE_HAS_CURRENT_DATA) {
			this.scheduleNextFrame(generation);
			return;
		}
		const frameTime = resolveVideoFrameTime(metadata, this.hooks.now());
		if (!shouldEmitVideoBackgroundFrame(frameTime.nowMs, session.lastEmitMs, VIDEO_BACKGROUND_PUMP_FPS_MAX)) {
			this.scheduleNextFrame(generation);
			return;
		}
		const context = this.resolveSessionContext(session);
		if (!context) {
			logger.warn('Video background pump canvas context is unavailable; stopping pump');
			void this.stop();
			return;
		}
		const i420Buffer = this.acquireI420Buffer(session);
		if (!i420Buffer) {
			this.scheduleNextFrame(generation);
			return;
		}
		void this.captureAndPushFrame(session, i420Buffer, frameTime);
		this.scheduleNextFrame(generation);
	}
}
