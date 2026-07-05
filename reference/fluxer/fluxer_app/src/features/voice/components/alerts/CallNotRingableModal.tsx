// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const UNABLE_TO_START_CALL_DESCRIPTOR = msg({
	message: 'Unable to start call',
	comment: 'Title of the modal shown when a 1:1 call cannot be placed because the target user cannot be rung.',
});
const THIS_USER_IS_NOT_AVAILABLE_TO_RECEIVE_CALLS_DESCRIPTOR = msg({
	message: 'This user is not available to receive calls right now. They may have calls disabled.',
	comment: 'Body of the unable-to-start-call modal. Tone stays plain.',
});
export const CallNotRingableModal = observer(() => {
	const {i18n} = useLingui();
	return (
		<GenericErrorModal
			title={i18n._(UNABLE_TO_START_CALL_DESCRIPTOR)}
			message={i18n._(THIS_USER_IS_NOT_AVAILABLE_TO_RECEIVE_CALLS_DESCRIPTOR)}
			data-flx="voice.call-not-ringable-modal.generic-error-modal"
		/>
	);
});
