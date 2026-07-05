// SPDX-License-Identifier: AGPL-3.0-or-later

import {resolveWorkerAssetUrl} from '@app/features/platform/utils/WorkerAssetUrl';
import type {InitOutput} from '@pkgs/libfluxcore/libfluxcore';
import initLibfluxcore, * as wasm from '@pkgs/libfluxcore/libfluxcore';
import libfluxcoreWasmUrl from '@pkgs/libfluxcore/libfluxcore_bg.wasm';

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

let modulePromise: Promise<void> | null = null;
let moduleReady = false;
let moduleExports: InitOutput | null = null;
const MAX_RETAINED_LIBFLUXCORE_WASM_MEMORY_BYTES = 64 * 1024 * 1024;

async function loadModule(): Promise<void> {
	if (!modulePromise) {
		const wasmUrl = resolveWorkerAssetUrl(libfluxcoreWasmUrl);
		modulePromise = initLibfluxcore(wasmUrl)
			.then((exports) => {
				moduleExports = exports;
				moduleReady = true;
			})
			.catch((error) => {
				modulePromise = null;
				moduleExports = null;
				moduleReady = false;
				throw error;
			});
	}
	await modulePromise;
}

function assertModuleReady(): void {
	if (!moduleReady) {
		throw new Error('WASM module not loaded. Call ensureLibfluxcoreReady() first.');
	}
}

function normalizeResult(result: Uint8Array | ArrayBuffer): Uint8Array {
	return result instanceof Uint8Array ? result : new Uint8Array(result);
}

export async function ensureLibfluxcoreReady(): Promise<void> {
	await loadModule();
}

export function releaseLibfluxcoreMemoryIfIdle(): void {
	if ((moduleExports?.memory.buffer.byteLength ?? 0) <= MAX_RETAINED_LIBFLUXCORE_WASM_MEMORY_BYTES) return;
	wasm.__resetLibfluxcoreWasmForMemoryPressure();
	modulePromise = null;
	moduleReady = false;
	moduleExports = null;
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
	assertModuleReady();
	return normalizeResult(wasm.crop_and_rotate_gif(gif, x, y, width, height, rotation, resizeWidth, resizeHeight));
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
	return normalizeResult(wasm.crop_and_rotate_apng(apng, x, y, width, height, rotation, resizeWidth, resizeHeight));
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
	assertModuleReady();
	return normalizeResult(
		wasm.crop_and_rotate_image(image, format, x, y, width, height, rotation, resizeWidth, resizeHeight),
	);
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
	assertModuleReady();
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
	assertModuleReady();
	return wasm.decode_gif_frames(input);
}

export function decodeApngFrames(input: Uint8Array): Array<DecodedFrame> {
	assertModuleReady();
	return wasm.decode_apng_frames(input);
}

export function encodeGifFrames(frames: Array<DecodedFrame>): Uint8Array {
	assertModuleReady();
	return normalizeResult(wasm.encode_gif_frames(frames));
}

export function encodeApngFrames(frames: Array<DecodedFrame>): Uint8Array {
	assertModuleReady();
	return normalizeResult(wasm.encode_apng_frames(frames));
}

export function encodeGifFrameChunk(frame: DecodedFrame, first: boolean): EncodedGifChunk {
	assertModuleReady();
	const result = wasm.encode_gif_frame_chunk(frame, first);
	return {
		data: result.data instanceof Uint8Array ? result.data : new Uint8Array(result.data),
		width: result.width,
		height: result.height,
	};
}

export function assembleGifFrameChunks(chunks: Array<EncodedGifChunk>): Uint8Array {
	assertModuleReady();
	return normalizeResult(wasm.assemble_gif_frame_chunks(chunks));
}

export function encodeApngFramePayload(frame: DecodedFrame): EncodedApngFrame {
	assertModuleReady();
	const result = wasm.encode_apng_frame_payload(frame);
	return {
		compressed: result.compressed instanceof Uint8Array ? result.compressed : new Uint8Array(result.compressed),
		width: result.width,
		height: result.height,
		delayMs: result.delayMs,
	};
}

export function assembleApngFrames(frames: Array<EncodedApngFrame>): Uint8Array {
	assertModuleReady();
	return normalizeResult(wasm.assemble_apng_frames(frames));
}

export async function detectAnimatedImage(data: Uint8Array): Promise<boolean> {
	await loadModule();
	return Boolean(wasm.is_animated_image(data));
}
