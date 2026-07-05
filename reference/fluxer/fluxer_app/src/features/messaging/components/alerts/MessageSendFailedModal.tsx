// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const YOUR_MESSAGE_DIDN_T_SEND_DESCRIPTOR = msg({
	message: "Your message didn't send",
	comment: 'Label in the message send failed modal.',
});
const ONE_OR_MORE_ATTACHMENTS_COULDN_T_BE_READ_DESCRIPTOR = msg({
	message:
		"One or more attachments couldn't be read or uploaded. The file may have been moved or deleted. Add it again and retry.",
	comment: 'Error message in the message send failed modal.',
});
const TRY_SENDING_YOUR_MESSAGE_AGAIN_DESCRIPTOR = msg({
	message: 'Try sending your message again.',
	comment: 'Description text in the message send failed modal.',
});

interface MessageSendFailedModalProps {
	hasAttachments?: boolean;
}

export const MessageSendFailedModal = observer(({hasAttachments}: MessageSendFailedModalProps) => {
	const {i18n} = useLingui();
	return (
		<GenericErrorModal
			title={i18n._(YOUR_MESSAGE_DIDN_T_SEND_DESCRIPTOR)}
			message={
				hasAttachments
					? i18n._(ONE_OR_MORE_ATTACHMENTS_COULDN_T_BE_READ_DESCRIPTOR)
					: i18n._(TRY_SENDING_YOUR_MESSAGE_AGAIN_DESCRIPTOR)
			}
			data-flx="messaging.message-send-failed-modal.generic-error-modal"
		/>
	);
});
