// SPDX-License-Identifier: AGPL-3.0-or-later

import type {SearchableSettingDescriptor} from '@app/features/user/components/settings_utils/search_index/SearchIndexTypes';
import {msg} from '@lingui/core/macro';

const UNREAD_BADGE_CUSTOMIZATION_DESCRIPTOR = msg({
	message: 'Unread badge customization',
	comment: 'Settings search entry label for opting into experimental per-community unread badge controls.',
});
const UNREAD_BADGES_DESCRIPTOR = msg({
	message: 'Unread badges',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const COMMUNITY_BADGES_DESCRIPTOR = msg({
	message: 'Community badges',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const CHANNEL_BADGES_DESCRIPTOR = msg({
	message: 'Channel badges',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const EXPERIMENTAL_DESCRIPTOR = msg({
	message: 'Experimental',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const OPT_IN_TO_EXPERIMENTAL_UNREAD_BADGE_CONTROLS_DESCRIPTOR = msg({
	message: 'Opt into experimental per-community and per-channel unread badge controls',
	comment: 'Settings search entry description. One-line summary of what the setting controls.',
});

export const advancedSettingsIndex: Array<SearchableSettingDescriptor> = [
	{
		id: 'advanced-unread-badge-customization',
		tabType: 'advanced_settings',
		label: UNREAD_BADGE_CUSTOMIZATION_DESCRIPTOR,
		keywords: [
			UNREAD_BADGES_DESCRIPTOR,
			COMMUNITY_BADGES_DESCRIPTOR,
			CHANNEL_BADGES_DESCRIPTOR,
			EXPERIMENTAL_DESCRIPTOR,
		],
		description: OPT_IN_TO_EXPERIMENTAL_UNREAD_BADGE_CONTROLS_DESCRIPTOR,
		audience: 'advanced',
		tags: ['notifications'],
		addedAt: '2026-06-04T00:00:00.000Z',
		badges: ['experimental'],
	},
];
