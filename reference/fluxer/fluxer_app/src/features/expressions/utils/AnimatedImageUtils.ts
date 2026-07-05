// SPDX-License-Identifier: AGPL-3.0-or-later

const GIF_EXT = '.gif';
const WEBP_EXT = '.webp';
const PNG_EXT = '.png';
const AVIF_EXT = '.avif';

export type AnimatedImageFormat = 'gif' | 'webp' | 'avif' | 'apng';

function getFileExtension(file: File): string {
	const name = (file.name || '').toLowerCase();
	const dotIndex = name.lastIndexOf('.');
	return dotIndex === -1 ? '' : name.substring(dotIndex);
}

export async function isAnimatedFile(file: File): Promise<boolean> {
	try {
		const arrayBuffer = await file.arrayBuffer();
		const {detectAnimatedImage} = await import('@app/features/platform/utils/LibFluxcore');
		return await detectAnimatedImage(new Uint8Array(arrayBuffer));
	} catch {
		return false;
	}
}

export function getAnimatedFormatLabel(file: File): string | null {
	const mime = (file.type || '').toLowerCase();
	const ext = getFileExtension(file);
	if (mime.includes('gif') || ext === GIF_EXT) {
		return 'GIF';
	}
	if (mime.includes('webp') || ext === WEBP_EXT) {
		return 'WebP';
	}
	if (mime.includes('png') || ext === PNG_EXT) {
		return 'APNG';
	}
	if (mime.includes('avif') || ext === AVIF_EXT) {
		return 'AVIF';
	}
	return null;
}

export function getAnimatedImageFormat(mime: string, ext?: string): AnimatedImageFormat {
	const lowerMime = mime.toLowerCase();
	const lowerExt = ext?.toLowerCase() || '';
	if (lowerMime.includes('gif') || lowerExt === '.gif') {
		return 'gif';
	}
	if (lowerMime.includes('webp') || lowerExt === '.webp') {
		return 'webp';
	}
	if (lowerMime.includes('avif') || lowerExt === '.avif') {
		return 'avif';
	}
	if (lowerMime.includes('png') || lowerExt === '.png') {
		return 'apng';
	}
	return 'gif';
}

export interface HandleAnimatedNonGifOptions {
	file: File;
	isGif: boolean;
	animated: boolean;
	onAnimatedAvif: () => void;
	onOtherAnimated: () => void;
}

export function shouldHandleAnimatedNonGifUpload({
	file,
	isGif,
	animated,
	onAnimatedAvif,
	onOtherAnimated,
}: HandleAnimatedNonGifOptions): boolean {
	if (!animated) {
		return false;
	}
	const format = getAnimatedImageFormat(file.type);
	if (isGif || format === 'gif' || format === 'apng') {
		return false;
	}
	if (format === 'avif') {
		onAnimatedAvif();
		return true;
	}
	onOtherAnimated();
	return true;
}
