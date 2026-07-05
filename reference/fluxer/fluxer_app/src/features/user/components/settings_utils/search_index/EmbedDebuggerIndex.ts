// SPDX-License-Identifier: AGPL-3.0-or-later

import type {SearchableSettingDescriptor} from '@app/features/user/components/settings_utils/search_index/SearchIndexTypes';
import {DEVELOPER_DESCRIPTOR} from '@app/features/user/components/settings_utils/search_index/SharedDescriptors';
import {msg} from '@lingui/core/macro';

const EMBED_DEBUGGER_DESCRIPTOR = msg({
	message: 'Embed debugger',
	comment: 'Settings search entry label for the developer embed debugger.',
});
const EMBED_DESCRIPTOR = msg({
	message: 'Embed',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const UNFURL_DESCRIPTOR = msg({
	message: 'Unfurl',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const URL_DESCRIPTOR = msg({
	message: 'URL',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const TEST_UNFURLED_EMBEDS_DESCRIPTOR = msg({
	message: 'Test URL unfurls and rendered embeds',
	comment: 'Settings search entry description for the developer embed debugger.',
});

export const embedDebuggerIndex: Array<SearchableSettingDescriptor> = [
	{
		id: 'embed-debugger',
		tabType: 'embed_debugger',
		label: EMBED_DEBUGGER_DESCRIPTOR,
		keywords: [DEVELOPER_DESCRIPTOR, EMBED_DESCRIPTOR, UNFURL_DESCRIPTOR, URL_DESCRIPTOR],
		description: TEST_UNFURLED_EMBEDS_DESCRIPTOR,
	},
];
