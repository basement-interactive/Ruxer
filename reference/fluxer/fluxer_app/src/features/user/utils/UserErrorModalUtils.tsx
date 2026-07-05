// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import type React from 'react';

export function showUserErrorModal(title: string, message: React.ReactNode): void {
	ModalCommands.push(
		modal(() => (
			<GenericErrorModal
				title={title}
				message={message}
				data-flx="user.user-error-modal-utils.show-user-error-modal.generic-error-modal"
			/>
		)),
	);
}

export function showUserErrorModalAfterAutoDismiss(title: string, message: React.ReactNode): void {
	window.setTimeout(() => showUserErrorModal(title, message), 0);
}
