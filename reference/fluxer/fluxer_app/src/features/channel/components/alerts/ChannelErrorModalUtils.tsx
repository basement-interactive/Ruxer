// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import type {ReactNode} from 'react';

interface ChannelErrorModalOptions {
	title: string;
	message: ReactNode;
	dataFlx: string;
}

export function showChannelErrorModal({title, message, dataFlx}: ChannelErrorModalOptions): void {
	ModalCommands.push(modal(() => <GenericErrorModal title={title} message={message} data-flx={dataFlx} />));
}

export function showChannelErrorModalAfterCurrentModal(options: ChannelErrorModalOptions): void {
	window.setTimeout(() => showChannelErrorModal(options), 0);
}
