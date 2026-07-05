// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	type CropAnimatedImageCompleteMessage,
	type CropAnimatedImageErrorMessage,
	CropAnimatedImageMessageType,
	type CropAnimatedImageStartMessage,
	type CropOutputFormat,
	type CropParams,
	type CropWorkerErrorCode,
	type CropWorkerImageFormat,
	type CropWorkerIncomingMessage,
	type DecodedFrameInput,
	type EncodedApngFrameInput,
	type EncodedGifChunkInput,
	type ProcessBatchCompleteMessage,
	type ProcessBatchMessage,
} from '@app/features/expressions/workers/AnimatedImageCropMessages';
import {
	assembleApngFrames,
	assembleGifFrameChunks,
	cropAndRotateImage,
	cropRotateRgba,
	decodeApngFrames,
	decodeGifFrames,
	detectAnimatedImage,
	encodeApngFramePayload,
	encodeApngFrames,
	encodeGifFrameChunk,
	encodeGifFrames,
	ensureLibfluxcoreReady,
	releaseLibfluxcoreMemoryIfIdle,
} from '@app/features/platform/workers/LibFluxcoreWorker';

type StaticImageFormat = Exclude<CropWorkerImageFormat, 'gif'>;

const NESTED_WORKER_IDLE_MS = 30000;

function getStaticFormatHint(format: StaticImageFormat | CropOutputFormat): string {
	switch (format) {
		case 'apng':
		case 'png':
		case 'animated_webp':
			return 'png';
		case 'jpeg':
			return 'jpeg';
		case 'gif':
			return 'gif';
		case 'webp':
			return 'webp';
		case 'avif':
			return 'avif';
	}
}

const logger = {
	error: (...args: Array<unknown>) => {
		if (typeof console !== 'undefined') {
			console.error('[AnimatedImageCrop Worker]', ...args);
		}
	},
};
declare const self: DedicatedWorkerGlobalScope;

self.addEventListener('message', async (event: MessageEvent<CropWorkerIncomingMessage>) => {
	const msg = event.data;
	switch (msg?.type) {
		case CropAnimatedImageMessageType.CROP_ANIMATED_IMAGE_START:
			await handleCropStart(msg);
			break;
		case CropAnimatedImageMessageType.PROCESS_BATCH:
			await handleProcessBatch(msg);
			break;
		default:
			return;
	}
});

function postError(code: CropWorkerErrorCode, error: unknown): void {
	logger.error('Error:', error);
	const response: CropAnimatedImageErrorMessage = {
		type: CropAnimatedImageMessageType.CROP_ANIMATED_IMAGE_ERROR,
		error: error instanceof Error ? error.message : String(error),
		code,
	};
	self.postMessage(response);
}

function resolveStaticOutput(format: CropWorkerImageFormat, outputFormat: CropOutputFormat | undefined): string {
	if (outputFormat) return getStaticFormatHint(outputFormat);
	if (format === 'gif') return 'gif';
	return getStaticFormatHint(format);
}

async function handleCropStart(msg: CropAnimatedImageStartMessage): Promise<void> {
	const {
		imageBytes,
		format,
		x,
		y,
		width,
		height,
		imageRotation = 0,
		resizeWidth = null,
		resizeHeight = null,
		outputFormat,
	} = msg;
	if (!imageBytes || !format) {
		postError('internal', new Error('worker requires imageBytes; prefetchedFrames must be handled by the manager'));
		return;
	}
	try {
		await ensureLibfluxcoreReady();
		let result: Uint8Array;
		switch (format) {
			case 'gif':
				result = await cropGifWithParallelFrames(
					imageBytes,
					x,
					y,
					width,
					height,
					imageRotation,
					resizeWidth,
					resizeHeight,
				);
				break;
			case 'apng': {
				const isActuallyAnimated = await detectAnimatedImage(imageBytes);
				if (isActuallyAnimated) {
					if (outputFormat && outputFormat !== 'apng' && outputFormat !== 'animated_webp') {
						result = cropAndRotateImage(
							imageBytes,
							getStaticFormatHint(outputFormat),
							x,
							y,
							width,
							height,
							imageRotation,
							resizeWidth,
							resizeHeight,
						);
					} else {
						result = await cropApngWithParallelFrames(
							imageBytes,
							x,
							y,
							width,
							height,
							imageRotation,
							resizeWidth,
							resizeHeight,
						);
					}
				} else {
					result = cropAndRotateImage(
						imageBytes,
						resolveStaticOutput(format, outputFormat),
						x,
						y,
						width,
						height,
						imageRotation,
						resizeWidth,
						resizeHeight,
					);
				}
				break;
			}
			case 'webp':
			case 'avif': {
				const isAnimated = await detectAnimatedImage(imageBytes);
				if (isAnimated) {
					postError('unsupported_mime', new Error(`animated ${format} must be cropped via the native bridge`));
					return;
				}
				result = cropAndRotateImage(
					imageBytes,
					resolveStaticOutput(format, outputFormat),
					x,
					y,
					width,
					height,
					imageRotation,
					resizeWidth,
					resizeHeight,
				);
				break;
			}
			case 'png':
			case 'jpeg': {
				result = cropAndRotateImage(
					imageBytes,
					resolveStaticOutput(format, outputFormat),
					x,
					y,
					width,
					height,
					imageRotation,
					resizeWidth,
					resizeHeight,
				);
				break;
			}
			default:
				postError('unsupported_mime', new Error(`unsupported format: ${format as string}`));
				return;
		}
		const transferables: Array<Transferable> = [];
		if (result?.buffer) {
			transferables.push(result.buffer);
		}
		const response: CropAnimatedImageCompleteMessage = {
			type: CropAnimatedImageMessageType.CROP_ANIMATED_IMAGE_COMPLETE,
			result,
		};
		self.postMessage(response, transferables);
	} catch (err) {
		postError('internal', err);
	} finally {
		releaseLibfluxcoreMemoryIfIdle();
	}
}

function readU16LE(bytes: Uint8Array, offset: number): number {
	return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readU32BE(bytes: Uint8Array, offset: number): number {
	return (
		((bytes[offset] ?? 0) * 0x1000000 +
			(((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0))) >>>
		0
	);
}

function gifDimensions(bytes: Uint8Array): {width: number; height: number} | null {
	if (
		bytes.length < 10 ||
		bytes[0] !== 0x47 ||
		bytes[1] !== 0x49 ||
		bytes[2] !== 0x46 ||
		bytes[3] !== 0x38 ||
		(bytes[4] !== 0x37 && bytes[4] !== 0x39) ||
		bytes[5] !== 0x61
	) {
		return null;
	}
	return {width: readU16LE(bytes, 6), height: readU16LE(bytes, 8)};
}

function pngDimensions(bytes: Uint8Array): {width: number; height: number} | null {
	if (
		bytes.length < 24 ||
		bytes[0] !== 0x89 ||
		bytes[1] !== 0x50 ||
		bytes[2] !== 0x4e ||
		bytes[3] !== 0x47 ||
		bytes[4] !== 0x0d ||
		bytes[5] !== 0x0a ||
		bytes[6] !== 0x1a ||
		bytes[7] !== 0x0a ||
		bytes[12] !== 0x49 ||
		bytes[13] !== 0x48 ||
		bytes[14] !== 0x44 ||
		bytes[15] !== 0x52
	) {
		return null;
	}
	return {width: readU32BE(bytes, 16), height: readU32BE(bytes, 20)};
}

function positiveInt(value: number | null | undefined): number | null {
	if (value == null || !Number.isFinite(value) || value <= 0) return null;
	return Math.floor(value);
}

function normalizedRotation(degrees: number): number {
	const rotation = ((Math.floor(degrees || 0) % 360) + 360) % 360;
	return rotation === 90 || rotation === 180 || rotation === 270 ? rotation : 0;
}

function isNoopTransform(
	imageWidth: number,
	imageHeight: number,
	x: number,
	y: number,
	width: number,
	height: number,
	rotation: number,
	resizeWidth: number | null,
	resizeHeight: number | null,
): boolean {
	const cropX = Math.min(Math.max(0, Math.floor(x)), imageWidth);
	const cropY = Math.min(Math.max(0, Math.floor(y)), imageHeight);
	const cropW = Math.min(Math.max(0, Math.floor(width)), imageWidth - cropX);
	const cropH = Math.min(Math.max(0, Math.floor(height)), imageHeight - cropY);
	return (
		cropX === 0 &&
		cropY === 0 &&
		cropW === imageWidth &&
		cropH === imageHeight &&
		normalizedRotation(rotation) === 0 &&
		(positiveInt(resizeWidth) ?? imageWidth) === imageWidth &&
		(positiveInt(resizeHeight) ?? imageHeight) === imageHeight
	);
}

function transformFrame(frame: DecodedFrameInput, cropParams: CropParams): DecodedFrameInput {
	const transformed = cropRotateRgba(
		frame.rgba,
		frame.width,
		frame.height,
		cropParams.x,
		cropParams.y,
		cropParams.width,
		cropParams.height,
		cropParams.imageRotation ?? 0,
		cropParams.resizeWidth ?? null,
		cropParams.resizeHeight ?? null,
	);
	return {
		rgba: transformed.rgba,
		width: transformed.width,
		height: transformed.height,
		delayMs: frame.delayMs,
	};
}

function shouldParallelizeFrames(_frames: Array<DecodedFrameInput>): boolean {
	return false;
}

function nestedWorkerCount(frameCount: number): number {
	const cores = Math.max(1, typeof navigator === 'undefined' ? 1 : navigator.hardwareConcurrency || 1);
	return Math.max(1, Math.min(4, frameCount, cores - 1));
}

let nestedWorkerPool: Array<Worker> = [];
let nestedWorkerIdleTimer: NodeJS.Timeout | null = null;
let nestedJobId = 1;

function nextNestedJobId(): number {
	nestedJobId = (nestedJobId % 0x3fffffff) + 1;
	return nestedJobId;
}

function clearNestedWorkerIdleTimer(): void {
	if (!nestedWorkerIdleTimer) return;
	clearTimeout(nestedWorkerIdleTimer);
	nestedWorkerIdleTimer = null;
}

function terminateNestedWorkerPool(): void {
	clearNestedWorkerIdleTimer();
	for (const worker of nestedWorkerPool) worker.terminate();
	nestedWorkerPool = [];
}

function scheduleNestedWorkerCleanup(): void {
	clearNestedWorkerIdleTimer();
	nestedWorkerIdleTimer = setTimeout(terminateNestedWorkerPool, NESTED_WORKER_IDLE_MS);
}

function retireNestedWorker(worker: Worker): void {
	try {
		worker.terminate();
	} catch {}
	const index = nestedWorkerPool.indexOf(worker);
	if (index !== -1) nestedWorkerPool.splice(index, 1);
}

function getNestedWorkers(_count: number): Array<Worker> {
	throw new Error('nested worker parallelism is disabled');
}

function frameBatches(
	frames: Array<DecodedFrameInput>,
	workerCount: number,
): Array<Array<{frame: DecodedFrameInput; index: number}>> {
	const batches: Array<Array<{frame: DecodedFrameInput; index: number}>> = Array.from({length: workerCount}, () => []);
	for (let index = 0; index < frames.length; index += 1) {
		batches[index % workerCount]?.push({frame: frames[index], index});
	}
	return batches.filter((batch) => batch.length > 0);
}

function processFrameBatchInWorker(
	worker: Worker,
	jobId: number,
	frames: Array<{frame: DecodedFrameInput; index: number}>,
	cropParams: CropParams,
): Promise<Array<{frame: DecodedFrameInput; index: number}>> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			retireNestedWorker(worker);
			reject(new Error('Nested frame worker timed out'));
		}, 30000);
		const cleanup = () => {
			clearTimeout(timeout);
			worker.removeEventListener('message', handleMessage);
			worker.removeEventListener('error', handleError);
		};
		const handleMessage = (event: MessageEvent<ProcessBatchCompleteMessage | CropAnimatedImageErrorMessage>) => {
			const msg = event.data;
			if (msg.type === CropAnimatedImageMessageType.BATCH_COMPLETE && msg.jobId === jobId) {
				cleanup();
				const processed = msg.processedDecodedFrames;
				if (!processed) {
					reject(new Error('Nested frame worker returned no decoded frames'));
					return;
				}
				resolve(processed.map((frame, offset) => ({frame, index: frames[offset]?.index ?? offset})));
			} else if (msg.type === CropAnimatedImageMessageType.CROP_ANIMATED_IMAGE_ERROR) {
				cleanup();
				reject(new Error(msg.error || 'Nested frame worker failed'));
			}
		};
		const handleError = (error: ErrorEvent) => {
			cleanup();
			retireNestedWorker(worker);
			reject(new Error(error.message || 'Nested frame worker failed'));
		};
		worker.addEventListener('message', handleMessage);
		worker.addEventListener('error', handleError);
		const transferables = frames.map(({frame}) => frame.rgba.buffer);
		worker.postMessage(
			{
				type: CropAnimatedImageMessageType.PROCESS_BATCH,
				jobId,
				cropParams,
				batch: {
					startIndex: 0,
					operation: 'transform_rgba',
					frames: frames.map(({frame}) => ({
						data: frame.rgba,
						width: frame.width,
						height: frame.height,
						delay: frame.delayMs,
						delayMs: frame.delayMs,
						disposeOp: 0,
					})),
				},
			} satisfies ProcessBatchMessage,
			transferables,
		);
	});
}

async function transformFramesParallel(
	frames: Array<DecodedFrameInput>,
	cropParams: CropParams,
): Promise<Array<DecodedFrameInput>> {
	if (!shouldParallelizeFrames(frames)) {
		return frames.map((frame) => transformFrame(frame, cropParams));
	}
	const workerCount = nestedWorkerCount(frames.length);
	const batches = frameBatches(frames, workerCount);
	const workers = getNestedWorkers(batches.length);
	try {
		const batchResults = await Promise.all(
			batches.map((batch, index) => processFrameBatchInWorker(workers[index], nextNestedJobId(), batch, cropParams)),
		);
		const ordered: Array<DecodedFrameInput | undefined> = new Array(frames.length);
		for (const batch of batchResults) {
			for (const item of batch) ordered[item.index] = item.frame;
		}
		return ordered.map((frame, index) => {
			if (!frame) throw new Error(`Missing transformed frame ${index}`);
			return frame;
		});
	} finally {
		scheduleNestedWorkerCleanup();
	}
}

function processApngEncodeBatchInWorker(
	worker: Worker,
	jobId: number,
	frames: Array<{frame: DecodedFrameInput; index: number}>,
): Promise<Array<{frame: EncodedApngFrameInput; index: number}>> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			retireNestedWorker(worker);
			reject(new Error('Nested APNG encode worker timed out'));
		}, 30000);
		const cleanup = () => {
			clearTimeout(timeout);
			worker.removeEventListener('message', handleMessage);
			worker.removeEventListener('error', handleError);
		};
		const handleMessage = (event: MessageEvent<ProcessBatchCompleteMessage | CropAnimatedImageErrorMessage>) => {
			const msg = event.data;
			if (msg.type === CropAnimatedImageMessageType.BATCH_COMPLETE && msg.jobId === jobId) {
				cleanup();
				const encoded = msg.encodedApngFrames;
				if (!encoded) {
					reject(new Error('Nested APNG encode worker returned no frame payloads'));
					return;
				}
				resolve(encoded.map((frame, offset) => ({frame, index: frames[offset]?.index ?? offset})));
			} else if (msg.type === CropAnimatedImageMessageType.CROP_ANIMATED_IMAGE_ERROR) {
				cleanup();
				reject(new Error(msg.error || 'Nested APNG encode worker failed'));
			}
		};
		const handleError = (error: ErrorEvent) => {
			cleanup();
			retireNestedWorker(worker);
			reject(new Error(error.message || 'Nested APNG encode worker failed'));
		};
		worker.addEventListener('message', handleMessage);
		worker.addEventListener('error', handleError);
		const transferables = frames.map(({frame}) => frame.rgba.buffer);
		worker.postMessage(
			{
				type: CropAnimatedImageMessageType.PROCESS_BATCH,
				jobId,
				cropParams: {x: 0, y: 0, width: 0, height: 0},
				batch: {
					startIndex: 0,
					operation: 'encode_apng_frame',
					frames: frames.map(({frame}) => ({
						data: frame.rgba,
						width: frame.width,
						height: frame.height,
						delay: frame.delayMs,
						delayMs: frame.delayMs,
						disposeOp: 0,
					})),
				},
			} satisfies ProcessBatchMessage,
			transferables,
		);
	});
}

function processGifEncodeBatchInWorker(
	worker: Worker,
	jobId: number,
	frames: Array<{frame: DecodedFrameInput; index: number}>,
): Promise<Array<{frame: EncodedGifChunkInput; index: number}>> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			retireNestedWorker(worker);
			reject(new Error('Nested GIF encode worker timed out'));
		}, 30000);
		const cleanup = () => {
			clearTimeout(timeout);
			worker.removeEventListener('message', handleMessage);
			worker.removeEventListener('error', handleError);
		};
		const handleMessage = (event: MessageEvent<ProcessBatchCompleteMessage | CropAnimatedImageErrorMessage>) => {
			const msg = event.data;
			if (msg.type === CropAnimatedImageMessageType.BATCH_COMPLETE && msg.jobId === jobId) {
				cleanup();
				const encoded = msg.encodedGifChunks;
				if (!encoded) {
					reject(new Error('Nested GIF encode worker returned no frame chunks'));
					return;
				}
				resolve(encoded.map((frame, offset) => ({frame, index: frames[offset]?.index ?? offset})));
			} else if (msg.type === CropAnimatedImageMessageType.CROP_ANIMATED_IMAGE_ERROR) {
				cleanup();
				reject(new Error(msg.error || 'Nested GIF encode worker failed'));
			}
		};
		const handleError = (error: ErrorEvent) => {
			cleanup();
			retireNestedWorker(worker);
			reject(new Error(error.message || 'Nested GIF encode worker failed'));
		};
		worker.addEventListener('message', handleMessage);
		worker.addEventListener('error', handleError);
		const transferables = frames.map(({frame}) => frame.rgba.buffer);
		worker.postMessage(
			{
				type: CropAnimatedImageMessageType.PROCESS_BATCH,
				jobId,
				cropParams: {x: 0, y: 0, width: 0, height: 0},
				batch: {
					startIndex: 0,
					operation: 'encode_gif_frame',
					frames: frames.map(({frame, index}) => ({
						data: frame.rgba,
						width: frame.width,
						height: frame.height,
						delay: frame.delayMs,
						delayMs: frame.delayMs,
						disposeOp: 0,
						first: index === 0,
					})),
				},
			} satisfies ProcessBatchMessage,
			transferables,
		);
	});
}

async function encodeApngFramesParallel(frames: Array<DecodedFrameInput>): Promise<Uint8Array> {
	if (!shouldParallelizeFrames(frames)) return encodeApngFrames(frames);
	const workerCount = nestedWorkerCount(frames.length);
	const batches = frameBatches(frames, workerCount);
	const workers = getNestedWorkers(batches.length);
	try {
		const batchResults = await Promise.all(
			batches.map((batch, index) => processApngEncodeBatchInWorker(workers[index], nextNestedJobId(), batch)),
		);
		const ordered: Array<EncodedApngFrameInput | undefined> = new Array(frames.length);
		for (const batch of batchResults) {
			for (const item of batch) ordered[item.index] = item.frame;
		}
		return assembleApngFrames(
			ordered.map((frame, index) => {
				if (!frame) throw new Error(`Missing encoded APNG frame ${index}`);
				return frame;
			}),
		);
	} finally {
		scheduleNestedWorkerCleanup();
	}
}

async function encodeGifFramesParallel(frames: Array<DecodedFrameInput>): Promise<Uint8Array> {
	if (!shouldParallelizeFrames(frames)) return encodeGifFrames(frames);
	const workerCount = nestedWorkerCount(frames.length);
	const batches = frameBatches(frames, workerCount);
	const workers = getNestedWorkers(batches.length);
	try {
		const batchResults = await Promise.all(
			batches.map((batch, index) => processGifEncodeBatchInWorker(workers[index], nextNestedJobId(), batch)),
		);
		const ordered: Array<EncodedGifChunkInput | undefined> = new Array(frames.length);
		for (const batch of batchResults) {
			for (const item of batch) ordered[item.index] = item.frame;
		}
		return assembleGifFrameChunks(
			ordered.map((frame, index) => {
				if (!frame) throw new Error(`Missing encoded GIF frame ${index}`);
				return frame;
			}),
		);
	} finally {
		scheduleNestedWorkerCleanup();
	}
}

async function cropGifWithParallelFrames(
	imageBytes: Uint8Array,
	x: number,
	y: number,
	width: number,
	height: number,
	imageRotation: number,
	resizeWidth: number | null,
	resizeHeight: number | null,
): Promise<Uint8Array> {
	const dimensions = gifDimensions(imageBytes);
	if (
		dimensions &&
		isNoopTransform(dimensions.width, dimensions.height, x, y, width, height, imageRotation, resizeWidth, resizeHeight)
	) {
		return imageBytes.slice();
	}
	const frames = decodeGifFrames(imageBytes);
	return encodeGifFramesParallel(
		await transformFramesParallel(frames, {x, y, width, height, imageRotation, resizeWidth, resizeHeight}),
	);
}

async function cropApngWithParallelFrames(
	imageBytes: Uint8Array,
	x: number,
	y: number,
	width: number,
	height: number,
	imageRotation: number,
	resizeWidth: number | null,
	resizeHeight: number | null,
): Promise<Uint8Array> {
	const dimensions = pngDimensions(imageBytes);
	if (
		dimensions &&
		isNoopTransform(dimensions.width, dimensions.height, x, y, width, height, imageRotation, resizeWidth, resizeHeight)
	) {
		return imageBytes.slice();
	}
	const frames = decodeApngFrames(imageBytes);
	return encodeApngFramesParallel(
		await transformFramesParallel(frames, {x, y, width, height, imageRotation, resizeWidth, resizeHeight}),
	);
}

async function handleProcessBatch(msg: ProcessBatchMessage): Promise<void> {
	const {jobId, batch, cropParams} = msg;
	const {x, y, width, height, imageRotation = 0, resizeWidth = null, resizeHeight = null} = cropParams;
	try {
		await ensureLibfluxcoreReady();
		if (batch.operation === 'encode_apng_frame') {
			const encodedApngFrames: Array<EncodedApngFrameInput> = [];
			for (const frame of batch.frames) {
				if (frame.width == null || frame.height == null) throw new Error('APNG encode batch requires frame dimensions');
				encodedApngFrames.push(
					encodeApngFramePayload({
						rgba: frame.data,
						width: frame.width,
						height: frame.height,
						delayMs: frame.delayMs ?? frame.delay,
					}),
				);
			}
			const transferables = encodedApngFrames.map((frame) => frame.compressed.buffer);
			const response: ProcessBatchCompleteMessage = {
				type: CropAnimatedImageMessageType.BATCH_COMPLETE,
				jobId,
				processedFrames: [],
				encodedApngFrames,
			};
			self.postMessage(response, transferables);
			return;
		}
		if (batch.operation === 'encode_gif_frame') {
			const encodedGifChunks: Array<EncodedGifChunkInput> = [];
			for (const frame of batch.frames) {
				if (frame.width == null || frame.height == null) throw new Error('GIF encode batch requires frame dimensions');
				encodedGifChunks.push(
					encodeGifFrameChunk(
						{
							rgba: frame.data,
							width: frame.width,
							height: frame.height,
							delayMs: frame.delayMs ?? frame.delay,
						},
						Boolean(frame.first),
					),
				);
			}
			const transferables = encodedGifChunks.map((chunk) => chunk.data.buffer);
			const response: ProcessBatchCompleteMessage = {
				type: CropAnimatedImageMessageType.BATCH_COMPLETE,
				jobId,
				processedFrames: [],
				encodedGifChunks,
			};
			self.postMessage(response, transferables);
			return;
		}
		const rawFrames = batch.frames.every((frame) => frame.width != null && frame.height != null);
		if (rawFrames) {
			const processedDecodedFrames: Array<DecodedFrameInput> = [];
			for (const frame of batch.frames) {
				const transformed = cropRotateRgba(
					frame.data,
					frame.width ?? 0,
					frame.height ?? 0,
					x,
					y,
					width,
					height,
					imageRotation,
					resizeWidth,
					resizeHeight,
				);
				processedDecodedFrames.push({
					rgba: transformed.rgba,
					width: transformed.width,
					height: transformed.height,
					delayMs: frame.delayMs ?? frame.delay,
				});
			}
			const transferables = processedDecodedFrames.map((frame) => frame.rgba.buffer);
			const response: ProcessBatchCompleteMessage = {
				type: CropAnimatedImageMessageType.BATCH_COMPLETE,
				jobId,
				processedFrames: [],
				processedDecodedFrames,
			};
			self.postMessage(response, transferables);
			return;
		}
		const processedFrames: Array<Uint8Array> = [];
		for (const frame of batch.frames) {
			const croppedFrame = cropAndRotateImage(
				frame.data,
				'png',
				x,
				y,
				width,
				height,
				imageRotation,
				resizeWidth,
				resizeHeight,
			);
			processedFrames.push(croppedFrame);
		}
		const transferables: Array<Transferable> = processedFrames
			.filter((frame) => frame.buffer)
			.map((frame) => frame.buffer);
		const response: ProcessBatchCompleteMessage = {
			type: CropAnimatedImageMessageType.BATCH_COMPLETE,
			jobId,
			processedFrames,
		};
		self.postMessage(response, transferables);
	} catch (err) {
		postError('internal', err);
	} finally {
		releaseLibfluxcoreMemoryIfIdle();
	}
}
