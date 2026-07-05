// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import * as ChannelCommands from '@app/features/channel/commands/ChannelCommands';
import Channels from '@app/features/channel/state/Channels';
import {DELETE_MY_MESSAGES_DESCRIPTOR} from '@app/features/channel/utils/ChannelMessageDescriptors';
import {Logger} from '@app/features/platform/utils/AppLogger';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {useCallback} from 'react';

const DELETE_YOUR_MESSAGES_IN_THIS_CHANNEL_DESCRIPTOR = msg({
	message: 'Delete your messages in this channel?',
	comment: 'Confirmation modal title for the destructive "delete all my messages in this channel" action.',
});
const DELETE_YOUR_MESSAGES_IN_THIS_CONVERSATION_DESCRIPTOR = msg({
	message: 'Delete your messages in this conversation?',
	comment:
		'Confirmation modal title for the destructive "delete all my messages in this DM or group DM conversation" action.',
});
const THIS_WILL_PERMANENTLY_DELETE_EVERY_MESSAGE_YOU_HAVE_DESCRIPTOR = msg({
	message: 'This will permanently delete every message you have ever sent in this channel. This cannot be undone.',
	comment:
		'Confirmation modal description warning that every message the caller has sent in this channel will be deleted. Cannot be undone.',
});
const THIS_WILL_PERMANENTLY_DELETE_EVERY_MESSAGE_YOU_HAVE_IN_THIS_CONVERSATION_DESCRIPTOR = msg({
	message: 'This will permanently delete every message you have ever sent in this conversation. This cannot be undone.',
	comment:
		'Confirmation modal description warning that every message the caller has sent in a DM or group DM conversation will be deleted. Cannot be undone.',
});
const DELETED_YOUR_MESSAGES_DESCRIPTOR = msg({
	message: 'Deleted your messages.',
	comment: 'Toast shown after the "delete my messages in channel" request succeeds.',
});
const COULDN_T_DELETE_YOUR_MESSAGES_DESCRIPTOR = msg({
	message: "Couldn't delete your messages",
	comment: 'Error modal title shown when the "delete my messages in channel" request failed.',
});
const WE_COULDN_T_DELETE_YOUR_MESSAGES_RIGHT_NOW_DESCRIPTOR = msg({
	message: "We couldn't delete your messages right now. Try again in a moment.",
	comment:
		'Error modal body shown when the "delete my messages in channel" request failed. Encourages the user to retry.',
});
const logger = new Logger('useDeleteMyMessagesInChannel');
export const useDeleteMyMessagesInChannel = () => {
	const {i18n} = useLingui();
	return useCallback(
		(channelId: string) => {
			const channel = Channels.getChannel(channelId);
			const isPrivateConversation = channel?.type === ChannelTypes.DM || channel?.type === ChannelTypes.GROUP_DM;
			const title = isPrivateConversation
				? i18n._(DELETE_YOUR_MESSAGES_IN_THIS_CONVERSATION_DESCRIPTOR)
				: i18n._(DELETE_YOUR_MESSAGES_IN_THIS_CHANNEL_DESCRIPTOR);
			const description = isPrivateConversation
				? i18n._(THIS_WILL_PERMANENTLY_DELETE_EVERY_MESSAGE_YOU_HAVE_IN_THIS_CONVERSATION_DESCRIPTOR)
				: i18n._(THIS_WILL_PERMANENTLY_DELETE_EVERY_MESSAGE_YOU_HAVE_DESCRIPTOR);
			ModalCommands.push(
				modal(() => (
					<ConfirmModal
						title={title}
						description={description}
						primaryText={i18n._(DELETE_MY_MESSAGES_DESCRIPTOR)}
						primaryVariant="danger"
						onPrimary={async () => {
							try {
								await ChannelCommands.bulkDeleteMyMessages(channelId);
								ToastCommands.createToast({
									type: 'success',
									children: i18n._(DELETED_YOUR_MESSAGES_DESCRIPTOR),
								});
							} catch (error) {
								logger.error('Failed to delete user messages in channel', error);
								window.setTimeout(() => {
									ModalCommands.push(
										modal(() => (
											<GenericErrorModal
												title={i18n._(COULDN_T_DELETE_YOUR_MESSAGES_DESCRIPTOR)}
												message={i18n._(WE_COULDN_T_DELETE_YOUR_MESSAGES_RIGHT_NOW_DESCRIPTOR)}
												data-flx="channel.use-delete-my-messages-in-channel.generic-error-modal"
											/>
										)),
									);
								}, 0);
							}
						}}
						data-flx="channel.use-delete-my-messages-in-channel.confirm-modal"
					/>
				)),
			);
		},
		[i18n],
	);
};
