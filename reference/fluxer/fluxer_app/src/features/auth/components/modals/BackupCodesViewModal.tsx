// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import * as MfaCommands from '@app/features/auth/commands/MfaCommands';
import {BackupCodesModal} from '@app/features/auth/components/modals/BackupCodesModal';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import type {User} from '@app/features/user/models/User';
import * as FormUtils from '@app/lib/forms';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useState} from 'react';

const VIEW_BACKUP_CODES_DESCRIPTOR = msg({
	message: 'View backup codes',
	comment: 'Short label in the authentication backup codes view modal. Keep the tone plain and specific.',
});

interface BackupCodesViewModalProps {
	user: User;
}

export const BackupCodesViewModal = observer(({user}: BackupCodesViewModalProps) => {
	const {i18n} = useLingui();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const handleConfirm = async () => {
		setIsSubmitting(true);
		try {
			const backupCodes = await MfaCommands.getBackupCodes();
			ModalCommands.pop();
			ModalCommands.pushWithKey(
				modal(() => (
					<BackupCodesModal
						backupCodes={backupCodes}
						user={user}
						data-flx="auth.backup-codes-view-modal.handle-confirm.backup-codes-modal"
					/>
				)),
				'backup-codes',
			);
		} catch (error) {
			FormUtils.pushApiErrorModal(i18n, error);
		} finally {
			setIsSubmitting(false);
		}
	};
	return (
		<Modal.Root size="small" centered data-flx="auth.backup-codes-view-modal.modal-root">
			<Modal.Header title={i18n._(VIEW_BACKUP_CODES_DESCRIPTOR)} data-flx="auth.backup-codes-view-modal.modal-header" />
			<Modal.Content data-flx="auth.backup-codes-view-modal.modal-content">
				<Modal.ContentLayout data-flx="auth.backup-codes-view-modal.modal-content-layout">
					<Modal.Description data-flx="auth.backup-codes-view-modal.modal-description">
						<Trans>Verification may be required before viewing your backup codes.</Trans>
					</Modal.Description>
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.Footer data-flx="auth.backup-codes-view-modal.modal-footer">
				<Button onClick={ModalCommands.pop} variant="secondary" data-flx="auth.backup-codes-view-modal.button.pop">
					<Trans>Cancel</Trans>
				</Button>
				<Button
					onClick={handleConfirm}
					submitting={isSubmitting}
					data-flx="auth.backup-codes-view-modal.button.confirm"
				>
					<Trans>Continue</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
