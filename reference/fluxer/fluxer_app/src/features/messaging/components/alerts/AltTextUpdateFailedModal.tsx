// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {failureCode} from '@app/features/platform/utils/ResponseInspection';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const ALT_TEXT_UPDATE_FAILED_TITLE_DESCRIPTOR = msg({
	message: "Couldn't update alt text",
	comment: 'Title of the error modal shown when updating attachment alt text fails.',
});
const MESSAGE_NO_LONGER_EXISTS_DESCRIPTOR = msg({
	message: 'This message no longer exists.',
	comment: 'Body of the alt-text update error modal when the message has been deleted.',
});
const CANNOT_EDIT_THIS_MESSAGE_DESCRIPTOR = msg({
	message: "You can't edit this message.",
	comment: 'Body of the alt-text update error modal when the user lacks permission to edit the message.',
});
const FEATURE_TEMPORARILY_DISABLED_DESCRIPTOR = msg({
	message: 'Editing is temporarily unavailable. Please try again later.',
	comment: 'Body of the alt-text update error modal when message editing is temporarily disabled server-side.',
});
const ALT_TEXT_UPDATE_FAILED_MESSAGE_DESCRIPTOR = msg({
	message: "Couldn't update the alt text. Please try again.",
	comment: 'Body of the generic fallback alt-text update error modal.',
});

interface AltTextUpdateFailedModalProps {
	error: unknown;
}

export const AltTextUpdateFailedModal = observer(({error}: AltTextUpdateFailedModalProps) => {
	const {i18n} = useLingui();
	const code = failureCode(error);
	let message: string;
	switch (code) {
		case APIErrorCodes.UNKNOWN_MESSAGE:
			message = i18n._(MESSAGE_NO_LONGER_EXISTS_DESCRIPTOR);
			break;
		case APIErrorCodes.MISSING_PERMISSIONS:
			message = i18n._(CANNOT_EDIT_THIS_MESSAGE_DESCRIPTOR);
			break;
		case APIErrorCodes.FEATURE_TEMPORARILY_DISABLED:
			message = i18n._(FEATURE_TEMPORARILY_DISABLED_DESCRIPTOR);
			break;
		default:
			message = i18n._(ALT_TEXT_UPDATE_FAILED_MESSAGE_DESCRIPTOR);
			break;
	}
	return (
		<GenericErrorModal
			title={i18n._(ALT_TEXT_UPDATE_FAILED_TITLE_DESCRIPTOR)}
			message={message}
			data-flx="messaging.alt-text-update-failed-modal.generic-error-modal"
		/>
	);
});
