// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const FAILED_TO_UNPIN_MESSAGE_DESCRIPTOR = msg({
	message: 'Failed to unpin message',
	comment: 'Error message in the pin failed modal.',
});
const FAILED_TO_PIN_MESSAGE_DESCRIPTOR = msg({
	message: 'Failed to pin message',
	comment: 'Error message in the pin failed modal.',
});
const YOU_CANNOT_INTERACT_WITH_THIS_USER_RIGHT_NOW_DESCRIPTOR = msg({
	message: 'You cannot interact with this user right now.',
	comment: 'Error message in the pin failed modal.',
});
const SOMETHING_WENT_WRONG_PLEASE_TRY_AGAIN_LATER_DESCRIPTOR = msg({
	message: 'Something went wrong. Try again later.',
	comment: 'Description text in the pin failed modal.',
});

export type PinFailureReason = 'dm_restricted' | 'generic';

interface PinFailedModalProps {
	isUnpin?: boolean;
	reason?: PinFailureReason;
}

export const PinFailedModal: React.FC<PinFailedModalProps> = observer(({isUnpin, reason = 'generic'}) => {
	const {i18n} = useLingui();
	const title = isUnpin ? i18n._(FAILED_TO_UNPIN_MESSAGE_DESCRIPTOR) : i18n._(FAILED_TO_PIN_MESSAGE_DESCRIPTOR);
	let message: string;
	switch (reason) {
		case 'dm_restricted':
			message = i18n._(YOU_CANNOT_INTERACT_WITH_THIS_USER_RIGHT_NOW_DESCRIPTOR);
			break;
		default:
			message = i18n._(SOMETHING_WENT_WRONG_PLEASE_TRY_AGAIN_LATER_DESCRIPTOR);
	}
	return (
		<GenericErrorModal title={title} message={message} data-flx="messaging.pin-failed-modal.generic-error-modal" />
	);
});
