// SPDX-License-Identifier: AGPL-3.0-or-later

const PROXY_EMBEDDABLE_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg']);
const PROXY_EMBEDDABLE_IMAGE_MIME_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/avif',
	'image/svg+xml',
	'image/svg',
]);

function normaliseMimeType(mimeType: string): string {
	return mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
}

export function isEmbeddableImageFile(file: Pick<File, 'type' | 'name'>): boolean {
	const mimeType = normaliseMimeType(file.type);
	const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
	return (
		(mimeType.length > 0 && PROXY_EMBEDDABLE_IMAGE_MIME_TYPES.has(mimeType)) ||
		PROXY_EMBEDDABLE_IMAGE_EXTENSIONS.has(extension)
	);
}
