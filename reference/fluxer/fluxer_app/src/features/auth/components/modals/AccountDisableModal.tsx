// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import * as Modal from '@app/features/app/components/dialogs/Modal';
import {DISABLE_ACCOUNT_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import * as UserCommands from '@app/features/user/commands/UserCommands';
import * as FormUtils from '@app/lib/forms';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useState} from 'react';

export const AccountDisableModal = observer(() => {
	const {i18n} = useLingui();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const handleConfirm = async () => {
		setIsSubmitting(true);
		try {
			await UserCommands.disableAccount();
			ModalCommands.pop();
			RouterUtils.transitionTo(Routes.LOGIN);
		} catch (error) {
			FormUtils.pushApiErrorModal(i18n, error);
		} finally {
			setIsSubmitting(false);
		}
	};
	return (
		<Modal.Root size="small" centered data-flx="auth.account-disable-modal.modal-root">
			<Modal.Header title={i18n._(DISABLE_ACCOUNT_DESCRIPTOR)} data-flx="auth.account-disable-modal.modal-header" />
			<Modal.Content data-flx="auth.account-disable-modal.modal-content">
				<Modal.ContentLayout data-flx="auth.account-disable-modal.modal-content-layout">
					<Modal.Description data-flx="auth.account-disable-modal.description">
						<Trans>
							Disabling your account will sign you out of all sessions. You can re-enable your account at any time by
							signing in again.
						</Trans>
					</Modal.Description>
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.Footer data-flx="auth.account-disable-modal.modal-footer">
				<Button onClick={ModalCommands.pop} variant="secondary" data-flx="auth.account-disable-modal.button.pop">
					<Trans>Cancel</Trans>
				</Button>
				<Button
					onClick={handleConfirm}
					submitting={isSubmitting}
					variant="primary"
					data-flx="auth.account-disable-modal.button.confirm"
				>
					{i18n._(DISABLE_ACCOUNT_DESCRIPTOR)}
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
