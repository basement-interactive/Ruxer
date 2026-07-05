// SPDX-License-Identifier: AGPL-3.0-or-later

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

export function assemble_apng_frames(frames: Array<EncodedApngFrame>): Uint8Array;
export function assemble_gif_frame_chunks(chunks: Array<EncodedGifChunk>): Uint8Array;
export function crop_and_rotate_apng(
	input: Uint8Array,
	x: number,
	y: number,
	width: number,
	height: number,
	rotation_deg: number,
	resize_width?: number | null,
	resize_height?: number | null,
): Uint8Array;
export function crop_and_rotate_gif(
	input: Uint8Array,
	x: number,
	y: number,
	width: number,
	height: number,
	rotation_deg: number,
	resize_width?: number | null,
	resize_height?: number | null,
): Uint8Array;
export function crop_and_rotate_image(
	input: Uint8Array,
	format_hint: string,
	x: number,
	y: number,
	width: number,
	height: number,
	rotation_deg: number,
	resize_width?: number | null,
	resize_height?: number | null,
): Uint8Array;
export function crop_rotate_rgba(
	input: Uint8Array,
	src_width: number,
	src_height: number,
	x: number,
	y: number,
	width: number,
	height: number,
	rotation_deg: number,
	resize_width?: number | null,
	resize_height?: number | null,
): RgbaTransformResult;
export function decode_apng_frames(input: Uint8Array): Array<DecodedFrame>;
export function decode_gif_frames(input: Uint8Array): Array<DecodedFrame>;
export function encode_apng_frame_payload(frame: DecodedFrame): EncodedApngFrame;
export function encode_apng_frames(frames: Array<DecodedFrame>): Uint8Array;
export function encode_gif_frame_chunk(frame: DecodedFrame, first?: boolean): EncodedGifChunk;
export function encode_gif_frames(frames: Array<DecodedFrame>): Uint8Array;
