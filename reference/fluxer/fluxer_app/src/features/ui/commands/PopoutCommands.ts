// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Popout} from '@app/features/ui/popover';
import PopoutState from '@app/features/ui/state/Popout';

type PopoutCommand =
	| {kind: 'open'; popout: Popout}
	| {kind: 'close'; key?: string | number}
	| {kind: 'finish-close'; key?: string | number}
	| {kind: 'close-all'}
	| {kind: 'close-all-for-document'; ownerDocument: Document};

function dispatchPopoutCommand(command: PopoutCommand): void {
	switch (command.kind) {
		case 'open':
			PopoutState.open(command.popout);
			return;
		case 'close':
			PopoutState.requestClose(command.key);
			return;
		case 'finish-close':
			PopoutState.close(command.key);
			return;
		case 'close-all':
			PopoutState.closeAll();
			return;
		case 'close-all-for-document':
			PopoutState.closeAllForDocument(command.ownerDocument);
			return;
	}
}

export function open(popout: Popout): void {
	dispatchPopoutCommand({kind: 'open', popout});
}

export function close(key?: string | number): void {
	dispatchPopoutCommand({kind: 'close', key});
}

export function finishClose(key?: string | number): void {
	dispatchPopoutCommand({kind: 'finish-close', key});
}

export function closeAll(): void {
	dispatchPopoutCommand({kind: 'close-all'});
}

export function closeAllForDocument(ownerDocument: Document): void {
	dispatchPopoutCommand({kind: 'close-all-for-document', ownerDocument});
}
