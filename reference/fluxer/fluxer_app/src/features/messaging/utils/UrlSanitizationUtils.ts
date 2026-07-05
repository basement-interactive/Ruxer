// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import UserSettings from '@app/features/user/state/UserSettings';
import {TidyURL} from '@protontech/tidy-url';

const logger = new Logger('UrlSanitizationUtils');
const URL_REGEX = /\bhttps?:\/\/[^\s<>'"`)\]]+/gi;
const TRAILING_PUNCT_REGEX = /[.,;:!?]+$/;
const CODE_REGEX = /```[\s\S]*?```|``[^`]*``|`[^`\n]*`/g;
const SENTINEL_PREFIX = 'FLUXER_URL_SANITIZER_CODE_';
const SENTINEL_SUFFIX = '';
const YOUTUBE_HOST_REGEX = /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;
const YOUTUBE_TRACKING_PARAMS = ['si', 'pp'];

function stripYoutubeTrackingParams(url: string): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}
	if (!YOUTUBE_HOST_REGEX.test(parsed.hostname)) return url;
	let mutated = false;
	for (const param of YOUTUBE_TRACKING_PARAMS) {
		if (parsed.searchParams.has(param)) {
			parsed.searchParams.delete(param);
			mutated = true;
		}
	}
	return mutated ? parsed.toString() : url;
}

function cleanSingleUrl(url: string): string {
	try {
		const result = TidyURL.clean(url);
		return stripYoutubeTrackingParams(result.url || url);
	} catch (error) {
		logger.warn('Failed to sanitize URL, leaving as-is:', error);
		return url;
	}
}

export function sanitizeUrlsInContent(content: string): string {
	if (!content) return content;
	const codeSegments: Array<string> = [];
	const masked = content.replace(CODE_REGEX, (match) => {
		const index = codeSegments.length;
		codeSegments.push(match);
		return `${SENTINEL_PREFIX}${index}${SENTINEL_SUFFIX}`;
	});
	const sanitized = masked.replace(URL_REGEX, (match) => {
		const trailing = TRAILING_PUNCT_REGEX.exec(match);
		const suffix = trailing ? trailing[0] : '';
		const trimmed = suffix ? match.slice(0, -suffix.length) : match;
		return cleanSingleUrl(trimmed) + suffix;
	});
	return sanitized.replace(
		new RegExp(`${SENTINEL_PREFIX}(\\d+)${SENTINEL_SUFFIX}`, 'g'),
		(_, idx: string) => codeSegments[Number(idx)] ?? '',
	);
}

export function maybeSanitizeOutgoingMessage(content: string | null | undefined): string {
	if (content == null || content.length === 0) return content ?? '';
	if (!UserSettings.getSanitizeUrls()) return content;
	return sanitizeUrlsInContent(content);
}
