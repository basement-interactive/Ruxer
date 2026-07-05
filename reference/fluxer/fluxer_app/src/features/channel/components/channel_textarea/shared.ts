// SPDX-License-Identifier: AGPL-3.0-or-later

import {CANNOT_SEND_MESSAGES_IN_CHANNEL_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {msg} from '@lingui/core/macro';

export const MESSAGE_DESCRIPTOR = msg({
	message: 'Message',
	comment: 'Generic placeholder text in the message textarea for unnamed channels.',
});
export const YOU_DO_NOT_HAVE_PERMISSION_TO_SEND_MESSAGES_DESCRIPTOR = CANNOT_SEND_MESSAGES_IN_CHANNEL_DESCRIPTOR;
export const CHANNEL_DESCRIPTOR = msg({
	message: 'channel',
	comment:
		'Fallback channel-name placeholder used inside the textarea message hint when no name is available. Lowercase.',
});
export const MESSAGE_2_DESCRIPTOR = msg({
	message: 'Message @',
	comment: 'Prefix for the textarea placeholder text in a DM. Becomes "Message @username". The @ character is literal.',
});
export const OPEN_MENU_DESCRIPTOR = msg({
	message: 'Open menu',
	comment: 'Accessible label for the plus button that opens the textarea attachment and customization menu.',
});
export const RESCHEDULE_MESSAGE_DESCRIPTOR = msg({
	message: 'Reschedule message',
	comment: 'Title of the confirmation alert shown when editing a scheduled message to change the scheduled time.',
});
export const UPDATE_DESCRIPTOR = msg({
	message: 'Update',
	comment: 'Confirm button label on the reschedule scheduled-message alert.',
});
export const THIS_WILL_MODIFY_THE_EXISTING_SCHEDULED_MESSAGE_RATHER_DESCRIPTOR = msg({
	message: 'This will modify the existing scheduled message rather than sending immediately.',
	comment:
		'Body of the reschedule scheduled-message alert clarifying that the update modifies the scheduled message instead of sending it now.',
});
