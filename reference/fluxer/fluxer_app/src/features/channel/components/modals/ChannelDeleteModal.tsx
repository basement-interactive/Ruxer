// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {
	type ChannelDeleteModalProps,
	deleteChannel,
	getChannelDeleteInfo,
} from '@app/features/channel/utils/ChannelDeleteModalUtils';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useState} from 'react';

export const ChannelDeleteModal = observer(({channelId}: ChannelDeleteModalProps) => {
	const {i18n} = useLingui();
	const deleteInfo = getChannelDeleteInfo(channelId);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const onSubmit = async () => {
		if (!deleteInfo) return;
		setIsSubmitting(true);
		try {
			await deleteChannel(channelId, i18n);
		} finally {
			setIsSubmitting(false);
		}
	};
	if (!deleteInfo) return null;
	const {channel, isCategory, title, confirmText} = deleteInfo;
	return (
		<Modal.Root size="small" centered data-flx="channel.channel-delete-modal.modal-root">
			<Modal.Header title={i18n._(title)} data-flx="channel.channel-delete-modal.modal-header" />
			<Modal.Content data-flx="channel.channel-delete-modal.modal-content">
				<Modal.ContentLayout data-flx="channel.channel-delete-modal.modal-content-layout">
					<Modal.Description data-flx="channel.channel-delete-modal.modal-description">
						{isCategory ? (
							<Trans comment="Destructive confirmation for deleting a channel category.">
								Are you sure you want to delete{' '}
								<strong data-flx="channel.channel-delete-modal.strong">{channel.name}</strong>? This cannot be undone.
							</Trans>
						) : (
							<Trans comment="Destructive confirmation for deleting a channel.">
								Are you sure you want to delete{' '}
								<strong data-flx="channel.channel-delete-modal.strong--2">{channel.name}</strong>? This cannot be
								undone.
							</Trans>
						)}
					</Modal.Description>
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.Footer data-flx="channel.channel-delete-modal.modal-footer">
				<Button onClick={ModalCommands.pop} variant="secondary" data-flx="channel.channel-delete-modal.button.pop">
					<Trans comment="Button that closes the delete channel confirmation without deleting.">Cancel</Trans>
				</Button>
				<Button
					onClick={onSubmit}
					submitting={isSubmitting}
					variant="danger"
					data-flx="channel.channel-delete-modal.button.submit"
				>
					{i18n._(confirmText)}
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
