// SPDX-License-Identifier: AGPL-3.0-or-later

import PiP, {type PiPContent} from '@app/features/ui/state/PiP';

type PiPCommand =
	| {kind: 'open'; content: PiPContent}
	| {kind: 'close'}
	| {kind: 'clear-for-channel'; channelId: string};

function dispatchPiPCommand(command: PiPCommand): void {
	switch (command.kind) {
		case 'open':
			PiP.open(command.content);
			return;
		case 'close':
			PiP.close();
			return;
		case 'clear-for-channel':
			PiP.clearForChannel(command.channelId);
			return;
	}
}

export function openPiP(content: PiPContent): void {
	dispatchPiPCommand({kind: 'open', content});
}

export function closePiP(): void {
	dispatchPiPCommand({kind: 'close'});
}

export function clearPiPForChannel(channelId: string): void {
	dispatchPiPCommand({kind: 'clear-for-channel', channelId});
}
