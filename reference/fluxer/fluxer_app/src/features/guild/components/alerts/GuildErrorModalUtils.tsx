// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import type React from 'react';

interface ShowGuildErrorModalOptions {
	title: string;
	message: React.ReactNode;
	dataFlx: string;
}

export function showGuildErrorModal({title, message, dataFlx}: ShowGuildErrorModalOptions): void {
	window.setTimeout(() => {
		ModalCommands.push(modal(() => <GenericErrorModal title={title} message={message} data-flx={dataFlx} />));
	}, 0);
}
