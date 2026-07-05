// SPDX-License-Identifier: AGPL-3.0-or-later

import {msg} from '@lingui/core/macro';

export const INVITE_SENT_TO_DESCRIPTOR = msg({
	message: 'Invite sent to {guildName}',
	comment: 'Toast confirming an invite was sent to the named community.',
});
export const ARE_YOU_SURE_YOU_WANT_TO_CLOSE_YOUR_DESCRIPTOR = msg({
	message: 'Close your DM with {recipientUsername}? You can reopen it anytime.',
	comment: 'Confirm dialog body before closing a DM channel.',
});
export const PINNED_GROUP_DM_DESCRIPTOR = msg({
	message: 'Pinned group DM',
	comment: 'Toast confirming a group DM was pinned in the sidebar.',
});
export const FAILED_TO_PIN_GROUP_DM_DESCRIPTOR = msg({
	message: 'Failed to pin group DM',
	comment: 'Error toast when pinning a group DM fails.',
});
export const FAILED_TO_PIN_DM_DESCRIPTOR = msg({
	message: 'Failed to pin DM',
	comment: 'Error toast when pinning a direct message fails.',
});
export const UNPINNED_GROUP_DM_DESCRIPTOR = msg({
	message: 'Unpinned group DM',
	comment: 'Toast confirming a group DM was unpinned in the sidebar.',
});
export const FAILED_TO_UNPIN_GROUP_DM_DESCRIPTOR = msg({
	message: 'Failed to unpin group DM',
	comment: 'Error toast when unpinning a group DM fails.',
});
export const FAILED_TO_UNPIN_DM_DESCRIPTOR = msg({
	message: 'Failed to unpin DM',
	comment: 'Error toast when unpinning a direct message fails.',
});
export const CHANNEL_ID_COPIED_DESCRIPTOR = msg({
	message: 'Channel ID copied',
	comment: 'Toast confirming the channel ID was copied to the clipboard.',
});
export const USER_ID_COPIED_DESCRIPTOR = msg({
	message: 'User ID copied',
	comment: 'Toast confirming the user ID was copied to the clipboard.',
});
