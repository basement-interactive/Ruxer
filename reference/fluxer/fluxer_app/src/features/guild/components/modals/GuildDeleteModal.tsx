// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import * as GuildCommands from '@app/features/guild/commands/GuildCommands';
import {isStockCommunityGuild} from '@app/features/guild/utils/GuildCommunityUtils';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import * as FormUtils from '@app/lib/forms';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useState} from 'react';

const COMMUNITY_DELETED_DESCRIPTOR = msg({
	message: 'Community deleted',
	comment: 'Short label in the guild delete modal. Keep it concise. Keep the tone plain and specific.',
});
const DELETE_COMMUNITY_DESCRIPTOR = msg({
	message: 'Delete community',
	comment: 'Button or menu action label in the guild delete modal. Keep it concise. Keep the tone plain and specific.',
});
export const GuildDeleteModal = observer(({guildId}: {guildId: string}) => {
	const {i18n} = useLingui();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const handleConfirm = async () => {
		if (isStockCommunityGuild(guildId)) {
			return;
		}
		setIsSubmitting(true);
		try {
			await GuildCommands.remove(guildId);
			ModalCommands.pop();
			ToastCommands.createToast({type: 'success', children: i18n._(COMMUNITY_DELETED_DESCRIPTOR)});
		} catch (error) {
			FormUtils.pushApiErrorModal(i18n, error);
		} finally {
			setIsSubmitting(false);
		}
	};
	return (
		<Modal.Root size="small" centered data-flx="guild.guild-delete-modal.modal-root">
			<Modal.Header title={i18n._(DELETE_COMMUNITY_DESCRIPTOR)} data-flx="guild.guild-delete-modal.modal-header" />
			<Modal.Content data-flx="guild.guild-delete-modal.modal-content">
				<Modal.ContentLayout data-flx="guild.guild-delete-modal.modal-content-layout">
					<Modal.Description data-flx="guild.guild-delete-modal.modal-description">
						<Trans>
							Are you sure you want to delete this community? This action cannot be undone. All channels, messages, and
							settings will be permanently deleted.
						</Trans>
					</Modal.Description>
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.Footer data-flx="guild.guild-delete-modal.modal-footer">
				<Button onClick={ModalCommands.pop} variant="secondary" data-flx="guild.guild-delete-modal.button.pop">
					<Trans>I changed my mind</Trans>
				</Button>
				<Button
					onClick={handleConfirm}
					submitting={isSubmitting}
					variant="danger"
					data-flx="guild.guild-delete-modal.button.confirm"
				>
					<Trans>Delete community</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
