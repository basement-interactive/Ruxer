// SPDX-License-Identifier: AGPL-3.0-or-later

import i18n from '@app/app/I18n';
import {
	GENERIC_ERROR_BODY_DESCRIPTOR,
	RATE_LIMITED_ERROR_BODY_DESCRIPTOR,
	RATE_LIMITED_ERROR_TITLE_DESCRIPTOR,
} from '@app/features/app/components/alerts/CommonErrorModalDescriptors';
import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {failureCode} from '@app/features/platform/utils/ResponseInspection';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {msg} from '@lingui/core/macro';

type DeleteSubject = 'channel' | 'category';

const NO_PERMISSION_TITLE_DESCRIPTOR = msg({
	message: "You can't delete this",
	comment: 'Title of the error modal shown when the user lacks permission to delete a channel or category.',
});
const NO_PERMISSION_CHANNEL_MESSAGE_DESCRIPTOR = msg({
	message: "You don't have permission to delete this channel.",
	comment: 'Body of the error modal shown when the user lacks permission to delete a channel.',
});
const NO_PERMISSION_CATEGORY_MESSAGE_DESCRIPTOR = msg({
	message: "You don't have permission to delete this category.",
	comment: 'Body of the error modal shown when the user lacks permission to delete a category.',
});
const ALREADY_GONE_TITLE_DESCRIPTOR = msg({
	message: 'Already deleted',
	comment: 'Title of the error modal shown when the channel or category no longer exists.',
});
const ALREADY_GONE_CHANNEL_MESSAGE_DESCRIPTOR = msg({
	message: 'This channel no longer exists. It may have already been deleted.',
	comment: 'Body of the error modal shown when the channel no longer exists.',
});
const ALREADY_GONE_CATEGORY_MESSAGE_DESCRIPTOR = msg({
	message: 'This category no longer exists. It may have already been deleted.',
	comment: 'Body of the error modal shown when the category no longer exists.',
});
const DELETE_CHANNEL_FAILED_TITLE_DESCRIPTOR = msg({
	message: "Couldn't delete this channel",
	comment: 'Title of the generic fallback error modal shown when deleting a channel fails.',
});
const DELETE_CATEGORY_FAILED_TITLE_DESCRIPTOR = msg({
	message: "Couldn't delete this category",
	comment: 'Title of the generic fallback error modal shown when deleting a category fails.',
});
function resolveDeleteErrorContent(code: string | undefined, subject: DeleteSubject): {title: string; message: string} {
	const isCategory = subject === 'category';
	switch (code) {
		case APIErrorCodes.MISSING_PERMISSIONS:
			return {
				title: i18n._(NO_PERMISSION_TITLE_DESCRIPTOR),
				message: i18n._(
					isCategory ? NO_PERMISSION_CATEGORY_MESSAGE_DESCRIPTOR : NO_PERMISSION_CHANNEL_MESSAGE_DESCRIPTOR,
				),
			};
		case APIErrorCodes.UNKNOWN_CHANNEL:
			return {
				title: i18n._(ALREADY_GONE_TITLE_DESCRIPTOR),
				message: i18n._(
					isCategory ? ALREADY_GONE_CATEGORY_MESSAGE_DESCRIPTOR : ALREADY_GONE_CHANNEL_MESSAGE_DESCRIPTOR,
				),
			};
		case APIErrorCodes.RATE_LIMITED:
			return {
				title: i18n._(RATE_LIMITED_ERROR_TITLE_DESCRIPTOR),
				message: i18n._(RATE_LIMITED_ERROR_BODY_DESCRIPTOR),
			};
		default:
			return {
				title: i18n._(isCategory ? DELETE_CATEGORY_FAILED_TITLE_DESCRIPTOR : DELETE_CHANNEL_FAILED_TITLE_DESCRIPTOR),
				message: i18n._(GENERIC_ERROR_BODY_DESCRIPTOR),
			};
	}
}

export function showChannelDeleteFailedModal(error: unknown, subject: DeleteSubject = 'channel'): void {
	const code = failureCode(error);
	ModalCommands.push(
		modal(() => {
			const {title, message} = resolveDeleteErrorContent(code, subject);
			return (
				<GenericErrorModal
					title={title}
					message={message}
					data-flx="app.channel-delete-failed-modal.generic-error-modal"
				/>
			);
		}),
	);
}
