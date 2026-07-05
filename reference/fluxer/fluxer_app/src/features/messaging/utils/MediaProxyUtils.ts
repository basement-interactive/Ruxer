// SPDX-License-Identifier: AGPL-3.0-or-later

import {MediaCapabilities, probeMediaCapabilities} from '@app/features/voice/utils/MediaCapabilities';

if (typeof window !== 'undefined') {
	void probeMediaCapabilities();
}

export interface MediaProxyOptions {
	width?: number;
	height?: number;
	format?: string;
	quality?: 'high' | 'low' | 'lossless';
	animated?: boolean;
}

const NATIVE_PREFERRED_FORMATS: ReadonlyMap<string, 'avif' | 'jxl'> = new Map([
	['image/jxl', 'jxl'],
	['image/avif', 'avif'],
]);

export function resolvePreferredImageFormat(sourceContentType?: string): 'webp' | undefined {
	if (!sourceContentType) return 'webp';
	const normalized = sourceContentType.toLowerCase().split(';')[0]!.trim();
	const native = NATIVE_PREFERRED_FORMATS.get(normalized);
	if (!native) return 'webp';
	const caps = MediaCapabilities.getSync();
	if (caps?.[native]) return undefined;
	return 'webp';
}

type FitInsideMediaProxyOptions = MediaProxyOptions & {
	width?: number;
	height?: number;
};

function isSvgProxyUrl(url: URL): boolean {
	const path = url.pathname.toLowerCase();
	return path.endsWith('.svg');
}

function appendMediaProxyParams(url: URL, options: MediaProxyOptions): void {
	if (isSvgProxyUrl(url)) {
		return;
	}
	const {width, height, format, quality, animated} = options;
	if (format) {
		url.searchParams.append('format', format);
	}
	if (width !== undefined) {
		url.searchParams.append('width', width.toString());
	}
	if (height !== undefined) {
		url.searchParams.append('height', height.toString());
	}
	if (quality) {
		url.searchParams.append('quality', quality);
	}
	if (animated !== undefined) {
		url.searchParams.append('animated', animated.toString());
	}
}

function getFitInsideProxyOptions(options: FitInsideMediaProxyOptions): MediaProxyOptions {
	const {width, height, ...rest} = options;
	if (width !== undefined && height !== undefined) {
		return {...rest, width};
	}
	return options;
}

export function buildMediaProxyURL(originalUrl: string, options: MediaProxyOptions = {}): string {
	if (!originalUrl) return originalUrl;
	const url = new URL(originalUrl);
	appendMediaProxyParams(url, options);
	return url.toString();
}

export function buildFitInsideMediaProxyURL(originalUrl: string, options: FitInsideMediaProxyOptions = {}): string {
	if (!originalUrl) return originalUrl;
	const url = new URL(originalUrl);
	appendMediaProxyParams(url, getFitInsideProxyOptions(options));
	return url.toString();
}

export function stripMediaProxyParams(proxyURL: string): string {
	const url = new URL(proxyURL);
	url.searchParams.delete('width');
	url.searchParams.delete('height');
	url.searchParams.delete('format');
	url.searchParams.delete('quality');
	url.searchParams.delete('animated');
	return url.toString();
}

export function buildAnimatedImageProxyURL(proxyURL: string, width?: number, height?: number): string {
	if (!proxyURL) return proxyURL;
	const baseURL = stripMediaProxyParams(proxyURL);
	return buildMediaProxyURL(baseURL, {
		width,
		height,
		animated: true,
	});
}

export function buildFittedAnimatedImageProxyURL(proxyURL: string, width?: number, height?: number): string {
	if (!proxyURL) return proxyURL;
	const baseURL = stripMediaProxyParams(proxyURL);
	return buildFitInsideMediaProxyURL(baseURL, {
		width,
		height,
		animated: true,
	});
}

export function buildStaticGifPreviewURL(proxyURL: string, width?: number, height?: number): string {
	if (!proxyURL) return proxyURL;
	return buildMediaProxyURL(stripMediaProxyParams(proxyURL), {
		format: 'webp',
		width,
		height,
		animated: false,
	});
}

export function buildFittedStaticGifPreviewURL(proxyURL: string, width?: number, height?: number): string {
	if (!proxyURL) return proxyURL;
	return buildFitInsideMediaProxyURL(stripMediaProxyParams(proxyURL), {
		format: 'webp',
		width,
		height,
		animated: false,
	});
}
