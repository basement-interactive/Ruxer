// SPDX-License-Identifier: AGPL-3.0-or-later

export type AnimatedImageFormat = 'gif' | 'webp' | 'avif' | 'apng';
export type CropWorkerImageFormat = AnimatedImageFormat | 'png' | 'jpeg';
export type CropOutputFormat = 'animated_webp' | 'apng' | 'gif' | 'webp' | 'png' | 'jpeg' | 'avif';

export interface CropParams {
	x: number;
	y: number;
	width: number;
	height: number;
	imageRotation?: number;
	resizeWidth?: number | null;
	resizeHeight?: number | null;
	outputFormat?: CropOutputFormat;
}

export type CropWorkerErrorCode =
	| 'unsupported_mime'
	| 'lottie_unsupported'
	| 'heic_unsupported_in_browser'
	| 'decode_failed'
	| 'encode_failed'
	| 'internal';
export type FrameBatchOperation = 'transform_rgba' | 'encode_apng_frame' | 'encode_gif_frame';

export interface FrameBatch {
	startIndex: number;
	operation?: FrameBatchOperation;
	frames: Array<{
		data: Uint8Array;
		delay: number;
		disposeOp: number;
		width?: number;
		height?: number;
		delayMs?: number;
		first?: boolean;
	}>;
}

export enum CropAnimatedImageMessageType {
	CROP_ANIMATED_IMAGE_START = 0,
	CROP_ANIMATED_IMAGE_COMPLETE = 1,
	CROP_ANIMATED_IMAGE_ERROR = 2,
	PROCESS_BATCH = 3,
	BATCH_COMPLETE = 4,
}

export interface DecodedFrameInput {
	rgba: Uint8Array;
	width: number;
	height: number;
	delayMs: number;
}

export interface EncodedApngFrameInput {
	compressed: Uint8Array;
	width: number;
	height: number;
	delayMs: number;
}

export interface EncodedGifChunkInput {
	data: Uint8Array;
	width: number;
	height: number;
}

export interface CropAnimatedImageStartMessage extends CropParams {
	type: CropAnimatedImageMessageType.CROP_ANIMATED_IMAGE_START;
	imageBytes?: Uint8Array;
	format?: CropWorkerImageFormat;
	prefetchedFrames?: Array<DecodedFrameInput>;
}

export interface CropAnimatedImageCompleteMessage {
	type: CropAnimatedImageMessageType.CROP_ANIMATED_IMAGE_COMPLETE;
	result: Uint8Array;
}

export interface CropAnimatedImageErrorMessage {
	type: CropAnimatedImageMessageType.CROP_ANIMATED_IMAGE_ERROR;
	error: string;
	code?: CropWorkerErrorCode;
}

export interface ProcessBatchMessage {
	type: CropAnimatedImageMessageType.PROCESS_BATCH;
	jobId: number;
	batch: FrameBatch;
	cropParams: CropParams;
}

export interface ProcessBatchCompleteMessage {
	type: CropAnimatedImageMessageType.BATCH_COMPLETE;
	jobId: number;
	processedFrames: Array<Uint8Array>;
	processedDecodedFrames?: Array<DecodedFrameInput>;
	encodedApngFrames?: Array<EncodedApngFrameInput>;
	encodedGifChunks?: Array<EncodedGifChunkInput>;
}

export type CropWorkerIncomingMessage = CropAnimatedImageStartMessage | ProcessBatchMessage;
