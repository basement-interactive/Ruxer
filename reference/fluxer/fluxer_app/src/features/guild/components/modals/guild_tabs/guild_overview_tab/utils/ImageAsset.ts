// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ImageDimensions} from '@app/features/expressions/utils/AssetImageGeometry';
import {getImageUploadMimeType} from '@app/features/expressions/utils/ImageUploadFileUtils';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function isGif(file: File): boolean {
	const type = (file.type || '').toLowerCase();
	if (type === 'image/gif') return true;
	const name = (file.name || '').toLowerCase();
	return name.endsWith('.gif');
}

export function revokeObjectUrl(url: string | null | undefined): void {
	if (!url) return;
	if (!url.startsWith('blob:')) return;
	try {
		URL.revokeObjectURL(url);
	} catch {}
}

export function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error('Failed to read blob as data URL'));
		reader.readAsDataURL(blob);
	});
}

export function getSafeImageMimeType(file: File): string {
	return getImageUploadMimeType(file);
}

export function getImageDimensionsFromDataUrl(dataUrl: string): Promise<ImageDimensions> {
	if (typeof Image === 'undefined') {
		return Promise.reject(new Error('Image API is unavailable'));
	}
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			if (img.naturalWidth > 0 && img.naturalHeight > 0) {
				resolve({width: img.naturalWidth, height: img.naturalHeight});
			} else {
				reject(new Error('Invalid image dimensions'));
			}
			img.onload = null;
			img.onerror = null;
		};
		img.onerror = () => {
			reject(new Error('Failed to load image'));
			img.onload = null;
			img.onerror = null;
		};
		img.src = dataUrl;
	});
}
