// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import type {MessageSearchScope, SearchValueOption} from '@app/features/search/utils/SearchUtils';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const CURRENT_DM_DESCRIPTOR = msg({
	message: 'Current DM',
	comment: 'Message search scope option label. Limits search to the current DM channel.',
});
const SEARCH_ONLY_IN_THE_CURRENT_DM_DESCRIPTOR = msg({
	message: 'Search only in the current DM',
	comment: 'Description for the Current DM message search scope option.',
});
const ALL_DMS_DESCRIPTOR = msg({
	message: 'All DMs',
	comment: 'Message search scope option label. Searches across every DM the user has ever had.',
});
const ACROSS_ALL_DMS_YOU_VE_EVER_BEEN_IN_DESCRIPTOR = msg({
	message: "Across all DMs you've ever been in",
	comment: 'Description for the All DMs message search scope option.',
});
const OPEN_DMS_DESCRIPTOR = msg({
	message: 'Open DMs',
	comment: 'Message search scope option label. Searches across DMs that are currently open in the sidebar.',
});
const ACROSS_ALL_DMS_YOU_CURRENTLY_HAVE_OPEN_DESCRIPTOR = msg({
	message: 'Across all open DMs',
	comment: 'Description for the Open DMs message search scope option.',
});
const ALL_DMS_COMMUNITIES_DESCRIPTOR = msg({
	message: 'All DMs + communities',
	comment: 'Message search scope menu item. Searches across all DMs and all joined communities.',
});
const ACROSS_ALL_DMS_YOU_VE_EVER_BEEN_IN_2_DESCRIPTOR = msg({
	message: "Across all DMs you've ever been in + every community you're in",
	comment: 'Description for the All DMs + communities message search scope option.',
});
const OPEN_DMS_COMMUNITIES_DESCRIPTOR = msg({
	message: 'Open DMs + communities',
	comment: 'Message search scope menu item. Searches across currently open DMs plus all joined communities.',
});
const ACROSS_ALL_DMS_YOU_CURRENTLY_HAVE_OPEN_ALL_DESCRIPTOR = msg({
	message: "Across all open DMs + every community you're in",
	comment: 'Description for the Open DMs + communities message search scope option.',
});
const CURRENT_COMMUNITY_DESCRIPTOR = msg({
	message: 'Current community',
	comment: 'Message search scope menu item. Limits search to the current community.',
});
const SEARCH_ONLY_IN_THE_CURRENT_COMMUNITY_DESCRIPTOR = msg({
	message: 'Search only in the current community',
	comment: 'Description for the Current community message search scope option.',
});
const ALL_COMMUNITIES_DESCRIPTOR = msg({
	message: 'All communities',
	comment: 'Message search scope menu item. Searches across every joined community.',
});
const ACROSS_ALL_COMMUNITIES_YOU_RE_CURRENTLY_IN_DESCRIPTOR = msg({
	message: "Across every community you're in",
	comment: 'Description for the All communities message search scope option.',
});
const ALL_DMS_ONLY_DESCRIPTOR = msg({
	message: 'All DMs only',
	comment:
		'Message search scope option label. Searches only DMs, excluding communities. Used when starting from a community scope.',
});
const ACROSS_ALL_DMS_YOU_VE_EVER_BEEN_IN_3_DESCRIPTOR = msg({
	message: "Across all DMs you've ever been in only",
	comment: 'Description for the All DMs only message search scope option (community-context variant).',
});
const OPEN_DMS_ONLY_DESCRIPTOR = msg({
	message: 'Open DMs only',
	comment:
		'Message search scope option label. Searches only currently open DMs, excluding communities. Used when starting from a community scope.',
});
const ACROSS_ALL_DMS_YOU_CURRENTLY_HAVE_OPEN_ONLY_DESCRIPTOR = msg({
	message: 'Across all open DMs only',
	comment: 'Description for the Open DMs only message search scope option (community-context variant).',
});

export interface ScopeValueOption extends SearchValueOption {
	value: MessageSearchScope;
}

export const DEFAULT_SCOPE_VALUE: MessageSearchScope = 'current';
export const getScopeOptionsForChannel = (i18n: I18n, channel?: Channel | null): Array<ScopeValueOption> => {
	const DM_SCOPE_OPTIONS: Array<ScopeValueOption> = [
		{
			value: 'current',
			label: i18n._(CURRENT_DM_DESCRIPTOR),
			isDefault: true,
			description: i18n._(SEARCH_ONLY_IN_THE_CURRENT_DM_DESCRIPTOR),
		},
		{
			value: 'all_dms',
			label: i18n._(ALL_DMS_DESCRIPTOR),
			description: i18n._(ACROSS_ALL_DMS_YOU_VE_EVER_BEEN_IN_DESCRIPTOR),
		},
		{
			value: 'open_dms',
			label: i18n._(OPEN_DMS_DESCRIPTOR),
			description: i18n._(ACROSS_ALL_DMS_YOU_CURRENTLY_HAVE_OPEN_DESCRIPTOR),
		},
		{
			value: 'all',
			label: i18n._(ALL_DMS_COMMUNITIES_DESCRIPTOR),
			description: i18n._(ACROSS_ALL_DMS_YOU_VE_EVER_BEEN_IN_2_DESCRIPTOR),
		},
		{
			value: 'open_dms_and_all_guilds',
			label: i18n._(OPEN_DMS_COMMUNITIES_DESCRIPTOR),
			description: i18n._(ACROSS_ALL_DMS_YOU_CURRENTLY_HAVE_OPEN_ALL_DESCRIPTOR),
		},
	];
	const GUILD_SCOPE_OPTIONS: Array<ScopeValueOption> = [
		{
			value: 'current',
			label: i18n._(CURRENT_COMMUNITY_DESCRIPTOR),
			isDefault: true,
			description: i18n._(SEARCH_ONLY_IN_THE_CURRENT_COMMUNITY_DESCRIPTOR),
		},
		{
			value: 'all_guilds',
			label: i18n._(ALL_COMMUNITIES_DESCRIPTOR),
			description: i18n._(ACROSS_ALL_COMMUNITIES_YOU_RE_CURRENTLY_IN_DESCRIPTOR),
		},
		{
			value: 'all_dms',
			label: i18n._(ALL_DMS_ONLY_DESCRIPTOR),
			description: i18n._(ACROSS_ALL_DMS_YOU_VE_EVER_BEEN_IN_3_DESCRIPTOR),
		},
		{
			value: 'open_dms',
			label: i18n._(OPEN_DMS_ONLY_DESCRIPTOR),
			description: i18n._(ACROSS_ALL_DMS_YOU_CURRENTLY_HAVE_OPEN_ONLY_DESCRIPTOR),
		},
		{
			value: 'all',
			label: i18n._(ALL_DMS_COMMUNITIES_DESCRIPTOR),
			description: i18n._(ACROSS_ALL_DMS_YOU_VE_EVER_BEEN_IN_2_DESCRIPTOR),
		},
		{
			value: 'open_dms_and_all_guilds',
			label: i18n._(OPEN_DMS_COMMUNITIES_DESCRIPTOR),
			description: i18n._(ACROSS_ALL_DMS_YOU_CURRENTLY_HAVE_OPEN_ALL_DESCRIPTOR),
		},
	];
	if (!channel) {
		return GUILD_SCOPE_OPTIONS;
	}
	const isDmChannel =
		channel.type === ChannelTypes.DM ||
		channel.type === ChannelTypes.GROUP_DM ||
		channel.type === ChannelTypes.DM_PERSONAL_NOTES;
	return isDmChannel ? DM_SCOPE_OPTIONS : GUILD_SCOPE_OPTIONS;
};
