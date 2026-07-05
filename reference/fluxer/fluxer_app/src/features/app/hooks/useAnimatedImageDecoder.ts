// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	drawVideoFrameToCanvas,
	type FluxerImageDecoderConstructor,
	type FluxerImageDecoderInstance,
	getImageDecoderConstructor,
} from '@app/features/platform/utils/ImageDecoderInterop';
import {useEffect, useRef, useState} from 'react';

interface UseAnimatedImageDecoderOptions {
	src: string | null;
	playing: boolean;
	canvas: HTMLCanvasElement | null;
	maxCachedFrames?: number;
}

export interface AnimatedImageDecoderState {
	supported: boolean;
	loaded: boolean;
	error: boolean;
	naturalWidth: number;
	naturalHeight: number;
}

export interface AnimatedImageFrameAdvanceState {
	frameIndex: number;
	frameCount: number;
	repetitionCount: number;
	completedRepetitions: number;
}

export interface AnimatedImageFrameAdvanceResult {
	frameIndex: number;
	completedRepetitions: number;
}

const DEFAULT_FRAME_DURATION_MS = 100;
const DEFAULT_MAX_CACHED_FRAMES = 24;

interface CachedAnimatedImageFrame {
	image: CanvasImageSource;
	width: number;
	height: number;
	durationMs: number;
	close: () => void;
}

const guessMimeFromUrl = (url: string): string => {
	const lower = url.split('?')[0]?.toLowerCase() ?? '';
	if (lower.endsWith('.webp')) return 'image/webp';
	if (lower.endsWith('.gif')) return 'image/gif';
	if (lower.endsWith('.apng') || lower.endsWith('.png')) return 'image/png';
	if (lower.endsWith('.avif')) return 'image/avif';
	return 'image/webp';
};

function normalizeRepetitionCount(repetitionCount: number): number {
	if (repetitionCount === Infinity) return Infinity;
	if (!Number.isFinite(repetitionCount)) return 0;
	return Math.max(0, Math.floor(repetitionCount));
}

async function createCachedAnimatedImageFrame(
	image: VideoFrame,
	durationMs: number,
): Promise<CachedAnimatedImageFrame> {
	const width = image.displayWidth;
	const height = image.displayHeight;
	if (typeof createImageBitmap === 'function') {
		try {
			const bitmap = await createImageBitmap(image as unknown as ImageBitmapSource);
			image.close();
			return {
				image: bitmap,
				width,
				height,
				durationMs,
				close: () => bitmap.close(),
			};
		} catch {}
	}
	return {
		image: image as unknown as CanvasImageSource,
		width,
		height,
		durationMs,
		close: () => image.close(),
	};
}

export function getNextAnimatedImageFrame({
	frameIndex,
	frameCount,
	repetitionCount,
	completedRepetitions,
}: AnimatedImageFrameAdvanceState): AnimatedImageFrameAdvanceResult | null {
	const normalizedFrameCount = Math.max(0, Math.floor(frameCount));
	if (normalizedFrameCount <= 1) return null;
	const currentFrameIndex = Math.max(0, Math.min(normalizedFrameCount - 1, Math.floor(frameIndex)));
	const normalizedCompletedRepetitions = Math.max(0, Math.floor(completedRepetitions));
	if (currentFrameIndex < normalizedFrameCount - 1) {
		return {frameIndex: currentFrameIndex + 1, completedRepetitions: normalizedCompletedRepetitions};
	}
	const normalizedRepetitionCount = normalizeRepetitionCount(repetitionCount);
	if (normalizedCompletedRepetitions >= normalizedRepetitionCount) return null;
	return {frameIndex: 0, completedRepetitions: normalizedCompletedRepetitions + 1};
}

export function useAnimatedImageDecoder({
	src,
	playing,
	canvas,
	maxCachedFrames = DEFAULT_MAX_CACHED_FRAMES,
}: UseAnimatedImageDecoderOptions): AnimatedImageDecoderState {
	const [state, setState] = useState<AnimatedImageDecoderState>(() => ({
		supported: getImageDecoderConstructor() !== null,
		loaded: false,
		error: false,
		naturalWidth: 0,
		naturalHeight: 0,
	}));
	const runnerRef = useRef<{
		kick: () => void;
		pause: () => void;
		cancelled: boolean;
	} | null>(null);
	const playingRef = useRef(playing);
	playingRef.current = playing;
	useEffect(() => {
		const Ctor = getImageDecoderConstructor();
		if (!Ctor || !src || !canvas) {
			if (!Ctor) setState((prev) => ({...prev, supported: false}));
			return;
		}
		const ctx = canvas.getContext('2d', {alpha: true});
		if (!ctx) {
			setState((prev) => ({...prev, error: true}));
			return;
		}
		const normalizedMaxCachedFrames = Number.isFinite(maxCachedFrames)
			? Math.max(2, Math.floor(maxCachedFrames))
			: DEFAULT_MAX_CACHED_FRAMES;
		const runner = {cancelled: false, kick: () => {}, pause: () => {}};
		runnerRef.current = runner;
		let decoder: FluxerImageDecoderInstance | null = null;
		let frameCount = Number.POSITIVE_INFINITY;
		let repetitionCount = 0;
		let completedRepetitions = 0;
		let frameIndex = 0;
		let timer: number | null = null;
		let resolveTimer: (() => void) | null = null;
		let advancing = false;
		const frameCache = new Map<number, CachedAnimatedImageFrame>();
		setState((prev) => ({...prev, loaded: false, error: false, supported: true}));
		const clearTimer = () => {
			if (timer != null) {
				window.clearTimeout(timer);
				timer = null;
			}
			resolveTimer?.();
			resolveTimer = null;
		};
		const draw = (frame: CachedAnimatedImageFrame) => {
			if (runner.cancelled) return;
			const w = frame.width;
			const h = frame.height;
			if (canvas.width !== w) canvas.width = w;
			if (canvas.height !== h) canvas.height = h;
			try {
				ctx.clearRect(0, 0, w, h);
				ctx.drawImage(frame.image, 0, 0, w, h);
			} catch {}
		};
		const getFrame = async (index: number) => {
			const cached = frameCache.get(index);
			if (cached) {
				frameCache.delete(index);
				frameCache.set(index, cached);
				return cached;
			}
			if (!decoder) return null;
			try {
				const result = await decoder.decode({frameIndex: index, completeFramesOnly: true});
				if (runner.cancelled) {
					result.image.close();
					return null;
				}
				const durationMs = (result.image.duration ?? DEFAULT_FRAME_DURATION_MS * 1000) / 1000;
				const entry = await createCachedAnimatedImageFrame(result.image, durationMs);
				if (runner.cancelled) {
					entry.close();
					return null;
				}
				frameCache.set(index, entry);
				while (frameCache.size > normalizedMaxCachedFrames) {
					const oldestIndex = frameCache.keys().next().value;
					if (oldestIndex === undefined) break;
					const oldest = frameCache.get(oldestIndex);
					frameCache.delete(oldestIndex);
					oldest?.close();
				}
				return entry;
			} catch {
				return null;
			}
		};
		const advance = async () => {
			if (advancing || runner.cancelled) return;
			advancing = true;
			try {
				while (!runner.cancelled && playingRef.current) {
					const next = getNextAnimatedImageFrame({
						frameIndex,
						frameCount,
						repetitionCount,
						completedRepetitions,
					});
					if (!next) return;
					const frame = await getFrame(next.frameIndex);
					if (!frame || runner.cancelled || !playingRef.current) return;
					frameIndex = next.frameIndex;
					completedRepetitions = next.completedRepetitions;
					draw(frame);
					await new Promise<void>((resolve) => {
						clearTimer();
						resolveTimer = resolve;
						timer = window.setTimeout(
							() => {
								timer = null;
								resolveTimer = null;
								resolve();
							},
							Math.max(16, frame.durationMs),
						);
					});
					if (runner.cancelled || !playingRef.current) return;
				}
			} finally {
				advancing = false;
			}
		};
		runner.kick = () => {
			if (runner.cancelled) return;
			void advance();
		};
		runner.pause = () => {
			clearTimer();
		};
		const start = async () => {
			try {
				const response = await fetch(src, {cache: 'force-cache'});
				if (runner.cancelled) return;
				if (!response.ok || !response.body) {
					setState((prev) => ({...prev, error: true}));
					return;
				}
				const type = response.headers.get('content-type') ?? guessMimeFromUrl(src);
				const isSupported = await Ctor.isTypeSupported(type).catch(() => false);
				if (!isSupported) {
					setState((prev) => ({...prev, supported: false}));
					return;
				}
				if (runner.cancelled) return;
				decoder = new Ctor({data: response.body, type, preferAnimation: true});
				await decoder.completed;
				if (runner.cancelled) return;
				const track = decoder.tracks.selectedTrack;
				frameCount = track?.frameCount ?? 1;
				repetitionCount = track?.repetitionCount ?? 0;
				const first = await getFrame(0);
				if (!first || runner.cancelled) return;
				draw(first);
				setState({
					supported: true,
					loaded: true,
					error: false,
					naturalWidth: first.width,
					naturalHeight: first.height,
				});
				if (playingRef.current && frameCount > 1) {
					void advance();
				}
			} catch {
				if (!runner.cancelled) setState((prev) => ({...prev, error: true}));
			}
		};
		void start();
		return () => {
			runner.cancelled = true;
			clearTimer();
			frameCache.forEach((frame) => frame.close());
			frameCache.clear();
			decoder?.close();
			if (runnerRef.current === runner) runnerRef.current = null;
		};
	}, [canvas, maxCachedFrames, src]);
	useEffect(() => {
		if (playing) {
			runnerRef.current?.kick();
			return;
		}
		runnerRef.current?.pause();
	}, [playing]);
	return state;
}

export interface DecodedImageFrames {
	frames: Array<ImageData>;
	delays: Array<number>;
	width: number;
	height: number;
	ready: boolean;
	error: Error | null;
}

interface UseDecodedImageFramesOptions {
	bytes: Uint8Array | null;
	mime: string | null;
}

const HEIC_MIMES = new Set(['image/heic', 'image/heif']);

export function useDecodedImageFrames({bytes, mime}: UseDecodedImageFramesOptions): DecodedImageFrames {
	const [state, setState] = useState<DecodedImageFrames>(() => ({
		frames: [],
		delays: [],
		width: 0,
		height: 0,
		ready: false,
		error: null,
	}));
	useEffect(() => {
		if (!bytes || !mime) return;
		let cancelled = false;
		(async () => {
			try {
				const result = await decodeAllFrames(bytes, mime);
				if (cancelled) return;
				setState({...result, ready: true, error: null});
			} catch (err) {
				if (cancelled) return;
				setState({
					frames: [],
					delays: [],
					width: 0,
					height: 0,
					ready: false,
					error: err instanceof Error ? err : new Error(String(err)),
				});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [bytes, mime]);
	return state;
}

async function decodeAllFrames(
	bytes: Uint8Array,
	mime: string,
): Promise<{
	frames: Array<ImageData>;
	delays: Array<number>;
	width: number;
	height: number;
}> {
	const Cls = getImageDecoderConstructor();
	const lower = mime.toLowerCase();
	if (HEIC_MIMES.has(lower)) {
		const frame = await decodeStaticViaImage(bytes, lower);
		return {frames: [frame.image], delays: [0], width: frame.width, height: frame.height};
	}
	if (Cls && (await Cls.isTypeSupported(lower).catch(() => false))) {
		return decodeAllFramesViaImageDecoder(bytes, lower, Cls);
	}
	const frame = await decodeStaticViaImage(bytes, lower);
	return {frames: [frame.image], delays: [0], width: frame.width, height: frame.height};
}

async function decodeAllFramesViaImageDecoder(
	bytes: Uint8Array,
	type: string,
	Cls: FluxerImageDecoderConstructor,
): Promise<{
	frames: Array<ImageData>;
	delays: Array<number>;
	width: number;
	height: number;
}> {
	const decoder = new Cls({data: bytes, type, preferAnimation: true});
	try {
		await decoder.completed;
		const track = decoder.tracks.selectedTrack;
		const count = Math.max(1, track?.frameCount ?? 1);
		const frames: Array<ImageData> = [];
		const delays: Array<number> = [];
		let width = 0;
		let height = 0;
		for (let i = 0; i < count; i++) {
			const {image} = await decoder.decode({frameIndex: i, completeFramesOnly: true});
			try {
				const w = image.displayWidth;
				const h = image.displayHeight;
				width = w;
				height = h;
				const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : null;
				if (!canvas) throw new Error('OffscreenCanvas unavailable for ImageDecoder fallback');
				const ctx = canvas.getContext('2d');
				if (!ctx) throw new Error('failed to acquire 2d context');
				drawVideoFrameToCanvas(ctx, image);
				const data = ctx.getImageData(0, 0, w, h);
				frames.push(new ImageData(new Uint8ClampedArray(data.data), w, h));
				delays.push((image.duration ?? 0) / 1000);
			} finally {
				image.close();
			}
		}
		return {frames, delays, width, height};
	} finally {
		decoder.close();
	}
}

async function decodeStaticViaImage(
	bytes: Uint8Array,
	mime: string,
): Promise<{
	image: ImageData;
	width: number;
	height: number;
}> {
	if (typeof Image === 'undefined' || typeof URL === 'undefined') {
		throw new Error('static decode unavailable: no Image/URL globals');
	}
	const blob = new Blob([new Uint8Array(bytes)], {type: mime});
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		img.src = url;
		if (typeof img.decode === 'function') {
			await img.decode();
		} else {
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error(`failed to decode ${mime}`));
			});
		}
		const w = img.naturalWidth;
		const h = img.naturalHeight;
		if (w === 0 || h === 0) throw new Error(`failed to decode ${mime}: zero dimensions`);
		const canvas =
			typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
		if (canvas instanceof HTMLCanvasElement) {
			canvas.width = w;
			canvas.height = h;
		}
		const ctx = (canvas as OffscreenCanvas | HTMLCanvasElement).getContext('2d');
		if (!ctx) throw new Error('failed to acquire 2d context for static decode');
		(ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).drawImage(img, 0, 0);
		const data = (ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).getImageData(0, 0, w, h);
		return {image: new ImageData(new Uint8ClampedArray(data.data), w, h), width: w, height: h};
	} finally {
		URL.revokeObjectURL(url);
	}
}
