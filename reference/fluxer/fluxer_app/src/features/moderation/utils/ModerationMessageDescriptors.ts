// SPDX-License-Identifier: AGPL-3.0-or-later

import {msg} from '@lingui/core/macro';

export const BAN_ACTION_DESCRIPTOR = msg({
	message: 'Ban',
	comment: 'Short moderation action label. Ban a member from a community by removing them and preventing rejoining.',
});
export const REMOVE_TIMEOUT_DESCRIPTOR = msg({
	message: 'Remove timeout',
	comment: 'Moderation action label that clears an active timeout on a community member.',
});
export const REPORT_USER_DESCRIPTOR = msg({
	message: 'Report user',
	comment: 'Action label that opens the report flow targeting a user.',
});
export const REPORT_COMMUNITY_DESCRIPTOR = msg({
	message: 'Report community',
	comment: 'Action label that opens the report flow targeting a community.',
});
export const TIMEOUT_DESCRIPTOR = msg({
	message: 'Timeout',
	comment: 'Moderation action label that times a member out (temporary mute) in a community.',
});
export const BLOCK_DESCRIPTOR = msg({
	message: 'Block',
	comment: 'Generic destructive action label that blocks a user.',
});
