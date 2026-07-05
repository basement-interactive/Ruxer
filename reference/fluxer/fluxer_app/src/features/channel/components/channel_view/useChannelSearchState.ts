// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import ChannelSearch, {getChannelSearchContextId} from '@app/features/channel/state/ChannelSearch';
import SelectedGuild from '@app/features/navigation/state/SelectedGuild';
import type {SearchSegment} from '@app/features/search/utils/SearchSegmentManager';
import {useCallback, useMemo} from 'react';

interface UseChannelSearchStateReturn {
	searchQuery: string;
	searchSegments: Array<SearchSegment>;
	activeSearchQuery: string;
	activeSearchSegments: Array<SearchSegment>;
	isSearchActive: boolean;
	searchRefreshKey: number;
	handleSearchInputChange: (query: string, segments: Array<SearchSegment>) => void;
	setIsSearchActive: (value: boolean) => void;
	handleSearchSubmit: (query: string, segments: Array<SearchSegment>) => void;
	handleSearchClose: () => void;
}

export const useChannelSearchState = (channel?: Channel): UseChannelSearchStateReturn => {
	const selectedGuildId = SelectedGuild.selectedGuildId;
	const contextId = useMemo(
		() => getChannelSearchContextId(channel ?? null, selectedGuildId),
		[channel?.guildId, channel?.id, selectedGuildId],
	);
	const context = contextId ? ChannelSearch.getContext(contextId) : null;
	const handleSearchInputChange = useCallback(
		(query: string, segments: Array<SearchSegment>) => {
			if (!contextId) {
				return;
			}
			ChannelSearch.setSearchInput(contextId, query, segments);
		},
		[contextId],
	);
	const handleSearchSubmit = useCallback(
		(query: string, segments: Array<SearchSegment>) => {
			if (!contextId) {
				return;
			}
			ChannelSearch.setSearchInput(contextId, query, segments);
			ChannelSearch.setActiveSearch(contextId, query, segments);
		},
		[contextId],
	);
	const handleSearchClose = useCallback(() => {
		if (!contextId) {
			return;
		}
		ChannelSearch.closeSearch(contextId);
	}, [contextId]);
	const setIsSearchActive = useCallback(
		(value: boolean) => {
			if (!contextId) {
				return;
			}
			ChannelSearch.setIsSearchActive(contextId, value);
		},
		[contextId],
	);
	return {
		searchQuery: context?.searchQuery ?? '',
		searchSegments: context?.searchSegments ?? [],
		activeSearchQuery: context?.activeSearchQuery ?? '',
		activeSearchSegments: context?.activeSearchSegments ?? [],
		isSearchActive: context?.isSearchActive ?? false,
		searchRefreshKey: context?.searchRefreshKey ?? 0,
		handleSearchInputChange,
		setIsSearchActive,
		handleSearchSubmit,
		handleSearchClose,
	};
};
