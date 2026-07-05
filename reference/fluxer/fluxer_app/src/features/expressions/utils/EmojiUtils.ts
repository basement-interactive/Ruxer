// SPDX-License-Identifier: AGPL-3.0-or-later

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import {convertToCodePoints} from '@app/features/expressions/utils/EmojiCodepointUtils';
import {MODE} from '@app/features/platform/types/Env';
import type {FC, SVGProps} from 'react';

const TWEMOJI_VERSION = '2';
const TWEMOJI_URL_CACHE_LIMIT = 2048;

type TwemojiComponent = FC<SVGProps<SVGSVGElement>>;
const TWEMOJI_URL_CACHE = new Map<string, string | null>();

export function fromHexCodePoint(hex: string): string {
	return String.fromCodePoint(Number.parseInt(hex, 16));
}

export function getTwemojiURL(codePoints: string): string | null {
	if (MODE === 'test' || !codePoints) {
		return null;
	}
	const key = `${RuntimeConfig.staticCdnEndpoint}:${codePoints}`;
	const cached = TWEMOJI_URL_CACHE.get(key);
	if (cached !== undefined) {
		return cached;
	}
	const url = `${RuntimeConfig.staticCdnEndpoint}/emoji/${codePoints}.svg?v=${TWEMOJI_VERSION}`;
	if (TWEMOJI_URL_CACHE.size >= TWEMOJI_URL_CACHE_LIMIT) {
		TWEMOJI_URL_CACHE.clear();
	}
	TWEMOJI_URL_CACHE.set(key, url);
	return url;
}

export function getEmojiURL(unicode: string): string | null {
	return getTwemojiURL(convertToCodePoints(unicode));
}

export function getTwemojiSvg(_codePoints: string): TwemojiComponent | null {
	return null;
}

export function getEmojiSvg(_unicode: string): TwemojiComponent | null {
	return null;
}
