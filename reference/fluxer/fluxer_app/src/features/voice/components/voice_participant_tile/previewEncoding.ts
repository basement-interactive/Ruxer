// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	STREAM_PREVIEW_CONTENT_TYPE_JPEG,
	STREAM_PREVIEW_DIMENSION_SCALE_STEP,
	STREAM_PREVIEW_ENCODE_ATTEMPTS,
	STREAM_PREVIEW_JPEG_QUALITY_MIN,
	STREAM_PREVIEW_JPEG_QUALITY_START,
	STREAM_PREVIEW_JPEG_QUALITY_STEP,
	STREAM_PREVIEW_MAX_BYTES,
	STREAM_PREVIEW_MAX_DIMENSION_PX,
	STREAM_PREVIEW_MIN_DIMENSION_PX,
} from '@fluxer/constants/src/StreamConstants';

function getScaledDimensions(width: number, height: number, maxDimension: number): {width: number; height: number} {
	if (width <= maxDimension && height <= maxDimension) {
		return {width, height};
	}
	const scale = maxDimension / Math.max(width, height);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

function drawPreviewCanvas(
	source: CanvasImageSource,
	width: number,
	height: number,
	maxDimension: number,
): HTMLCanvasElement | null {
	const {width: targetWidth, height: targetHeight} = getScaledDimensions(width, height, maxDimension);
	const canvas = document.createElement('canvas');
	canvas.width = targetWidth;
	canvas.height = targetHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
	return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => {
		canvas.toBlob(resolve, STREAM_PREVIEW_CONTENT_TYPE_JPEG, quality);
	});
}

async function buildPreviewBlobFromSource(
	source: CanvasImageSource,
	width: number,
	height: number,
): Promise<Blob | null> {
	let quality = STREAM_PREVIEW_JPEG_QUALITY_START;
	let maxDimension = STREAM_PREVIEW_MAX_DIMENSION_PX;
	for (let attempt = 0; attempt < STREAM_PREVIEW_ENCODE_ATTEMPTS; attempt += 1) {
		const canvas = drawPreviewCanvas(source, width, height, maxDimension);
		if (!canvas) return null;
		let blob: Blob | null;
		try {
			blob = await canvasToBlob(canvas, quality);
		} finally {
			canvas.width = 0;
			canvas.height = 0;
		}
		if (!blob) return null;
		if (blob.size <= STREAM_PREVIEW_MAX_BYTES) {
			return blob;
		}
		if (quality > STREAM_PREVIEW_JPEG_QUALITY_MIN) {
			quality = Math.max(STREAM_PREVIEW_JPEG_QUALITY_MIN, quality - STREAM_PREVIEW_JPEG_QUALITY_STEP);
		} else if (maxDimension > STREAM_PREVIEW_MIN_DIMENSION_PX) {
			maxDimension = Math.max(
				STREAM_PREVIEW_MIN_DIMENSION_PX,
				Math.round(maxDimension * STREAM_PREVIEW_DIMENSION_SCALE_STEP),
			);
		}
	}
	return null;
}

export async function buildPreviewBlobFromVideo(videoEl: HTMLVideoElement): Promise<Blob | null> {
	if (videoEl.readyState < 2 || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) return null;
	return buildPreviewBlobFromSource(videoEl, videoEl.videoWidth, videoEl.videoHeight);
}

export async function buildPreviewBlobFromDataUrl(dataUrl: string): Promise<Blob | null> {
	const image = new Image();
	image.decoding = 'async';
	image.src = dataUrl;
	try {
		await image.decode();
	} catch {
		return null;
	}
	const width = image.naturalWidth || image.width;
	const height = image.naturalHeight || image.height;
	if (!width || !height) return null;
	return buildPreviewBlobFromSource(image, width, height);
}
