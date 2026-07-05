// SPDX-License-Identifier: AGPL-3.0-or-later

import {STICKERS_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import type {SearchableSettingDescriptor} from '@app/features/user/components/settings_utils/search_index/SearchIndexTypes';
import {msg} from '@lingui/core/macro';

const EXPRESSION_PACKS_DESCRIPTOR = msg({
	message: 'Expression packs',
	comment: 'Settings search entry label. Names the settings search entry in the settings UI.',
});
const EMOJI_DESCRIPTOR = msg({
	message: 'Emoji',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const PACKS_DESCRIPTOR = msg({
	message: 'Packs',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const EXPRESSIONS_DESCRIPTOR = msg({
	message: 'Expressions',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const EMOJI_PACKS_DESCRIPTOR = msg({
	message: 'Emoji packs',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const STICKER_PACKS_DESCRIPTOR = msg({
	message: 'Sticker packs',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const CREATE_EMOJI_PACK_DESCRIPTOR = msg({
	message: 'Create emoji pack',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const CREATE_STICKER_PACK_DESCRIPTOR = msg({
	message: 'Create sticker pack',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const INSTALLED_PACKS_DESCRIPTOR = msg({
	message: 'Installed packs',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const CREATED_PACKS_DESCRIPTOR = msg({
	message: 'Created packs',
	comment: 'Settings search synonym. Used to match this term when the user types it in the settings search bar.',
});
const MANAGE_EXPRESSION_PACKS_DESCRIPTOR = msg({
	message: 'Manage expression packs',
	comment: 'Settings search entry description. One-line summary of what the settings search entry controls.',
});
export const expressionPacksIndex: Array<SearchableSettingDescriptor> = [
	{
		id: 'expression-packs',
		tabType: 'expression_packs',
		label: EXPRESSION_PACKS_DESCRIPTOR,
		keywords: [
			STICKERS_DESCRIPTOR,
			EMOJI_DESCRIPTOR,
			PACKS_DESCRIPTOR,
			EXPRESSIONS_DESCRIPTOR,
			EMOJI_PACKS_DESCRIPTOR,
			STICKER_PACKS_DESCRIPTOR,
			CREATE_EMOJI_PACK_DESCRIPTOR,
			CREATE_STICKER_PACK_DESCRIPTOR,
			INSTALLED_PACKS_DESCRIPTOR,
			CREATED_PACKS_DESCRIPTOR,
		],
		description: MANAGE_EXPRESSION_PACKS_DESCRIPTOR,
	},
];
