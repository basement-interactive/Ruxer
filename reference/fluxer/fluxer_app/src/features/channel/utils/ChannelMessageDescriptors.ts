// SPDX-License-Identifier: AGPL-3.0-or-later

import {msg} from '@lingui/core/macro';

export const UNKNOWN_CHANNEL_DESCRIPTOR = msg({
	message: 'Unknown channel',
	comment: 'Fallback label shown when a channel cannot be resolved (deleted, missing, or no access).',
});
export const CLOSE_DM_DESCRIPTOR = msg({
	message: 'Close DM',
	comment: 'Danger action label for closing a direct message conversation without blocking the other user.',
});
export const PIN_DM_DESCRIPTOR = msg({
	message: 'Pin DM',
	comment: 'Action label for adding a one-to-one direct message to the pinned DM list.',
});
export const UNPIN_DM_DESCRIPTOR = msg({
	message: 'Unpin DM',
	comment: 'Action label for removing a one-to-one direct message from the pinned DM list.',
});
export const PIN_GROUP_DM_DESCRIPTOR = msg({
	message: 'Pin group DM',
	comment: 'Action label for adding a group DM to the pinned DM list.',
});
export const UNPIN_GROUP_DM_DESCRIPTOR = msg({
	message: 'Unpin group DM',
	comment: 'Action label for removing a group DM from the pinned DM list.',
});
export const DELETE_CHANNEL_DESCRIPTOR = msg({
	message: 'Delete channel',
	comment: 'Danger action label for deleting a channel.',
});
export const DELETE_CATEGORY_DESCRIPTOR = msg({
	message: 'Delete category',
	comment: 'Danger action label for deleting a channel category.',
});
export const CATEGORY_DELETED_DESCRIPTOR = msg({
	message: 'Category deleted',
	comment: 'Toast confirming a channel category was successfully deleted.',
});
export const MUTE_CHANNEL_DESCRIPTOR = msg({
	message: 'Mute channel',
	comment: 'Action label for muting notifications from a community channel.',
});
export const UNMUTE_CHANNEL_DESCRIPTOR = msg({
	message: 'Unmute channel',
	comment: 'Action label for restoring notifications from a community channel.',
});
export const MUTE_CONVERSATION_DESCRIPTOR = msg({
	message: 'Mute conversation',
	comment: 'Action label for muting notifications from a DM or group DM conversation.',
});
export const UNMUTE_CONVERSATION_DESCRIPTOR = msg({
	message: 'Unmute conversation',
	comment: 'Action label for restoring notifications from a DM or group DM conversation.',
});
export const LEAVE_GROUP_DESCRIPTOR = msg({
	message: 'Leave group',
	comment: 'Danger action label for leaving a group DM.',
});
export const DELETE_MY_MESSAGES_DESCRIPTOR = msg({
	message: 'Delete my messages',
	comment:
		'Danger action or switch label. Deletes messages the caller sent in the current conversation or community scope.',
});
export const INVITE_TO_COMMUNITY_DESCRIPTOR = msg({
	message: 'Invite to community',
	comment: "Action or submenu label for inviting a friend to one of the current user's communities.",
});
