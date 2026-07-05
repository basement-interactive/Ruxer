// SPDX-License-Identifier: AGPL-3.0-or-later

import {makePersistent} from '@app/features/platform/utils/MobXPersistence';
import type {SearchHints} from '@app/features/search/utils/SearchQueryParser';
import {action, makeAutoObservable} from 'mobx';

export interface SearchHistoryEntry {
	query: string;
	hints?: SearchHints;
	ts: number;
}

class SearchHistory {
	entriesByChannel: Record<string, Array<SearchHistoryEntry>> = {};

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		void makePersistent(this, 'SearchHistory', ['entriesByChannel']);
	}

	private getEntries(channelId?: string): Array<SearchHistoryEntry> {
		if (!channelId) return [];
		return this.entriesByChannel[channelId] ?? [];
	}

	recent(channelId?: string): ReadonlyArray<SearchHistoryEntry> {
		return this.getEntries(channelId);
	}

	search(term: string, channelId?: string): ReadonlyArray<SearchHistoryEntry> {
		const entries = this.getEntries(channelId);
		const t = term.trim().toLowerCase();
		if (!t) return entries;
		return entries.filter((e) => e.query.toLowerCase().includes(t));
	}

	@action
	add(query: string, channelId?: string, hints?: SearchHints): void {
		if (!channelId) return;
		const q = query.trim();
		if (!q) return;
		if (!this.entriesByChannel[channelId]) {
			this.entriesByChannel[channelId] = [];
		}
		const entries = this.entriesByChannel[channelId];
		const ts = Date.now();
		const existingIdx = entries.findIndex((e) => e.query === q);
		const entry: SearchHistoryEntry = {query: q, hints, ts};
		if (existingIdx !== -1) {
			entries.splice(existingIdx, 1);
		}
		entries.unshift(entry);
		if (entries.length > 10) {
			this.entriesByChannel[channelId] = entries.slice(0, 10);
		}
	}

	@action
	clear(channelId?: string): void {
		if (!channelId) return;
		delete this.entriesByChannel[channelId];
	}

	@action
	clearAll(): void {
		this.entriesByChannel = {};
	}
}

export default new SearchHistory();
