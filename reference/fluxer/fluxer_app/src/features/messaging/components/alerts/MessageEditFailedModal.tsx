// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const YOUR_MESSAGE_DIDN_T_UPDATE_DESCRIPTOR = msg({
	message: "Your message didn't update",
	comment: 'Label in the message edit failed modal.',
});
const TRY_EDITING_YOUR_MESSAGE_AGAIN_DESCRIPTOR = msg({
	message: 'Try editing your message again.',
	comment: 'Description text in the message edit failed modal.',
});
export const MessageEditFailedModal = observer(() => {
	const {i18n} = useLingui();
	return (
		<GenericErrorModal
			title={i18n._(YOUR_MESSAGE_DIDN_T_UPDATE_DESCRIPTOR)}
			message={i18n._(TRY_EDITING_YOUR_MESSAGE_AGAIN_DESCRIPTOR)}
			data-flx="messaging.message-edit-failed-modal.generic-error-modal"
		/>
	);
});
