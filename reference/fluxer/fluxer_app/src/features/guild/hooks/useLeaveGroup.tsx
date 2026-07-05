// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import * as Modal from '@app/features/app/components/dialogs/Modal';
import * as ChannelCommands from '@app/features/channel/commands/ChannelCommands';
import {
	DELETE_MY_MESSAGES_DESCRIPTOR,
	LEAVE_GROUP_DESCRIPTOR,
} from '@app/features/channel/utils/ChannelMessageDescriptors';
import {GroupLeaveFailedModal} from '@app/features/guild/components/alerts/GroupLeaveFailedModal';
import {CANCEL_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import SelectedChannel from '@app/features/navigation/state/SelectedChannel';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {ME} from '@fluxer/constants/src/AppConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useCallback, useRef, useState} from 'react';

const LEFT_GROUP_DESCRIPTOR = msg({
	message: 'Left group',
	comment: 'Success toast title shown after leaving a group DM.',
});
const ARE_YOU_SURE_YOU_WANT_TO_LEAVE_THIS_DESCRIPTOR = msg({
	message: "Leave this group? You won't see its messages anymore.",
	comment: 'Body text in the leave-group confirmation modal.',
});
const LEAVE_SILENTLY_DESCRIPTOR = msg({
	message: 'Leave silently',
	comment:
		'Switch label in the leave-group confirmation modal. Suppresses the system leave notice so other members are not pinged.',
});
const LEAVE_SILENTLY_DESCRIPTION_DESCRIPTOR = msg({
	message: 'Skip the system leave notice — nobody gets pinged.',
	comment:
		'Switch description in the leave-group confirmation modal. Explains that silently leaving avoids posting a system leave notice.',
});
const DELETE_MY_MESSAGES_DESCRIPTION_DESCRIPTOR = msg({
	message: "Wipe every message you've sent here on the way out. Can't be undone.",
	comment:
		"Switch description in the leave-group confirmation modal. Warns that deleting the caller's group messages is destructive.",
});
const logger = new Logger('useLeaveGroup');
const LeaveGroupModal = observer(({channelId}: {channelId: string}) => {
	const {i18n} = useLingui();
	const [silent, setSilent] = useState(false);
	const [deleteMessages, setDeleteMessages] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const initialFocusRef = useRef<HTMLButtonElement | null>(null);
	const handleConfirm = useCallback(async () => {
		setSubmitting(true);
		try {
			await ChannelCommands.remove(channelId, silent, {deleteMessages});
			const selectedChannel = SelectedChannel.selectedChannelIds.get(ME);
			if (selectedChannel === channelId) {
				RouterUtils.transitionTo(Routes.ME);
			}
			ToastCommands.createToast({
				type: 'success',
				children: i18n._(LEFT_GROUP_DESCRIPTOR),
			});
			ModalCommands.pop();
		} catch (error) {
			logger.error('Failed to leave group', error);
			ModalCommands.pop();
			window.setTimeout(() => {
				ModalCommands.push(
					modal(() => (
						<GroupLeaveFailedModal data-flx="guild.use-leave-group.handle-confirm.group-leave-failed-modal" />
					)),
				);
			}, 0);
		} finally {
			setSubmitting(false);
		}
	}, [channelId, silent, deleteMessages, i18n]);
	return (
		<Modal.Root
			size="small"
			initialFocusRef={initialFocusRef}
			centered
			data-flx="guild.use-leave-group.leave-group-modal.modal-root"
		>
			<Modal.Header
				title={i18n._(LEAVE_GROUP_DESCRIPTOR)}
				data-flx="guild.use-leave-group.leave-group-modal.modal-header"
			/>
			<Modal.Content data-flx="guild.use-leave-group.leave-group-modal.modal-content">
				<Modal.ContentLayout data-flx="guild.use-leave-group.leave-group-modal.modal-content-layout">
					<Modal.Description data-flx="guild.use-leave-group.leave-group-modal.modal-description">
						{i18n._(ARE_YOU_SURE_YOU_WANT_TO_LEAVE_THIS_DESCRIPTOR)}
					</Modal.Description>
					<Switch
						label={i18n._(LEAVE_SILENTLY_DESCRIPTOR)}
						description={i18n._(LEAVE_SILENTLY_DESCRIPTION_DESCRIPTOR)}
						value={silent}
						onChange={setSilent}
						data-flx="guild.use-leave-group.leave-group-modal.switch.set-silent"
					/>
					<Switch
						label={i18n._(DELETE_MY_MESSAGES_DESCRIPTOR)}
						description={i18n._(DELETE_MY_MESSAGES_DESCRIPTION_DESCRIPTOR)}
						value={deleteMessages}
						onChange={setDeleteMessages}
						data-flx="guild.use-leave-group.leave-group-modal.switch.set-delete-messages"
					/>
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.Footer data-flx="guild.use-leave-group.leave-group-modal.modal-footer">
				<Button
					onClick={() => ModalCommands.pop()}
					variant="secondary"
					data-flx="guild.use-leave-group.leave-group-modal.button.pop"
				>
					{i18n._(CANCEL_DESCRIPTOR)}
				</Button>
				<Button
					onClick={handleConfirm}
					submitting={submitting}
					variant="danger"
					ref={initialFocusRef}
					data-flx="guild.use-leave-group.leave-group-modal.button.confirm"
				>
					{i18n._(LEAVE_GROUP_DESCRIPTOR)}
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
export const useLeaveGroup = () => {
	return useCallback((channelId: string) => {
		ModalCommands.push(
			modal(() => <LeaveGroupModal channelId={channelId} data-flx="guild.use-leave-group.leave-group-modal" />),
		);
	}, []);
};
