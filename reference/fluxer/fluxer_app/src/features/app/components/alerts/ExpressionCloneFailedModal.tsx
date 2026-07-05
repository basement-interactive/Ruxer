// SPDX-License-Identifier: AGPL-3.0-or-later

import i18n from '@app/app/I18n';
import {GENERIC_ERROR_BODY_DESCRIPTOR} from '@app/features/app/components/alerts/CommonErrorModalDescriptors';
import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {failureCode} from '@app/features/platform/utils/ResponseInspection';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {msg} from '@lingui/core/macro';

type ExpressionKind = 'emoji' | 'sticker';

const NO_PERMISSION_TITLE_DESCRIPTOR = msg({
	message: "You can't add expressions there",
	comment: 'Title of the error modal shown when cloning an emoji or sticker is blocked by missing permissions.',
});
const NO_PERMISSION_MESSAGE_DESCRIPTOR = msg({
	message: "You don't have permission to add expressions in {targetName}.",
	comment: 'Body of the error modal shown when cloning an emoji or sticker is blocked by missing permissions.',
});
const CLONING_DISABLED_TITLE_DESCRIPTOR = msg({
	message: 'Cloning is turned off',
	comment: 'Title of the error modal shown when the source community has disabled cloning of this expression.',
});
const CLONING_DISABLED_MESSAGE_DESCRIPTOR = msg({
	message: 'The community this came from has turned off cloning, so it cannot be copied.',
	comment: 'Body of the error modal shown when the source community has disabled cloning of this expression.',
});
const EMOJI_SLOTS_FULL_TITLE_DESCRIPTOR = msg({
	message: 'Emoji slots are full',
	comment: 'Title of the error modal shown when the target community has no free emoji slots.',
});
const STICKER_SLOTS_FULL_TITLE_DESCRIPTOR = msg({
	message: 'Sticker slots are full',
	comment: 'Title of the error modal shown when the target community has no free sticker slots.',
});
const SLOTS_FULL_MESSAGE_DESCRIPTOR = msg({
	message: 'Remove one from {targetName} to make room, then try again.',
	comment: 'Body of the error modal shown when the target community has no free expression slots.',
});
const SOURCE_GONE_TITLE_DESCRIPTOR = msg({
	message: 'This expression is gone',
	comment: 'Title of the error modal shown when the source emoji or sticker no longer exists.',
});
const SOURCE_GONE_MESSAGE_DESCRIPTOR = msg({
	message: 'It may have been deleted before it could be cloned.',
	comment: 'Body of the error modal shown when the source emoji or sticker no longer exists.',
});
const CLONE_EMOJI_FAILED_TITLE_DESCRIPTOR = msg({
	message: "Couldn't clone this emoji",
	comment: 'Title of the generic fallback error modal shown when cloning an emoji fails.',
});
const CLONE_STICKER_FAILED_TITLE_DESCRIPTOR = msg({
	message: "Couldn't clone this sticker",
	comment: 'Title of the generic fallback error modal shown when cloning a sticker fails.',
});
function resolveContent(
	code: string | undefined,
	kind: ExpressionKind,
	targetName: string,
): {title: string; message: string} {
	const isEmoji = kind === 'emoji';
	switch (code) {
		case APIErrorCodes.MISSING_PERMISSIONS:
			return {
				title: i18n._(NO_PERMISSION_TITLE_DESCRIPTOR),
				message: i18n._(NO_PERMISSION_MESSAGE_DESCRIPTOR, {targetName}),
			};
		case APIErrorCodes.MISSING_ACCESS:
			return {
				title: i18n._(CLONING_DISABLED_TITLE_DESCRIPTOR),
				message: i18n._(CLONING_DISABLED_MESSAGE_DESCRIPTOR),
			};
		case APIErrorCodes.MAX_EMOJIS:
		case APIErrorCodes.MAX_STICKERS:
			return {
				title: i18n._(isEmoji ? EMOJI_SLOTS_FULL_TITLE_DESCRIPTOR : STICKER_SLOTS_FULL_TITLE_DESCRIPTOR),
				message: i18n._(SLOTS_FULL_MESSAGE_DESCRIPTOR, {targetName}),
			};
		case APIErrorCodes.UNKNOWN_EMOJI:
		case APIErrorCodes.UNKNOWN_STICKER:
			return {
				title: i18n._(SOURCE_GONE_TITLE_DESCRIPTOR),
				message: i18n._(SOURCE_GONE_MESSAGE_DESCRIPTOR),
			};
		default:
			return {
				title: i18n._(isEmoji ? CLONE_EMOJI_FAILED_TITLE_DESCRIPTOR : CLONE_STICKER_FAILED_TITLE_DESCRIPTOR),
				message: i18n._(GENERIC_ERROR_BODY_DESCRIPTOR),
			};
	}
}

export function showExpressionCloneFailedModal(error: unknown, kind: ExpressionKind, targetName: string): void {
	const code = failureCode(error);
	ModalCommands.push(
		modal(() => {
			const {title, message} = resolveContent(code, kind, targetName);
			return (
				<GenericErrorModal
					title={title}
					message={message}
					data-flx="app.expression-clone-failed-modal.generic-error-modal"
				/>
			);
		}),
	);
}
