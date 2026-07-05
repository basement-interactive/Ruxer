// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import type {InitOutput} from '@pkgs/libfluxcore/libfluxcore';
import initLibfluxcore, * as wasm from '@pkgs/libfluxcore/libfluxcore';

const logger = new Logger('libfluxcore');
const MAX_RETAINED_LIBFLUXCORE_WASM_MEMORY_BYTES = 64 * 1024 * 1024;

let modulePromise: Promise<void> | null = null;
let moduleReady = false;
let moduleExports: InitOutput | null = null;
let activeZstdStreamHandles = 0;

export interface RgbaTransformResult {
	rgba: Uint8Array;
	width: number;
	height: number;
}

export interface DecodedFrame {
	rgba: Uint8Array;
	width: number;
	height: number;
	delayMs: number;
}

export interface EncodedApngFrame {
	compressed: Uint8Array;
	width: number;
	height: number;
	delayMs: number;
}

export interface EncodedGifChunk {
	data: Uint8Array;
	width: number;
	height: number;
}

async function loadModule(): Promise<void> {
	if (!modulePromise) {
		modulePromise = (async () => {
			try {
				if (typeof initLibfluxcore === 'function') {
					moduleExports = await initLibfluxcore();
				}
				moduleReady = true;
			} catch (err) {
				moduleExports = null;
				moduleReady = false;
				modulePromise = null;
				logger.warn('Failed to load wasm module', err);
				throw err;
			}
		})();
	}
	await modulePromise;
}

export function isLibfluxcoreReady(): boolean {
	return moduleReady;
}

export async function ensureLibfluxcoreReady(): Promise<void> {
	await loadModule();
}

export function releaseLibfluxcoreMemoryIfIdle(): void {
	if (activeZstdStreamHandles > 0) return;
	if ((moduleExports?.memory.buffer.byteLength ?? 0) <= MAX_RETAINED_LIBFLUXCORE_WASM_MEMORY_BYTES) return;
	wasm.__resetLibfluxcoreWasmForMemoryPressure();
	modulePromise = null;
	moduleReady = false;
	moduleExports = null;
}

export async function detectAnimatedImage(data: Uint8Array): Promise<boolean> {
	await loadModule();
	try {
		const result = wasm.is_animated_image(data);
		return Boolean(result);
	} finally {
		releaseLibfluxcoreMemoryIfIdle();
	}
}

export function cropAndRotateGif(
	gif: Uint8Array,
	x: number,
	y: number,
	width: number,
	height: number,
	rotation: number,
	resizeWidth: number | null,
	resizeHeight: number | null,
): Uint8Array {
	try {
		const result = wasm.crop_and_rotate_gif(gif, x, y, width, height, rotation, resizeWidth, resizeHeight);
		return result instanceof Uint8Array ? result : new Uint8Array(result);
	} finally {
		releaseLibfluxcoreMemoryIfIdle();
	}
}

export function cropAndRotateImage(
	image: Uint8Array,
	format: string,
	x: number,
	y: number,
	width: number,
	height: number,
	rotation: number,
	resizeWidth: number | null,
	resizeHeight: number | null,
): Uint8Array {
	try {
		const result = wasm.crop_and_rotate_image(image, format, x, y, width, height, rotation, resizeWidth, resizeHeight);
		return result instanceof Uint8Array ? result : new Uint8Array(result);
	} finally {
		releaseLibfluxcoreMemoryIfIdle();
	}
}

export function cropRotateRgba(
	rgba: Uint8Array,
	width: number,
	height: number,
	x: number,
	y: number,
	cropWidth: number,
	cropHeight: number,
	rotation: number,
	resizeWidth: number | null,
	resizeHeight: number | null,
): RgbaTransformResult {
	const result = wasm.crop_rotate_rgba(
		rgba,
		width,
		height,
		x,
		y,
		cropWidth,
		cropHeight,
		rotation,
		resizeWidth,
		resizeHeight,
	);
	return {
		rgba: result.rgba instanceof Uint8Array ? result.rgba : new Uint8Array(result.rgba),
		width: result.width,
		height: result.height,
	};
}

export function decodeGifFrames(input: Uint8Array): Array<DecodedFrame> {
	return wasm.decode_gif_frames(input);
}

export function decodeApngFrames(input: Uint8Array): Array<DecodedFrame> {
	return wasm.decode_apng_frames(input);
}

export function encodeGifFrames(frames: Array<DecodedFrame>): Uint8Array {
	const result = wasm.encode_gif_frames(frames);
	return result instanceof Uint8Array ? result : new Uint8Array(result);
}

export function encodeApngFrames(frames: Array<DecodedFrame>): Uint8Array {
	const result = wasm.encode_apng_frames(frames);
	return result instanceof Uint8Array ? result : new Uint8Array(result);
}

export function encodeGifFrameChunk(frame: DecodedFrame, first: boolean): EncodedGifChunk {
	const result = wasm.encode_gif_frame_chunk(frame, first);
	return {
		data: result.data instanceof Uint8Array ? result.data : new Uint8Array(result.data),
		width: result.width,
		height: result.height,
	};
}

export function assembleGifFrameChunks(chunks: Array<EncodedGifChunk>): Uint8Array {
	const result = wasm.assemble_gif_frame_chunks(chunks);
	return result instanceof Uint8Array ? result : new Uint8Array(result);
}

export function encodeApngFramePayload(frame: DecodedFrame): EncodedApngFrame {
	const result = wasm.encode_apng_frame_payload(frame);
	return {
		compressed: result.compressed instanceof Uint8Array ? result.compressed : new Uint8Array(result.compressed),
		width: result.width,
		height: result.height,
		delayMs: result.delayMs,
	};
}

export function assembleApngFrames(frames: Array<EncodedApngFrame>): Uint8Array {
	const result = wasm.assemble_apng_frames(frames);
	return result instanceof Uint8Array ? result : new Uint8Array(result);
}

export async function cropAndRotateApng(
	apng: Uint8Array,
	x: number,
	y: number,
	width: number,
	height: number,
	rotation: number,
	resizeWidth: number | null,
	resizeHeight: number | null,
): Promise<Uint8Array> {
	await loadModule();
	try {
		const result = wasm.crop_and_rotate_apng(apng, x, y, width, height, rotation, resizeWidth, resizeHeight);
		return result instanceof Uint8Array ? result : new Uint8Array(result);
	} finally {
		releaseLibfluxcoreMemoryIfIdle();
	}
}

export async function decompressZstdFrame(input: Uint8Array): Promise<Uint8Array | null> {
	await loadModule();
	try {
		const result = wasm.decompress_zstd_frame(input);
		return result instanceof Uint8Array ? result : new Uint8Array(result);
	} finally {
		releaseLibfluxcoreMemoryIfIdle();
	}
}

export async function createZstdStreamDecoder(): Promise<number> {
	await loadModule();
	const decoder = wasm.create_zstd_stream_decoder();
	activeZstdStreamHandles++;
	return decoder;
}

export async function decompressZstdStreamChunk(decoder: number, input: Uint8Array): Promise<Uint8Array> {
	await loadModule();
	const result = wasm.decompress_zstd_stream_chunk(decoder, input);
	return result instanceof Uint8Array ? result : new Uint8Array(result);
}

export function freeZstdStreamDecoder(decoder: number): void {
	try {
		wasm.free_zstd_stream_decoder(decoder);
	} finally {
		activeZstdStreamHandles = Math.max(0, activeZstdStreamHandles - 1);
		releaseLibfluxcoreMemoryIfIdle();
	}
}

export async function createZstdStreamEncoder(level: number): Promise<number> {
	await loadModule();
	const encoder = wasm.create_zstd_stream_encoder(level);
	activeZstdStreamHandles++;
	return encoder;
}

export function createZstdStreamEncoderSync(level: number): number {
	const encoder = wasm.create_zstd_stream_encoder(level);
	activeZstdStreamHandles++;
	return encoder;
}

export function compressZstdStreamChunk(encoder: number, input: Uint8Array): Uint8Array {
	const result = wasm.compress_zstd_stream_chunk(encoder, input);
	return result instanceof Uint8Array ? result : new Uint8Array(result);
}

export function freeZstdStreamEncoder(encoder: number): void {
	try {
		wasm.free_zstd_stream_encoder(encoder);
	} finally {
		activeZstdStreamHandles = Math.max(0, activeZstdStreamHandles - 1);
		releaseLibfluxcoreMemoryIfIdle();
	}
}
