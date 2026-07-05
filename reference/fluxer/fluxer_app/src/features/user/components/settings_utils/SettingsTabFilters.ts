// SPDX-License-Identifier: AGPL-3.0-or-later

import type {SettingsTab} from '@app/features/user/components/settings_utils/SettingsConstants';
import {
	getMatchedTabTypes,
	type SettingsSearchResult,
	searchSettings,
} from '@app/features/user/components/settings_utils/SettingsSearchIndex';

export interface FilteredSettingsResult {
	groupedTabs: Record<string, Array<SettingsTab>>;
	searchResults: Array<SettingsSearchResult>;
}

export const filterSettingsTabsByQuery = (
	groupedTabs: Record<string, Array<SettingsTab>>,
	query: string,
): FilteredSettingsResult => {
	const trimmedQuery = query['trim']();
	if (trimmedQuery.length === 0) {
		return {groupedTabs, searchResults: []};
	}
	const allTabs = Object.values(groupedTabs).flat();
	const searchResults = searchSettings(trimmedQuery, allTabs);
	const matchedTabTypes = getMatchedTabTypes(searchResults);
	const filtered: Record<string, Array<SettingsTab>> = {};
	Object.entries(groupedTabs).forEach(([category, tabs]) => {
		const matchedTabs = tabs.filter((tab) => matchedTabTypes.has(tab.type));
		if (matchedTabs.length > 0) {
			filtered[category] = matchedTabs;
		}
	});
	return {groupedTabs: filtered, searchResults};
};
