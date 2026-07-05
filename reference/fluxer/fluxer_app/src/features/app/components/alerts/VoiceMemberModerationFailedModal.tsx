// SPDX-License-Identifier: AGPL-3.0-or-later

import i18n from '@app/app/I18n';
import {GENERIC_ERROR_BODY_DESCRIPTOR} from '@app/features/app/components/alerts/CommonErrorModalDescriptors';
import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {failureCode} from '@app/features/platform/utils/ResponseInspection';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import type {MessageDescriptor} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const NO_PERMISSION_TITLE_DESCRIPTOR = msg({
	message: "You can't do that",
	comment: 'Title of the error modal shown when a voice moderation action is blocked by missing permissions.',
});
const NO_PERMISSION_MESSAGE_DESCRIPTOR = msg({
	message: "You don't have permission to do this to this member.",
	comment: 'Body of the error modal shown when a voice moderation action is blocked by missing permissions.',
});
const NOT_IN_VOICE_TITLE_DESCRIPTOR = msg({
	message: 'They left the call',
	comment: 'Title of the error modal shown when a voice moderation action targets someone no longer in voice.',
});
const NOT_IN_VOICE_MESSAGE_DESCRIPTOR = msg({
	message: "This member isn't connected to voice anymore.",
	comment: 'Body of the error modal shown when a voice moderation action targets someone no longer in voice.',
});
const UNKNOWN_MEMBER_TITLE_DESCRIPTOR = msg({
	message: 'Member not found',
	comment: 'Title of the error modal shown when a voice moderation action targets a member who no longer exists.',
});
const UNKNOWN_MEMBER_MESSAGE_DESCRIPTOR = msg({
	message: 'This member is no longer in the community. Refresh and try again.',
	comment: 'Body of the error modal shown when a voice moderation action targets a member who no longer exists.',
});

function resolveContent(code: string | undefined, fallbackTitle: MessageDescriptor): {title: string; message: string} {
	switch (code) {
		case APIErrorCodes.MISSING_PERMISSIONS:
			return {
				title: i18n._(NO_PERMISSION_TITLE_DESCRIPTOR),
				message: i18n._(NO_PERMISSION_MESSAGE_DESCRIPTOR),
			};
		case APIErrorCodes.USER_NOT_IN_VOICE:
			return {
				title: i18n._(NOT_IN_VOICE_TITLE_DESCRIPTOR),
				message: i18n._(NOT_IN_VOICE_MESSAGE_DESCRIPTOR),
			};
		case APIErrorCodes.UNKNOWN_MEMBER:
			return {
				title: i18n._(UNKNOWN_MEMBER_TITLE_DESCRIPTOR),
				message: i18n._(UNKNOWN_MEMBER_MESSAGE_DESCRIPTOR),
			};
		default:
			return {
				title: i18n._(fallbackTitle),
				message: i18n._(GENERIC_ERROR_BODY_DESCRIPTOR),
			};
	}
}

export function showVoiceMemberModerationFailedModal(error: unknown, fallbackTitle: MessageDescriptor): void {
	const code = failureCode(error);
	ModalCommands.push(
		modal(() => {
			const {title, message} = resolveContent(code, fallbackTitle);
			return (
				<GenericErrorModal
					title={title}
					message={message}
					data-flx="app.voice-member-moderation-failed-modal.generic-error-modal"
				/>
			);
		}),
	);
}
