// SPDX-License-Identifier: AGPL-3.0-or-later

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {isMainThread, parentPort, Worker, workerData} from 'node:worker_threads';
import {encode as encodePng} from 'fast-png';
import {encode as encodeJpeg} from 'jpeg-js';
import {
	assemble_apng_frames,
	assemble_gif_frame_chunks,
	crop_and_rotate_apng,
	crop_and_rotate_gif,
	crop_and_rotate_image,
	crop_rotate_rgba,
	decode_apng_frames,
	decode_gif_frames,
	encode_apng_frame_payload,
	encode_apng_frames,
	encode_gif_frame_chunk,
	encode_gif_frames,
	initSync,
	is_animated_image,
} from '../pkgs/libfluxcore/libfluxcore.js';

const wasmUrl = new URL('../pkgs/libfluxcore/libfluxcore_bg.wasm', import.meta.url);
const mediaCacheDir = new URL('../.cache/libfluxcore-bench-media/', import.meta.url);
const workerCount = Math.max(1, Math.min(4, os.availableParallelism?.() ?? os.cpus().length ?? 1));
const profile = process.argv.find((arg) => arg.startsWith('--profile='))?.slice('--profile='.length) ?? 'standard';
const downloadRealMediaOnly = process.argv.includes('--download-realmedia');
const offlineRealMedia = process.argv.includes('--offline') || process.env.FLUXCORE_BENCH_OFFLINE === '1';
const userAgent = 'Fluxer libfluxcore benchmark (https://fluxer.app)';
const realMediaAssets = [
	{
		id: 'jpeg-fronalpstock',
		format: 'jpeg',
		fileName: 'fronalpstock_big.jpg',
		expectedBytes: 14_679_474,
		url: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg',
		source: 'https://commons.wikimedia.org/wiki/File:Fronalpstock_big.jpg',
	},
	{
		id: 'png-snr-demo',
		format: 'png',
		fileName: 'snr_image_demonstration.png',
		expectedBytes: 1_146_718,
		url: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/SNR_image_demonstration.png',
		source: 'https://commons.wikimedia.org/wiki/File:SNR_image_demonstration.png',
	},
	{
		id: 'gif-gerridae',
		format: 'gif',
		fileName: 'gerridae_1200x675.gif',
		expectedBytes: 6_318_395,
		url: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/%22%2Barya%2B%22_Gerridae_-_Anggang_kayak_-_laba-laba_air_-_Lengkongwetan_2020_1.gif',
		source:
			'https://commons.wikimedia.org/wiki/File:%22%2Barya%2B%22_Gerridae_-_Anggang_kayak_-_laba-laba_air_-_Lengkongwetan_2020_1.gif',
	},
	{
		id: 'apng-human-male',
		format: 'apng',
		fileName: '201803_human_male_anim.png',
		expectedBytes: 8_150_411,
		url: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/201803_Human_Male_anim.png',
		source: 'https://commons.wikimedia.org/wiki/File:201803_Human_Male_anim.png',
	},
	{
		id: 'webp-samsung-note',
		format: 'webp',
		fileName: 'samsung_galaxy_note.webp',
		expectedBytes: 7_326_306,
		url: 'https://upload.wikimedia.org/wikipedia/commons/5/59/Samsung_Galaxy_Note.WebP',
		source: 'https://commons.wikimedia.org/wiki/File:Samsung_Galaxy_Note.WebP',
	},
	{
		id: 'avif-hato',
		format: 'avif',
		fileName: 'hato.profile0.8bpc.yuv420.avif',
		expectedBytes: 259_104,
		url: 'https://raw.githubusercontent.com/link-u/avif-sample-images/master/hato.profile0.8bpc.yuv420.avif',
		source: 'https://github.com/link-u/avif-sample-images',
	},
];

function initWasm(bytes) {
	initSync({module: bytes});
}

function makeFrame(width, height, seed) {
	const rgba = new Uint8Array(width * height * 4);
	for (let index = 0, pixel = 0; index < rgba.length; index += 4, pixel += 1) {
		const x = pixel % width;
		const y = Math.floor(pixel / width);
		rgba[index] = (x * 3 + seed * 17) & 0xff;
		rgba[index + 1] = (y * 5 + seed * 29) & 0xff;
		rgba[index + 2] = ((x ^ y) + seed * 11) & 0xff;
		rgba[index + 3] = 255;
	}
	return {rgba, width, height, delayMs: 40};
}

function batches(frames, count) {
	const out = Array.from({length: count}, () => []);
	for (let index = 0; index < frames.length; index += 1) out[index % count].push({frame: frames[index], index});
	return out.filter((batch) => batch.length > 0);
}

async function encodeInWorkers(kind, frames, wasmBytes, options = {}) {
	const jobs = batches(frames, Math.min(workerCount, frames.length));
	const workers = jobs.map(() => new Worker(new URL(import.meta.url), {workerData: {wasmBytes}}));
	try {
		const results = await Promise.all(
			jobs.map(
				(batch, index) =>
					new Promise((resolve, reject) => {
						const worker = workers[index];
						const payload = batch.map(({frame, index: frameIndex}) => ({
							frame: {
								rgba: options.transferFrames ? frame.rgba : frame.rgba.slice(),
								width: frame.width,
								height: frame.height,
								delayMs: frame.delayMs,
							},
							index: frameIndex,
						}));
						worker.once('message', (message) => {
							if (message.ok) resolve(message.frames);
							else reject(new Error(message.error || 'worker encode failed'));
						});
						worker.once('error', reject);
						worker.postMessage(
							{kind, frames: payload},
							payload.map(({frame}) => frame.rgba.buffer),
						);
					}),
			),
		);
		const ordered = new Array(frames.length);
		for (const result of results) {
			for (const item of result) ordered[item.index] = item.frame;
		}
		if (kind === 'apng') return assemble_apng_frames(ordered);
		return assemble_gif_frame_chunks(ordered);
	} finally {
		await Promise.allSettled(workers.map((worker) => worker.terminate()));
	}
}

async function transformInWorkers(frames, cropParams, wasmBytes) {
	const jobs = batches(frames, Math.min(workerCount, frames.length));
	const workers = jobs.map(() => new Worker(new URL(import.meta.url), {workerData: {wasmBytes}}));
	try {
		const results = await Promise.all(
			jobs.map(
				(batch, index) =>
					new Promise((resolve, reject) => {
						const worker = workers[index];
						const payload = batch.map(({frame, index: frameIndex}) => ({
							frame: {
								rgba: frame.rgba,
								width: frame.width,
								height: frame.height,
								delayMs: frame.delayMs,
							},
							index: frameIndex,
						}));
						worker.once('message', (message) => {
							if (message.ok) resolve(message.frames);
							else reject(new Error(message.error || 'worker transform failed'));
						});
						worker.once('error', reject);
						worker.postMessage(
							{kind: 'transform', frames: payload, cropParams},
							payload.map(({frame}) => frame.rgba.buffer),
						);
					}),
			),
		);
		const ordered = new Array(frames.length);
		for (const result of results) {
			for (const item of result) ordered[item.index] = item.frame;
		}
		return ordered;
	} finally {
		await Promise.allSettled(workers.map((worker) => worker.terminate()));
	}
}

function benchSync(label, iterations, fn) {
	fn();
	const start = performance.now();
	let result;
	for (let index = 0; index < iterations; index += 1) result = fn();
	const elapsed = performance.now() - start;
	const bytes = result?.byteLength ?? result?.rgba?.byteLength ?? 0;
	console.log(`${label}: ${(elapsed / iterations).toFixed(2)} ms/op (${iterations} iters, ${bytes} bytes last result)`);
}

async function benchAsync(label, iterations, fn) {
	await fn();
	const start = performance.now();
	let result;
	for (let index = 0; index < iterations; index += 1) result = await fn();
	const elapsed = performance.now() - start;
	const bytes = result?.byteLength ?? 0;
	console.log(`${label}: ${(elapsed / iterations).toFixed(2)} ms/op (${iterations} iters, ${bytes} bytes last result)`);
}

function benchOnce(label, fn) {
	const start = performance.now();
	const result = fn();
	const elapsed = performance.now() - start;
	const bytes = result?.byteLength ?? result?.rgba?.byteLength ?? 0;
	console.log(`${label}: ${elapsed.toFixed(2)} ms (${bytes} bytes result)`);
	return result;
}

async function benchOnceAsync(label, fn) {
	const start = performance.now();
	const result = await fn();
	const elapsed = performance.now() - start;
	const bytes = result?.byteLength ?? result?.rgba?.byteLength ?? 0;
	console.log(`${label}: ${elapsed.toFixed(2)} ms (${bytes} bytes result)`);
	return result;
}

function assertExpectedAssetSize(asset, bytes) {
	if (asset.expectedBytes != null && bytes.byteLength !== asset.expectedBytes) {
		throw new Error(`${asset.id} expected ${asset.expectedBytes} bytes, got ${bytes.byteLength}`);
	}
}

async function readOrDownloadAsset(asset, options = {}) {
	await mkdir(mediaCacheDir, {recursive: true});
	const fileUrl = new URL(asset.fileName, mediaCacheDir);
	try {
		const data = await readFile(fileUrl);
		assertExpectedAssetSize(asset, data);
		console.log(`asset ${asset.id}: cache hit (${data.byteLength} bytes)`);
		return data;
	} catch (error) {
		if (options.offline) {
			throw new Error(
				`missing or invalid local media asset ${asset.fileName}; run pnpm wasm:bench:download-realmedia`,
				{cause: error},
			);
		}
	}
	const response = await fetch(asset.url, {headers: {'User-Agent': userAgent}});
	if (!response.ok) throw new Error(`failed to download ${asset.id}: HTTP ${response.status}`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	assertExpectedAssetSize(asset, bytes);
	await writeFile(fileUrl, bytes);
	console.log(`asset ${asset.id}: downloaded ${bytes.byteLength} bytes from ${asset.source}`);
	return bytes;
}

async function loadRealMediaAssets(options = {}) {
	const entries = await Promise.all(
		realMediaAssets.map(async (asset) => [asset.id, {...asset, bytes: await readOrDownloadAsset(asset, options)}]),
	);
	return new Map(entries);
}

async function runStandardProfile(wasmBytes) {
	const cropSource = makeFrame(1024, 1024, 1);
	benchSync('crop_rotate_rgba 1024x1024 -> 512x512 rotate90', 60, () =>
		crop_rotate_rgba(cropSource.rgba, cropSource.width, cropSource.height, 64, 64, 768, 768, 90, 512, 512),
	);
	const apngFrames = Array.from({length: 24}, (_, index) => makeFrame(320, 320, index));
	benchSync('encode_apng_frames serial 24x320', 4, () => encode_apng_frames(apngFrames));
	await benchAsync('encode_apng_frames worker payloads 24x320', 4, () =>
		encodeInWorkers('apng', apngFrames, wasmBytes),
	);
	const gifFrames = Array.from({length: 16}, (_, index) => makeFrame(192, 192, index));
	benchSync('encode_gif_frames serial 16x192', 3, () => encode_gif_frames(gifFrames));
	await benchAsync('encode_gif_frames worker chunks 16x192', 3, () => encodeInWorkers('gif', gifFrames, wasmBytes));
}

async function runHighResProfile(wasmBytes) {
	const crop4k = makeFrame(3840, 2160, 11);
	benchSync('crop_rotate_rgba 4K -> 1080p rotate90', 10, () =>
		crop_rotate_rgba(crop4k.rgba, crop4k.width, crop4k.height, 420, 120, 3000, 1800, 90, 1080, 1920),
	);
	const staticFrame = makeFrame(1920, 1080, 17);
	const pngSource = encodePng({
		width: staticFrame.width,
		height: staticFrame.height,
		data: staticFrame.rgba,
		depth: 8,
		channels: 4,
	});
	const jpegSource = encodeJpeg(
		{width: staticFrame.width, height: staticFrame.height, data: staticFrame.rgba},
		88,
	).data;
	benchSync('crop_and_rotate_image PNG 1080p -> PNG 720p', 3, () =>
		crop_and_rotate_image(pngSource, 'png', 160, 90, 1600, 900, 0, 1280, 720),
	);
	benchSync('crop_and_rotate_image JPEG 1080p -> JPEG 720p', 3, () =>
		crop_and_rotate_image(jpegSource, 'jpeg', 160, 90, 1600, 900, 0, 1280, 720),
	);
	const apngFrames = Array.from({length: 6}, (_, index) => makeFrame(1920, 1080, index + 31));
	benchSync('encode_apng_frames serial 6x1080p', 1, () => encode_apng_frames(apngFrames));
	await benchAsync('encode_apng_frames worker payloads 6x1080p', 1, () =>
		encodeInWorkers('apng', apngFrames, wasmBytes),
	);
	const gifFrames = Array.from({length: 6}, (_, index) => makeFrame(1280, 720, index + 51));
	benchSync('encode_gif_frames serial 6x720p', 1, () => encode_gif_frames(gifFrames));
	await benchAsync('encode_gif_frames worker chunks 6x720p', 1, () => encodeInWorkers('gif', gifFrames, wasmBytes));
}

async function runRealMediaProfile(wasmBytes) {
	const assets = await loadRealMediaAssets({offline: offlineRealMedia});
	const jpeg = assets.get('jpeg-fronalpstock').bytes;
	const png = assets.get('png-snr-demo').bytes;
	const gif = assets.get('gif-gerridae').bytes;
	const apng = assets.get('apng-human-male').bytes;
	const webp = assets.get('webp-samsung-note').bytes;
	const avif = assets.get('avif-hato').bytes;
	benchOnce('real JPEG crop Fronalpstock 10109x4542 -> JPEG 1920x1080', () =>
		crop_and_rotate_image(jpeg, 'jpeg', 1000, 400, 8000, 3600, 0, 1920, 1080),
	);
	benchOnce('real PNG crop SNR demo 3840x2880 -> PNG 1280x720', () =>
		crop_and_rotate_image(png, 'png', 320, 240, 3200, 1800, 0, 1280, 720),
	);
	benchOnce('real APNG serial crop 1920x1920x22 -> 720x720', () =>
		crop_and_rotate_apng(apng, 240, 240, 1440, 1440, 0, 720, 720),
	);
	await benchOnceAsync('real APNG worker-style crop 1920x1920x22 -> 720x720', async () => {
		const frames = decode_apng_frames(apng);
		const transformed = await transformInWorkers(
			frames,
			{x: 240, y: 240, width: 1440, height: 1440, rotation: 0, resizeWidth: 720, resizeHeight: 720},
			wasmBytes,
		);
		return encodeInWorkers('apng', transformed, wasmBytes, {transferFrames: true});
	});
	benchOnce('real GIF serial crop 1200x675x13 -> 854x480', () =>
		crop_and_rotate_gif(gif, 80, 45, 1040, 585, 0, 854, 480),
	);
	await benchOnceAsync('real GIF worker-style crop 1200x675x13 -> 854x480', async () => {
		const frames = decode_gif_frames(gif);
		const transformed = await transformInWorkers(
			frames,
			{x: 80, y: 45, width: 1040, height: 585, rotation: 0, resizeWidth: 854, resizeHeight: 480},
			wasmBytes,
		);
		return encodeInWorkers('gif', transformed, wasmBytes, {transferFrames: true});
	});
	benchSync('real WebP animated detection 4032x3024', 1000, () => (is_animated_image(webp) ? webp : webp));
	benchSync('real AVIF animated detection 3082x2048', 1000, () => (is_animated_image(avif) ? avif : avif));
	console.log(
		'WebP and AVIF decode/crop are routed through browser ImageDecoder or the native media bridge, not this Node wasm loader.',
	);
}

if (!isMainThread) {
	initWasm(workerData.wasmBytes);
	parentPort.on('message', (message) => {
		try {
			if (message.kind === 'apng') {
				const frames = message.frames.map(({frame, index}) => ({
					frame: encode_apng_frame_payload(frame),
					index,
				}));
				parentPort.postMessage(
					{ok: true, frames},
					frames.map(({frame}) => frame.compressed.buffer),
				);
				return;
			}
			if (message.kind === 'transform') {
				const frames = message.frames.map(({frame, index}) => {
					const transformed = crop_rotate_rgba(
						frame.rgba,
						frame.width,
						frame.height,
						message.cropParams.x,
						message.cropParams.y,
						message.cropParams.width,
						message.cropParams.height,
						message.cropParams.rotation,
						message.cropParams.resizeWidth,
						message.cropParams.resizeHeight,
					);
					return {frame: {...transformed, delayMs: frame.delayMs}, index};
				});
				parentPort.postMessage(
					{ok: true, frames},
					frames.map(({frame}) => frame.rgba.buffer),
				);
				return;
			}
			const frames = message.frames.map(({frame, index}) => ({
				frame: encode_gif_frame_chunk(frame, index === 0),
				index,
			}));
			parentPort.postMessage(
				{ok: true, frames},
				frames.map(({frame}) => frame.data.buffer),
			);
		} catch (error) {
			parentPort.postMessage({ok: false, error: error instanceof Error ? error.message : String(error)});
		}
	});
} else {
	if (downloadRealMediaOnly) {
		await loadRealMediaAssets({offline: false});
		console.log(`real media assets are local in ${mediaCacheDir.pathname}`);
		process.exit(0);
	}
	const wasmBytes = await readFile(wasmUrl);
	initWasm(wasmBytes);
	console.log(
		`libfluxcore benchmark (${workerCount} encode workers, profile=${profile}, SIMD=${process.env.FLUXCORE_WASM_SIMD === '1' ? 'on' : 'off'})`,
	);
	if (profile === 'highres') {
		await runHighResProfile(wasmBytes);
	} else if (profile === 'realmedia') {
		await runRealMediaProfile(wasmBytes);
	} else {
		await runStandardProfile(wasmBytes);
	}
}
