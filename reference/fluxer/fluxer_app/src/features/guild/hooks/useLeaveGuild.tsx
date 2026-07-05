// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import * as Modal from '@app/features/app/components/dialogs/Modal';
import {DELETE_MY_MESSAGES_DESCRIPTOR} from '@app/features/channel/utils/ChannelMessageDescriptors';
import * as GuildCommands from '@app/features/guild/commands/GuildCommands';
import {isStockCommunityGuild} from '@app/features/guild/utils/GuildCommunityUtils';
import {CANCEL_DESCRIPTOR, LEAVE_COMMUNITY_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import SelectedGuild from '@app/features/navigation/state/SelectedGuild';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {useCallback, useRef, useState} from 'react';

const ARE_YOU_SURE_YOU_WANT_TO_LEAVE_THIS_DESCRIPTOR = msg({
	message: "Leave this community? You won't see its messages anymore.",
	comment: 'Body text in the leave-community confirmation modal.',
});
const DELETE_MY_MESSAGES_DESCRIPTION_DESCRIPTOR = msg({
	message: "Wipe every message you've sent here on the way out. Can't be undone.",
	comment:
		"Switch description in the leave-community confirmation modal. Warns that deleting the caller's community messages is destructive.",
});
const LEFT_COMMUNITY_DESCRIPTOR = msg({
	message: 'Left community',
	comment: 'Success toast title shown after leaving a community.',
});
const FAILED_TO_LEAVE_COMMUNITY_DESCRIPTOR = msg({
	message: 'Failed to leave community',
	comment: 'Error modal title shown when leaving a community fails.',
});
const WE_COULDN_T_REMOVE_YOU_FROM_THE_COMMUNITY_DESCRIPTOR = msg({
	message: "Couldn't leave right now. Try again in a moment.",
	comment: 'Error modal body shown when leaving a community fails. Keep the tone plain and specific.',
});
const logger = new Logger('useLeaveGuild');
const LeaveGuildModal = ({guildId}: {guildId: string}) => {
	const {i18n} = useLingui();
	const [deleteMessages, setDeleteMessages] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const initialFocusRef = useRef<HTMLButtonElement | null>(null);
	const handleConfirm = useCallback(async () => {
		setSubmitting(true);
		try {
			const wasSelected = SelectedGuild.selectedGuildId === guildId;
			await GuildCommands.leave(guildId, {deleteMessages});
			if (wasSelected) {
				RouterUtils.transitionTo(Routes.ME);
			}
			ToastCommands.createToast({
				type: 'success',
				children: i18n._(LEFT_COMMUNITY_DESCRIPTOR),
			});
			ModalCommands.pop();
		} catch (error) {
			logger.error('Failed to leave community', error);
			ModalCommands.pop();
			window.setTimeout(() => {
				ModalCommands.push(
					modal(() => (
						<GenericErrorModal
							title={i18n._(FAILED_TO_LEAVE_COMMUNITY_DESCRIPTOR)}
							message={i18n._(WE_COULDN_T_REMOVE_YOU_FROM_THE_COMMUNITY_DESCRIPTOR)}
							data-flx="guild.use-leave-guild.handle-confirm.generic-error-modal"
						/>
					)),
				);
			}, 0);
		} finally {
			setSubmitting(false);
		}
	}, [deleteMessages, guildId, i18n]);
	return (
		<Modal.Root
			size="small"
			initialFocusRef={initialFocusRef}
			centered
			data-flx="guild.use-leave-guild.leave-guild-modal.modal-root"
		>
			<Modal.Header
				title={i18n._(LEAVE_COMMUNITY_DESCRIPTOR)}
				data-flx="guild.use-leave-guild.leave-guild-modal.modal-header"
			/>
			<Modal.Content data-flx="guild.use-leave-guild.leave-guild-modal.modal-content">
				<Modal.ContentLayout data-flx="guild.use-leave-guild.leave-guild-modal.modal-content-layout">
					<Modal.Description data-flx="guild.use-leave-guild.leave-guild-modal.modal-description">
						{i18n._(ARE_YOU_SURE_YOU_WANT_TO_LEAVE_THIS_DESCRIPTOR)}
					</Modal.Description>
					<Switch
						label={i18n._(DELETE_MY_MESSAGES_DESCRIPTOR)}
						description={i18n._(DELETE_MY_MESSAGES_DESCRIPTION_DESCRIPTOR)}
						value={deleteMessages}
						onChange={setDeleteMessages}
						data-flx="guild.use-leave-guild.leave-guild-modal.switch.set-delete-messages"
					/>
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.Footer data-flx="guild.use-leave-guild.leave-guild-modal.modal-footer">
				<Button
					onClick={() => ModalCommands.pop()}
					variant="secondary"
					data-flx="guild.use-leave-guild.leave-guild-modal.button.pop"
				>
					{i18n._(CANCEL_DESCRIPTOR)}
				</Button>
				<Button
					onClick={handleConfirm}
					submitting={submitting}
					variant="danger"
					ref={initialFocusRef}
					data-flx="guild.use-leave-guild.leave-guild-modal.button.confirm"
				>
					{i18n._(LEAVE_COMMUNITY_DESCRIPTOR)}
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
};
export const useLeaveGuild = () => {
	return useCallback((guildId: string) => {
		if (isStockCommunityGuild(guildId)) {
			return;
		}
		ModalCommands.push(
			modal(() => <LeaveGuildModal guildId={guildId} data-flx="guild.use-leave-guild.leave-guild-modal" />),
		);
	}, []);
};
