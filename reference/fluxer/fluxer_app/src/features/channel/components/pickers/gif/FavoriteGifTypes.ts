// SPDX-License-Identifier: AGPL-3.0-or-later

export interface FavoriteGifMediaFormat {
	src: string;
	proxy_src: string;
	width: number;
	height: number;
}

export interface FavoriteGifEntry {
	url: string;
	proxy_url: string;
	width: number;
	height: number;
	media: Record<string, FavoriteGifMediaFormat>;
	content_type: string;
	placeholder: string | null;
}

const PREVIEW_FORMAT_PRIORITY = ['webm', 'mp4', 'tinywebm', 'tinymp4', 'webp', 'gif', 'tinygif', 'nanogif'] as const;
const VIDEO_FORMAT_KEYS = new Set(['webm', 'mp4', 'tinywebm', 'tinymp4']);
const FORMAT_CONTENT_TYPES: Record<string, string> = {
	webm: 'video/webm',
	tinywebm: 'video/webm',
	mp4: 'video/mp4',
	tinymp4: 'video/mp4',
	webp: 'image/webp',
	gif: 'image/gif',
	tinygif: 'image/gif',
	nanogif: 'image/gif',
};

export function pickBestPreviewFormat(
	media: Record<string, FavoriteGifMediaFormat> | null | undefined,
): {key: string; format: FavoriteGifMediaFormat} | null {
	if (!media) return null;
	for (const key of PREVIEW_FORMAT_PRIORITY) {
		const format = media[key];
		if (format?.src && format.proxy_src && format.width > 0 && format.height > 0) {
			return {key, format};
		}
	}
	for (const [key, format] of Object.entries(media)) {
		if (format?.src && format.proxy_src && format.width > 0 && format.height > 0) {
			return {key, format};
		}
	}
	return null;
}

export function inferFormatContentType(formatKey: string): string {
	return FORMAT_CONTENT_TYPES[formatKey] ?? '';
}

export function isVideoFormatKey(formatKey: string): boolean {
	return VIDEO_FORMAT_KEYS.has(formatKey);
}
