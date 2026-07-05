// SPDX-License-Identifier: AGPL-3.0-or-later

export interface NativeFrame {
	rgba: Uint8Array;
	width: number;
	height: number;
	delayMs: number;
}

export interface NativeDecodedImage {
	frames: Array<NativeFrame>;
	width: number;
	height: number;
	hasAlpha: boolean;
}

export interface NativeBridge {
	sniff(buffer: Uint8Array): {
		mime: string;
		animated: boolean;
		frames: number;
	};
	decodeImage(buffer: Uint8Array): NativeDecodedImage;
	decodeHeic(buffer: Uint8Array): NativeFrame;
	decodeJxl(buffer: Uint8Array): NativeFrame;
	encodeAnimatedWebp(
		frames: Array<NativeFrame>,
		options?: {
			quality?: number;
			lossless?: boolean;
		},
	): Uint8Array;
	encodeAnimatedApng(frames: Array<NativeFrame>): Uint8Array;
	encodeAvif(
		rgba: Uint8Array,
		width: number,
		height: number,
		hasAlpha: boolean,
		options?: {
			quality?: number;
			speed?: number;
		},
	): Uint8Array;
}

declare global {
	var fluxerNativeMedia: NativeBridge | undefined;
}

export function getNativeBridge(): NativeBridge | null {
	return globalThis.fluxerNativeMedia ?? null;
}

export function hasNativeBridge(): boolean {
	return getNativeBridge() !== null;
}

export function __setNativeBridgeForTesting(bridge: NativeBridge | null): void {
	if (bridge === null) {
		delete globalThis.fluxerNativeMedia;
	} else {
		globalThis.fluxerNativeMedia = bridge;
	}
}

export type DecoderRoute = 'libfluxcore' | 'native' | 'browser' | 'unsupported';

export function pickDecoderRouteFor(mime: string, hasNative: boolean): DecoderRoute {
	const m = mime.toLowerCase();
	if (m === 'image/gif' || m === 'image/png' || m === 'image/apng' || m === 'image/jpeg') {
		return 'libfluxcore';
	}
	if (m === 'image/webp') {
		return hasNative ? 'native' : 'browser';
	}
	if (m === 'image/avif' || m === 'image/jxl') {
		return hasNative ? 'native' : 'browser';
	}
	if (m === 'image/heic' || m === 'image/heif') {
		return hasNative ? 'native' : 'unsupported';
	}
	if (m === 'application/json' || m === 'application/lottie+json') {
		return 'unsupported';
	}
	return 'unsupported';
}
