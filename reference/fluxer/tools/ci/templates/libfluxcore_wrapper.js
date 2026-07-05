// SPDX-License-Identifier: AGPL-3.0-or-later

import {encode as encodePng} from 'fast-png';
import {zlibSync} from 'fflate';
import {applyPalette, GIFEncoder, quantize} from 'gifenc';
import {decompressFrames, parseGIF} from 'gifuct-js';
import {decode as decodeJpeg, encode as encodeJpeg} from 'jpeg-js';
import UPNG from 'upng-js';

const textEncoder = new TextEncoder();
const NULL_U32 = 0xffffffff;
const RGBA_RESULT_HEADER_BYTES = 8;
const MAX_ANIMATION_PIXELS = 200_000_000;
const MAX_STATIC_DECODE_MEMORY_MB = 1024;

function inputBytes(input) {
	if (input == null) return new Uint8Array();
	return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function arrayBufferFor(bytes) {
	if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) return bytes.buffer;
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function nonNegativeU32(value) {
	const number = Number(value);
	if (!Number.isFinite(number) || number <= 0) return 0;
	return Math.min(NULL_U32, Math.floor(number));
}

function cropCoordU32(value) {
	const number = Number(value);
	if (!Number.isFinite(number) || number <= 0) return 0;
	return Math.min(NULL_U32, Math.floor(number));
}

function optionalDimension(value) {
	const dimension = nonNegativeU32(value);
	return dimension > 0 ? dimension : null;
}

function effectiveRotation(rotationDeg) {
	const rotation = ((Math.floor(Number(rotationDeg) || 0) % 360) + 360) % 360;
	return rotation === 90 || rotation === 180 || rotation === 270 ? rotation : 0;
}

function normalizedFormat(value) {
	const format = String(value ?? '')
		.trim()
		.toLowerCase();
	if (format === 'jpg') return 'jpeg';
	if (format === 'apng') return 'png';
	if (format === 'animated_webp') return 'webp';
	return format;
}

function sniffImageFormat(input) {
	const bytes = inputBytes(input);
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return 'png';
	}
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
	if (
		bytes.length >= 6 &&
		bytes[0] === 0x47 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x38 &&
		(bytes[4] === 0x37 || bytes[4] === 0x39) &&
		bytes[5] === 0x61
	) {
		return 'gif';
	}
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return 'webp';
	}
	if (
		bytes.length >= 12 &&
		bytes[4] === 0x66 &&
		bytes[5] === 0x74 &&
		bytes[6] === 0x79 &&
		bytes[7] === 0x70 &&
		bytes[8] === 0x61 &&
		bytes[9] === 0x76 &&
		bytes[10] === 0x69 &&
		(bytes[11] === 0x66 || bytes[11] === 0x73)
	) {
		return 'avif';
	}
	return 'unknown';
}

function readU32FromBytes(bytes, offset) {
	return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function readU16LE(bytes, offset) {
	return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU16BE(bytes, offset) {
	return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU32BE(bytes, offset) {
	return (bytes[offset] * 0x1000000 + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])) >>> 0;
}

function parseRgbaTransformResult(bytes) {
	if (bytes.byteLength < RGBA_RESULT_HEADER_BYTES) throw new Error('libfluxcore returned a truncated RGBA result');
	const width = readU32FromBytes(bytes, 0);
	const height = readU32FromBytes(bytes, 4);
	const expected = RGBA_RESULT_HEADER_BYTES + width * height * 4;
	if (bytes.byteLength !== expected) throw new Error('libfluxcore returned an invalid RGBA result length');
	return {rgba: bytes.subarray(RGBA_RESULT_HEADER_BYTES), width, height};
}

function pngDimensions(bytes) {
	if (bytes.length < 24 || sniffImageFormat(bytes) !== 'png') return null;
	if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
	return {width: readU32BE(bytes, 16), height: readU32BE(bytes, 20)};
}

function gifDimensions(bytes) {
	if (bytes.length < 10 || sniffImageFormat(bytes) !== 'gif') return null;
	return {width: readU16LE(bytes, 6), height: readU16LE(bytes, 8)};
}

function jpegDimensions(bytes) {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
	let offset = 2;
	while (offset + 4 <= bytes.length) {
		while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
		if (offset >= bytes.length) return null;
		const marker = bytes[offset];
		offset += 1;
		if (marker === 0xd9 || marker === 0xda) return null;
		if (offset + 2 > bytes.length) return null;
		const length = readU16BE(bytes, offset);
		if (length < 2 || offset + length > bytes.length) return null;
		if (
			marker === 0xc0 ||
			marker === 0xc1 ||
			marker === 0xc2 ||
			marker === 0xc3 ||
			marker === 0xc5 ||
			marker === 0xc6 ||
			marker === 0xc7 ||
			marker === 0xc9 ||
			marker === 0xca ||
			marker === 0xcb ||
			marker === 0xcd ||
			marker === 0xce ||
			marker === 0xcf
		) {
			if (length < 7) return null;
			return {height: readU16BE(bytes, offset + 3), width: readU16BE(bytes, offset + 5)};
		}
		offset += length;
	}
	return null;
}

function imageDimensions(bytes, format) {
	switch (format) {
		case 'png':
			return pngDimensions(bytes);
		case 'gif':
			return gifDimensions(bytes);
		case 'jpeg':
			return jpegDimensions(bytes);
		default:
			return null;
	}
}

function isNoopTransform(imageWidth, imageHeight, x, y, width, height, rotationDeg, resizeWidth, resizeHeight) {
	const cropX = Math.min(cropCoordU32(x), imageWidth);
	const cropY = Math.min(cropCoordU32(y), imageHeight);
	const cropW = Math.min(nonNegativeU32(width), imageWidth - cropX);
	const cropH = Math.min(nonNegativeU32(height), imageHeight - cropY);
	const targetW = optionalDimension(resizeWidth) ?? imageWidth;
	const targetH = optionalDimension(resizeHeight) ?? imageHeight;
	return (
		cropX === 0 &&
		cropY === 0 &&
		cropW === imageWidth &&
		cropH === imageHeight &&
		effectiveRotation(rotationDeg) === 0 &&
		targetW === imageWidth &&
		targetH === imageHeight
	);
}

export function crop_rotate_rgba(
	input,
	src_width,
	src_height,
	x,
	y,
	width,
	height,
	rotation_deg,
	resize_width,
	resize_height,
) {
	const sourceWidth = nonNegativeU32(src_width);
	const sourceHeight = nonNegativeU32(src_height);
	return parseRgbaTransformResult(
		// biome-ignore lint/correctness/noUndeclaredVariables: Injected by the generated wasm wrapper at build time.
		crop_rotate_rgba_raw(
			inputBytes(input),
			sourceWidth,
			sourceHeight,
			cropCoordU32(x),
			cropCoordU32(y),
			nonNegativeU32(width),
			nonNegativeU32(height),
			effectiveRotation(rotation_deg),
			optionalDimension(resize_width),
			optionalDimension(resize_height),
		),
	);
}

function transformFrame(frame, x, y, width, height, rotationDeg, resizeWidth, resizeHeight) {
	const transformed = crop_rotate_rgba(
		frame.rgba,
		frame.width,
		frame.height,
		x,
		y,
		width,
		height,
		rotationDeg,
		resizeWidth,
		resizeHeight,
	);
	return {rgba: transformed.rgba, width: transformed.width, height: transformed.height, delayMs: frame.delayMs};
}

function transformFrames(frames, x, y, width, height, rotationDeg, resizeWidth, resizeHeight) {
	let totalPixels = 0;
	const transformed = frames.map((frame) => {
		const out = transformFrame(frame, x, y, width, height, rotationDeg, resizeWidth, resizeHeight);
		totalPixels += out.width * out.height;
		if (totalPixels > MAX_ANIMATION_PIXELS) {
			throw new Error('Animated image is too large to crop. Try reducing its dimensions or number of frames.');
		}
		return out;
	});
	return transformed;
}

function decodePngFrames(input) {
	const bytes = inputBytes(input);
	const decoded = UPNG.decode(arrayBufferFor(bytes));
	const rgbaFrames = UPNG.toRGBA8(decoded);
	if (!rgbaFrames.length) throw new Error('PNG has no frames');
	return rgbaFrames.map((frame, index) => {
		const delayMs = decoded.frames?.[index]?.delay ?? 0;
		return {rgba: new Uint8Array(frame), width: decoded.width, height: decoded.height, delayMs};
	});
}

function decodeJpegFrame(input) {
	const decoded = decodeJpeg(inputBytes(input), {
		useTArray: true,
		formatAsRGBA: true,
		maxMemoryUsageInMB: MAX_STATIC_DECODE_MEMORY_MB,
	});
	return {rgba: new Uint8Array(decoded.data), width: decoded.width, height: decoded.height, delayMs: 0};
}

function drawGifPatch(canvas, canvasWidth, frame) {
	const dims = frame.dims;
	const patch = frame.patch;
	for (let row = 0; row < dims.height; row += 1) {
		const canvasY = dims.top + row;
		if (canvasY < 0) continue;
		const canvasOffset = (canvasY * canvasWidth + dims.left) * 4;
		const patchOffset = row * dims.width * 4;
		if (canvasOffset < 0 || canvasOffset >= canvas.length) continue;
		for (let col = 0; col < dims.width; col += 1) {
			const source = patchOffset + col * 4;
			const target = canvasOffset + col * 4;
			if (target < 0 || target + 4 > canvas.length || source + 4 > patch.length) continue;
			if (patch[source + 3] === 0) continue;
			canvas[target] = patch[source];
			canvas[target + 1] = patch[source + 1];
			canvas[target + 2] = patch[source + 2];
			canvas[target + 3] = patch[source + 3];
		}
	}
}

function clearRectRgba(canvas, canvasWidth, x, y, width, height) {
	for (let row = 0; row < height; row += 1) {
		const start = ((y + row) * canvasWidth + x) * 4;
		const end = start + width * 4;
		if (start >= 0 && end <= canvas.length) canvas.fill(0, start, end);
	}
}

function collectGifFrames(input, transformOptions) {
	const bytes = inputBytes(input);
	const parsed = parseGIF(arrayBufferFor(bytes));
	const screenWidth = parsed.lsd.width;
	const screenHeight = parsed.lsd.height;
	const decodedFrames = decompressFrames(parsed, true);
	if (!decodedFrames.length) throw new Error('GIF has no frames');
	const canvas = new Uint8Array(screenWidth * screenHeight * 4);
	let previousCanvas = null;
	const frames = [];
	for (const frame of decodedFrames) {
		if (frame.disposalType === 3) previousCanvas = canvas.slice();
		drawGifPatch(canvas, screenWidth, frame);
		const sourceFrame = {
			rgba: transformOptions ? canvas : canvas.slice(),
			width: screenWidth,
			height: screenHeight,
			delayMs: frame.delay || 100,
		};
		frames.push(
			transformOptions
				? transformFrame(
						sourceFrame,
						transformOptions.x,
						transformOptions.y,
						transformOptions.width,
						transformOptions.height,
						transformOptions.rotationDeg,
						transformOptions.resizeWidth,
						transformOptions.resizeHeight,
					)
				: sourceFrame,
		);
		if (frame.disposalType === 2) {
			clearRectRgba(canvas, screenWidth, frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height);
		} else if (frame.disposalType === 3 && previousCanvas) {
			canvas.set(previousCanvas);
			previousCanvas = null;
		}
	}
	return frames;
}

function decodeGifFrames(input) {
	return collectGifFrames(input, null);
}

function transformGifFrames(input, x, y, width, height, rotationDeg, resizeWidth, resizeHeight) {
	return collectGifFrames(input, {x, y, width, height, rotationDeg, resizeWidth, resizeHeight});
}

function exactGifFrameData(rgba) {
	const palette = [];
	const colorToIndex = new Map();
	const index = new Uint8Array(rgba.length / 4);
	let transparentIndex = -1;
	for (let offset = 0, pixel = 0; offset < rgba.length; offset += 4, pixel += 1) {
		if (rgba[offset + 3] === 0) {
			if (transparentIndex === -1) {
				if (palette.length >= 256) return null;
				transparentIndex = palette.length;
				palette.push([0, 0, 0]);
			}
			index[pixel] = transparentIndex;
			continue;
		}
		const key = `${rgba[offset]},${rgba[offset + 1]},${rgba[offset + 2]}`;
		let paletteIndex = colorToIndex.get(key);
		if (paletteIndex == null) {
			if (palette.length >= 256) return null;
			paletteIndex = palette.length;
			colorToIndex.set(key, paletteIndex);
			palette.push([rgba[offset], rgba[offset + 1], rgba[offset + 2]]);
		}
		index[pixel] = paletteIndex;
	}
	if (palette.length === 0) palette.push([0, 0, 0]);
	return {index, palette, transparentIndex};
}

function quantizedGifFrameData(rgba) {
	const input = rgba.byteOffset === 0 && rgba.byteLength === rgba.buffer.byteLength ? rgba : new Uint8Array(rgba);
	const palette = quantize(input, 256, {format: 'rgba4444', oneBitAlpha: true});
	const index = applyPalette(input, palette, 'rgba4444');
	const transparentIndex = palette.findIndex((color) => color.length >= 4 && color[3] === 0);
	const rgbPalette = palette.map((color) => [color[0], color[1], color[2]]);
	return {index, palette: rgbPalette, transparentIndex};
}

function writeGifFrame(gif, frame, width, height, first) {
	if (frame.width !== width || frame.height !== height) throw new Error('GIF frame dimensions must match');
	const frameData = exactGifFrameData(frame.rgba) ?? quantizedGifFrameData(frame.rgba);
	const transparent = frameData.transparentIndex >= 0;
	gif.writeFrame(frameData.index, width, height, {
		palette: frameData.palette,
		delay: Math.max(0, Math.round(frame.delayMs || 0)),
		repeat: 0,
		transparent,
		transparentIndex: transparent ? frameData.transparentIndex : 0,
		first,
	});
}

function encodeGifFrames(frames) {
	if (!frames.length) throw new Error('GIF encode requires at least one frame');
	const width = frames[0].width;
	const height = frames[0].height;
	const gif = GIFEncoder();
	for (const frame of frames) writeGifFrame(gif, frame, width, height, false);
	gif.finish();
	return gif.bytes();
}

function encodeGifFrameChunk(frame, first) {
	const gif = GIFEncoder({auto: false});
	if (first) gif.writeHeader();
	writeGifFrame(gif, frame, frame.width, frame.height, first);
	return {data: gif.bytes(), width: frame.width, height: frame.height};
}

function assembleGifFrameChunks(chunks) {
	if (!chunks.length) throw new Error('GIF chunk assembly requires at least one frame');
	const width = chunks[0].width;
	const height = chunks[0].height;
	const parts = [];
	for (const chunk of chunks) {
		if (chunk.width !== width || chunk.height !== height) throw new Error('GIF frame dimensions must match');
		parts.push(inputBytes(chunk.data));
	}
	parts.push(new Uint8Array([0x3b]));
	return concatBytes(parts);
}

function writeU32BE(bytes, offset, value) {
	bytes[offset] = (value >>> 24) & 0xff;
	bytes[offset + 1] = (value >>> 16) & 0xff;
	bytes[offset + 2] = (value >>> 8) & 0xff;
	bytes[offset + 3] = value & 0xff;
}

function writeU16BE(bytes, offset, value) {
	bytes[offset] = (value >>> 8) & 0xff;
	bytes[offset + 1] = value & 0xff;
}

let pngCrcTable = null;
function crc32(bytes, start, end) {
	if (!pngCrcTable) {
		pngCrcTable = new Uint32Array(256);
		for (let n = 0; n < 256; n += 1) {
			let c = n;
			for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			pngCrcTable[n] = c >>> 0;
		}
	}
	let c = 0xffffffff;
	for (let index = start; index < end; index += 1) c = pngCrcTable[(c ^ bytes[index]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
	const typeBytes = textEncoder.encode(type);
	const chunk = new Uint8Array(12 + payload.length);
	writeU32BE(chunk, 0, payload.length);
	chunk.set(typeBytes, 4);
	chunk.set(payload, 8);
	writeU32BE(chunk, 8 + payload.length, crc32(chunk, 4, 8 + payload.length));
	return chunk;
}

function concatBytes(parts) {
	let total = 0;
	for (const part of parts) total += part.length;
	const output = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.length;
	}
	return output;
}

function pngScanlines(rgba, width, height) {
	const rowBytes = width * 4;
	const output = new Uint8Array((rowBytes + 1) * height);
	for (let row = 0; row < height; row += 1) {
		const target = row * (rowBytes + 1);
		output[target] = 0;
		output.set(rgba.subarray(row * rowBytes, row * rowBytes + rowBytes), target + 1);
	}
	return output;
}

function delayFraction(delayMs) {
	const ms = Math.max(0, Math.round(Number(delayMs) || 0));
	if (ms === 0) return [0, 100];
	if (ms <= 655350) return [Math.min(65535, Math.max(1, Math.round(ms / 10))), 100];
	return [Math.min(65535, Math.max(1, Math.round(ms / 1000))), 1];
}

function encodeApngFramePayload(frame) {
	return {
		compressed: zlibSync(pngScanlines(frame.rgba, frame.width, frame.height), {level: 6}),
		width: frame.width,
		height: frame.height,
		delayMs: frame.delayMs,
	};
}

function assembleApngFramePayloads(frames) {
	if (!frames.length) throw new Error('APNG encode requires at least one frame');
	const width = frames[0].width;
	const height = frames[0].height;
	const chunks = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
	const ihdr = new Uint8Array(13);
	writeU32BE(ihdr, 0, width);
	writeU32BE(ihdr, 4, height);
	ihdr[8] = 8;
	ihdr[9] = 6;
	chunks.push(pngChunk('IHDR', ihdr));
	const actl = new Uint8Array(8);
	writeU32BE(actl, 0, frames.length);
	writeU32BE(actl, 4, 0);
	chunks.push(pngChunk('acTL', actl));
	let sequence = 0;
	for (let index = 0; index < frames.length; index += 1) {
		const frame = frames[index];
		if (frame.width !== width || frame.height !== height) throw new Error('APNG frame dimensions must match');
		const fctl = new Uint8Array(26);
		writeU32BE(fctl, 0, sequence);
		sequence += 1;
		writeU32BE(fctl, 4, width);
		writeU32BE(fctl, 8, height);
		writeU32BE(fctl, 12, 0);
		writeU32BE(fctl, 16, 0);
		const delay = delayFraction(frame.delayMs);
		writeU16BE(fctl, 20, delay[0]);
		writeU16BE(fctl, 22, delay[1]);
		fctl[24] = 0;
		fctl[25] = 0;
		chunks.push(pngChunk('fcTL', fctl));
		if (index === 0) {
			chunks.push(pngChunk('IDAT', inputBytes(frame.compressed)));
		} else {
			const compressed = inputBytes(frame.compressed);
			const payload = new Uint8Array(4 + compressed.length);
			writeU32BE(payload, 0, sequence);
			sequence += 1;
			payload.set(compressed, 4);
			chunks.push(pngChunk('fdAT', payload));
		}
	}
	chunks.push(pngChunk('IEND', new Uint8Array()));
	return concatBytes(chunks);
}

function encodeApngFrames(frames) {
	if (!frames.length) throw new Error('APNG encode requires at least one frame');
	const width = frames[0].width;
	const height = frames[0].height;
	for (const frame of frames) {
		if (frame.width !== width || frame.height !== height) throw new Error('APNG frame dimensions must match');
	}
	return assembleApngFramePayloads(frames.map(encodeApngFramePayload));
}

function encodeStaticFrame(frame, outputFormat) {
	switch (outputFormat) {
		case 'png':
			return encodePng({width: frame.width, height: frame.height, data: frame.rgba, depth: 8, channels: 4});
		case 'jpeg':
			return encodeJpeg({width: frame.width, height: frame.height, data: frame.rgba}, 92).data;
		case 'gif':
			return encodeGifFrames([frame]);
		default:
			throw new Error(`Unsupported static output format: ${outputFormat}`);
	}
}

function decodeStaticImage(input, inputFormat) {
	switch (inputFormat) {
		case 'png':
			return decodePngFrames(input)[0];
		case 'jpeg':
			return decodeJpegFrame(input);
		case 'gif':
			return decodeGifFrames(input)[0];
		default:
			throw new Error(`Unsupported static input format: ${inputFormat}`);
	}
}

function normalizeFrameInput(frame) {
	if (!frame || frame.rgba == null) throw new Error('Frame is missing RGBA data');
	return {
		rgba: inputBytes(frame.rgba),
		width: nonNegativeU32(frame.width),
		height: nonNegativeU32(frame.height),
		delayMs: Math.max(0, Math.round(Number(frame.delayMs) || 0)),
	};
}

function normalizeApngPayloadInput(frame) {
	if (!frame || frame.compressed == null) throw new Error('APNG frame is missing compressed data');
	return {
		compressed: inputBytes(frame.compressed),
		width: nonNegativeU32(frame.width),
		height: nonNegativeU32(frame.height),
		delayMs: Math.max(0, Math.round(Number(frame.delayMs) || 0)),
	};
}

function normalizeGifChunkInput(chunk) {
	if (!chunk || chunk.data == null) throw new Error('GIF frame chunk is missing data');
	return {
		data: inputBytes(chunk.data),
		width: nonNegativeU32(chunk.width),
		height: nonNegativeU32(chunk.height),
	};
}

export function decode_gif_frames(input) {
	return decodeGifFrames(input);
}

export function decode_apng_frames(input) {
	return decodePngFrames(input);
}

export function encode_gif_frames(frames) {
	return encodeGifFrames(frames.map(normalizeFrameInput));
}

export function encode_apng_frames(frames) {
	return encodeApngFrames(frames.map(normalizeFrameInput));
}

export function encode_gif_frame_chunk(frame, first) {
	return encodeGifFrameChunk(normalizeFrameInput(frame), Boolean(first));
}

export function assemble_gif_frame_chunks(chunks) {
	return assembleGifFrameChunks(chunks.map(normalizeGifChunkInput));
}

export function encode_apng_frame_payload(frame) {
	return encodeApngFramePayload(normalizeFrameInput(frame));
}

export function assemble_apng_frames(frames) {
	return assembleApngFramePayloads(frames.map(normalizeApngPayloadInput));
}

export function crop_and_rotate_apng(input, x, y, width, height, rotation_deg, resize_width, resize_height) {
	const bytes = inputBytes(input);
	const dimensions = pngDimensions(bytes);
	if (
		dimensions &&
		isNoopTransform(dimensions.width, dimensions.height, x, y, width, height, rotation_deg, resize_width, resize_height)
	) {
		return bytes.slice();
	}
	const frames = decodePngFrames(bytes);
	if (
		isNoopTransform(frames[0].width, frames[0].height, x, y, width, height, rotation_deg, resize_width, resize_height)
	) {
		return bytes.slice();
	}
	return encodeApngFrames(transformFrames(frames, x, y, width, height, rotation_deg, resize_width, resize_height));
}

export function crop_and_rotate_gif(input, x, y, width, height, rotation_deg, resize_width, resize_height) {
	const bytes = inputBytes(input);
	const dimensions = gifDimensions(bytes);
	if (
		dimensions &&
		isNoopTransform(dimensions.width, dimensions.height, x, y, width, height, rotation_deg, resize_width, resize_height)
	) {
		return bytes.slice();
	}
	return encodeGifFrames(transformGifFrames(bytes, x, y, width, height, rotation_deg, resize_width, resize_height));
}

export function crop_and_rotate_image(
	input,
	format_hint,
	x,
	y,
	width,
	height,
	rotation_deg,
	resize_width,
	resize_height,
) {
	const bytes = inputBytes(input);
	const inputFormat = sniffImageFormat(bytes);
	const requestedFormat = normalizedFormat(format_hint);
	const outputFormat = requestedFormat && requestedFormat !== 'unknown' ? requestedFormat : inputFormat;
	if (inputFormat === 'webp' || inputFormat === 'avif' || outputFormat === 'webp' || outputFormat === 'avif') {
		throw new Error('WebP and AVIF crop/encode use the browser or native media bridge');
	}
	if (inputFormat === outputFormat) {
		const dimensions = imageDimensions(bytes, inputFormat);
		if (
			dimensions &&
			isNoopTransform(
				dimensions.width,
				dimensions.height,
				x,
				y,
				width,
				height,
				rotation_deg,
				resize_width,
				resize_height,
			)
		) {
			return bytes.slice();
		}
	}
	const frame = decodeStaticImage(bytes, inputFormat);
	if (
		inputFormat === outputFormat &&
		isNoopTransform(frame.width, frame.height, x, y, width, height, rotation_deg, resize_width, resize_height)
	) {
		return bytes.slice();
	}
	return encodeStaticFrame(
		transformFrame(frame, x, y, width, height, rotation_deg, resize_width, resize_height),
		outputFormat,
	);
}
