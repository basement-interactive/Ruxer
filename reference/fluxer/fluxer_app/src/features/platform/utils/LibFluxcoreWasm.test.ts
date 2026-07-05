// SPDX-License-Identifier: AGPL-3.0-or-later

import {readFileSync} from 'node:fs';
import {
	create_zstd_stream_decoder,
	crop_rotate_rgba,
	decompress_zstd_frame,
	decompress_zstd_stream_chunk,
	free_zstd_stream_decoder,
	initSync,
	is_animated_image,
} from '@pkgs/libfluxcore/libfluxcore';
import {describe, expect, it} from 'vitest';

const wasmBytes = readFileSync(new URL('../../../../pkgs/libfluxcore/libfluxcore_bg.wasm', import.meta.url));

initSync({module: wasmBytes});

function rgba(values: Array<number>): Uint8Array {
	return new Uint8Array(values.flatMap((value) => [value, 0, 0, 255]));
}

describe('libfluxcore WASM package', () => {
	it('rotates RGBA pixels through the generated JS ABI', () => {
		const output = crop_rotate_rgba(rgba([1, 2, 3, 4, 5, 6]), 2, 3, 0, 0, 2, 3, 90, null, null);
		expect(output.width).toBe(3);
		expect(output.height).toBe(2);
		expect(Array.from(output.rgba)).toEqual(Array.from(rgba([5, 3, 1, 6, 4, 2])));
	});
	it('detects animated image containers without decoding the image payload', () => {
		const twoFrameGif = new Uint8Array([
			0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0x2c, 0, 0, 0, 0,
			1, 0, 1, 0, 0, 2, 0, 0x3b,
		]);
		const apng = new Uint8Array([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 8, 0x61, 0x63, 0x54, 0x4c, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
			0, 0,
		]);
		expect(is_animated_image(twoFrameGif)).toBe(true);
		expect(is_animated_image(apng)).toBe(true);
		expect(is_animated_image(new Uint8Array([0x47, 0x49, 0x46]))).toBe(false);
	});
	it('decompresses a zstd gateway frame through the generated JS ABI', () => {
		const compressed = new Uint8Array([
			40, 181, 47, 253, 4, 88, 177, 0, 0, 104, 101, 108, 108, 111, 32, 102, 114, 111, 109, 32, 108, 105, 98, 102, 108,
			117, 120, 99, 111, 114, 101, 57, 102, 208, 44,
		]);
		expect(new TextDecoder().decode(decompress_zstd_frame(compressed))).toBe('hello from libfluxcore');
	});
	it('keeps zstd stream decoder state between chunks', () => {
		const compressed = new Uint8Array([
			40, 181, 47, 253, 4, 88, 177, 0, 0, 104, 101, 108, 108, 111, 32, 102, 114, 111, 109, 32, 108, 105, 98, 102, 108,
			117, 120, 99, 111, 114, 101, 57, 102, 208, 44,
		]);
		const decoder = create_zstd_stream_decoder();
		try {
			const first = decompress_zstd_stream_chunk(decoder, compressed.slice(0, 8));
			const second = decompress_zstd_stream_chunk(decoder, compressed.slice(8));
			const decoded = new Uint8Array(first.length + second.length);
			decoded.set(first, 0);
			decoded.set(second, first.length);
			expect(new TextDecoder().decode(decoded)).toBe('hello from libfluxcore');
		} finally {
			free_zstd_stream_decoder(decoder);
		}
	});
});
