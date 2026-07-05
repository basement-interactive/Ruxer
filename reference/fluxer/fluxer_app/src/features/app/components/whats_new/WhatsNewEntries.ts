// SPDX-License-Identifier: AGPL-3.0-or-later

export interface WhatsNewEntry {
	id: string;
	date: Date;
	coverImage: string;
	content: string;
}

export const WHATS_NEW_ENTRIES: ReadonlyArray<WhatsNewEntry> = [];

export function hasWhatsNewEntries(): boolean {
	return WHATS_NEW_ENTRIES.length > 0;
}
