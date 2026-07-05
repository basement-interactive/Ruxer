// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import styles from '@app/features/emoji/components/modals/EmojiUploadModal.module.css';
import {Spinner} from '@app/features/ui/components/Spinner';
import {plural} from '@lingui/core/macro';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface EmojiUploadModalProps {
	count: number;
}

export const EmojiUploadModal: React.FC<EmojiUploadModalProps> = observer(({count}) => {
	const emojiText = plural(
		{count},
		{
			one: '# emoji',
			other: '# emojis',
		},
	);
	return (
		<Modal.Root size="small" centered data-flx="emoji.emoji-upload-modal.modal-root">
			<Modal.Header
				title={<Trans>Uploading emojis</Trans>}
				hideCloseButton
				data-flx="emoji.emoji-upload-modal.modal-header"
			/>
			<Modal.Content data-flx="emoji.emoji-upload-modal.modal-content">
				<Modal.ContentLayout className={styles.container} data-flx="emoji.emoji-upload-modal.container">
					<Spinner data-flx="emoji.emoji-upload-modal.spinner" />
					<p className={styles.message} data-flx="emoji.emoji-upload-modal.message">
						<Trans>Uploading {emojiText}. This may take a little while.</Trans>
					</p>
				</Modal.ContentLayout>
			</Modal.Content>
		</Modal.Root>
	);
});
