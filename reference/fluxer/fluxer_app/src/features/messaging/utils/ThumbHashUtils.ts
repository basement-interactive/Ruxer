// SPDX-License-Identifier: AGPL-3.0-or-later

import {thumbHashToDataURL} from 'thumbhash';

const THUMBHASH_DATA_URL_CACHE_CAPACITY = 1024;
const thumbHashDataUrlCache = new Map<string, string | undefined>();

export function decodeThumbHashDataURL(placeholder?: string | null): string | undefined {
	if (!placeholder) return undefined;
	if (thumbHashDataUrlCache.has(placeholder)) {
		return thumbHashDataUrlCache.get(placeholder);
	}
	let dataUrl: string | undefined;
	try {
		const bytes = Uint8Array.from(atob(placeholder), (c) => c.charCodeAt(0));
		dataUrl = thumbHashToDataURL(bytes);
	} catch {
		dataUrl = undefined;
	}
	thumbHashDataUrlCache.set(placeholder, dataUrl);
	if (thumbHashDataUrlCache.size > THUMBHASH_DATA_URL_CACHE_CAPACITY) {
		const firstKey = thumbHashDataUrlCache.keys().next().value;
		if (firstKey !== undefined) {
			thumbHashDataUrlCache.delete(firstKey);
		}
	}
	return dataUrl;
}
