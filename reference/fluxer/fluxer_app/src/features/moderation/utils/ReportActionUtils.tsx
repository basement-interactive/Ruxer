// SPDX-License-Identifier: AGPL-3.0-or-later

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import type {IARContext} from '@app/features/moderation/components/report_modal/IARModal';
import {IARModal} from '@app/features/moderation/components/report_modal/IARModal';
import {
	REPORT_COMMUNITY_DESCRIPTOR,
	REPORT_USER_DESCRIPTOR,
} from '@app/features/moderation/utils/ModerationMessageDescriptors';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import type {User} from '@app/features/user/models/User';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const IF_THIS_REPORT_IS_ABOUT_A_SPECIFIC_MESSAGE_DESCRIPTOR = msg({
	message:
		'If this report is about a specific message, report that message instead. Message reports give our safety team the clearest context, and adding details in the comments can help us review it faster. Only continue with reporting the user as a whole if that message does not capture the broader issue.',
	comment: 'Label in the report action utils helper. Keep the tone plain and specific.',
});
const IF_THIS_REPORT_IS_ABOUT_SPECIFIC_MESSAGES_REPORT_DESCRIPTOR = msg({
	message:
		'If this report is about specific messages, report the most relevant message instead. Message reports give our safety team the clearest context, and adding details in the comments can help us review it faster. Only continue with reporting the user as a whole if reporting a message would not capture the broader issue.',
	comment: 'Label in the report action utils helper. Keep the tone plain and specific.',
});
const CONTINUE_TO_REPORT_USER_DESCRIPTOR = msg({
	message: 'Continue to report user',
	comment:
		'Button or menu action label in the report action utils helper. Keep it concise. Keep the tone plain and specific.',
});
const IF_THIS_REPORT_IS_ABOUT_A_SPECIFIC_MESSAGE_2_DESCRIPTOR = msg({
	message:
		'If this report is about a specific message in this community, report that message instead. Message reports give our safety team the clearest context, and adding details in the comments can help us review it faster. Only continue with reporting the community as a whole if reporting a message would not capture the broader issue.',
	comment: 'Label in the report action utils helper. Keep the tone plain and specific.',
});
const CONTINUE_TO_REPORT_COMMUNITY_DESCRIPTOR = msg({
	message: 'Continue to report community',
	comment:
		'Button or menu action label in the report action utils helper. Keep it concise. Keep the tone plain and specific.',
});

function openReportModal(context: IARContext): void {
	ModalCommands.push(
		modal(() => <IARModal context={context} data-flx="moderation.report-action-utils.open-report-modal.iar-modal" />),
	);
}

function openFollowupReportModal(context: IARContext): void {
	globalThis.setTimeout(() => {
		openReportModal(context);
	}, 0);
}

export function openReportMessageModal(message: Message): void {
	openReportModal({
		type: 'message',
		message,
	});
}

export function openReportUserModal(params: {i18n: I18n; user: User; guildId?: string; message?: Message}): void {
	const {i18n, user, guildId, message} = params;
	const context: IARContext = {
		type: 'user',
		user,
		guildId,
	};
	ModalCommands.push(
		modal(() => (
			<ConfirmModal
				title={i18n._(REPORT_USER_DESCRIPTOR)}
				description={
					message
						? i18n._(IF_THIS_REPORT_IS_ABOUT_A_SPECIFIC_MESSAGE_DESCRIPTOR)
						: i18n._(IF_THIS_REPORT_IS_ABOUT_SPECIFIC_MESSAGES_REPORT_DESCRIPTOR)
				}
				message={message}
				primaryText={i18n._(CONTINUE_TO_REPORT_USER_DESCRIPTOR)}
				primaryVariant="danger"
				onPrimary={() => openFollowupReportModal(context)}
				data-flx="moderation.report-action-utils.open-report-user-modal.confirm-modal"
			/>
		)),
	);
}

export function openReportGuildModal(params: {
	i18n: I18n;
	guild: {id: string; name: string};
	inviteCode?: string;
}): void {
	const {i18n, guild, inviteCode} = params;
	const context: IARContext = {
		type: 'guild',
		guild,
		inviteCode,
	};
	ModalCommands.push(
		modal(() => (
			<ConfirmModal
				title={i18n._(REPORT_COMMUNITY_DESCRIPTOR)}
				description={i18n._(IF_THIS_REPORT_IS_ABOUT_A_SPECIFIC_MESSAGE_2_DESCRIPTOR)}
				primaryText={i18n._(CONTINUE_TO_REPORT_COMMUNITY_DESCRIPTOR)}
				primaryVariant="danger"
				onPrimary={() => openFollowupReportModal(context)}
				data-flx="moderation.report-action-utils.open-report-guild-modal.confirm-modal"
			/>
		)),
	);
}
