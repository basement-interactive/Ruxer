// SPDX-License-Identifier: AGPL-3.0-or-later

import type {SearchHistoryEntry} from '@app/features/search/state/SearchHistory';
import {type SearchHints, tokenize} from '@app/features/search/utils/SearchQueryParser';
import type {SearchSegment} from '@app/features/search/utils/SearchSegmentManager';
import * as NicknameUtils from '@app/features/user/utils/NicknameUtils';

const USER_FILTER_KEYS = new Set(['from', 'mentions']);

function unquoteTokenValue(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length < 2) return trimmed;
	const first = trimmed[0];
	const last = trimmed[trimmed.length - 1];
	if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function replaceAllLiteral(value: string, search: string, replacement: string): string {
	if (search.length === 0 || search === replacement) return value;
	return value.split(search).join(replacement);
}

export function formatSearchHistoryEntryForStreamerMode(entry: SearchHistoryEntry): SearchHistoryEntry {
	const usersByTag = entry.hints?.usersByTag;
	if (!usersByTag || Object.keys(usersByTag).length === 0) {
		return entry;
	}
	let query = entry.query;
	const nextUsersByTag: Record<string, string> = {...usersByTag};
	for (const [tag, userId] of Object.entries(usersByTag)) {
		const formattedTag = NicknameUtils.formatTagForStreamerMode(tag);
		if (formattedTag === tag) {
			continue;
		}
		query = replaceAllLiteral(query, tag, formattedTag);
		nextUsersByTag[formattedTag] = userId;
	}
	if (query === entry.query) {
		return entry;
	}
	const hints: SearchHints = {
		...entry.hints,
		usersByTag: nextUsersByTag,
	};
	return {...entry, query, hints};
}

export function buildSearchSegmentsFromHints(query: string, hints?: SearchHints): Array<SearchSegment> {
	const segments: Array<SearchSegment> = [];
	if (!hints) {
		return segments;
	}
	const {tokens} = tokenize(query);
	for (const token of tokens) {
		const filterKey = token.exclude ? `-${token.key}` : token.key;
		const normalizedFilterKey = token.key.startsWith('-') ? token.key.slice(1) : token.key;
		const value = unquoteTokenValue(token.value);
		if (USER_FILTER_KEYS.has(normalizedFilterKey)) {
			const userId = hints.usersByTag?.[value];
			if (userId) {
				segments.push({
					type: 'user',
					filterKey,
					id: userId,
					displayText: token.raw,
					start: token.start,
					end: token.end,
				});
			}
			continue;
		}
		if (normalizedFilterKey === 'in') {
			const channelId = hints.channelsByName?.[value];
			if (channelId) {
				segments.push({
					type: 'channel',
					filterKey,
					id: channelId,
					displayText: token.raw,
					start: token.start,
					end: token.end,
				});
			}
		}
	}
	return segments;
}
