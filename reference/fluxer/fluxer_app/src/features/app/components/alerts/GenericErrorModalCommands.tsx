// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import type {ReactNode} from 'react';

interface GenericErrorModalOptions {
	title: string | (() => string);
	message: ReactNode | (() => ReactNode);
	dataFlx?: string;
	defer?: boolean;
}

export function showGenericErrorModal({title, message, dataFlx, defer}: GenericErrorModalOptions): void {
	const pushErrorModal = () => {
		ModalCommands.push(
			modal(() => (
				<GenericErrorModal
					title={typeof title === 'function' ? title() : title}
					message={typeof message === 'function' ? message() : message}
					data-flx={dataFlx}
				/>
			)),
		);
	};
	if (defer) {
		window.setTimeout(pushErrorModal, 0);
		return;
	}
	pushErrorModal();
}
