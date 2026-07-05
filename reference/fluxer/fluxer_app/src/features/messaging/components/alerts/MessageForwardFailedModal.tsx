// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const FAILED_TO_FORWARD_MESSAGE_DESCRIPTOR = msg({
	message: 'Failed to forward message',
	comment: 'Error message in the message forward failed modal.',
});
const WE_COULDN_T_FORWARD_THE_MESSAGE_AT_THIS_DESCRIPTOR = msg({
	message: "We couldn't forward the message at this time.",
	comment: 'Error message in the message forward failed modal.',
});
export const MessageForwardFailedModal = observer(() => {
	const {i18n} = useLingui();
	return (
		<GenericErrorModal
			title={i18n._(FAILED_TO_FORWARD_MESSAGE_DESCRIPTOR)}
			message={i18n._(WE_COULDN_T_FORWARD_THE_MESSAGE_AT_THIS_DESCRIPTOR)}
			data-flx="messaging.message-forward-failed-modal.generic-error-modal"
		/>
	);
});
