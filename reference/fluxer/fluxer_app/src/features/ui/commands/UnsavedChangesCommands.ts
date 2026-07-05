// SPDX-License-Identifier: AGPL-3.0-or-later

import type {TabData} from '@app/features/ui/state/UnsavedChanges';
import UnsavedChanges from '@app/features/ui/state/UnsavedChanges';

type UnsavedChangesIntent =
	| {kind: 'set'; tabId: string; hasChanges: boolean}
	| {kind: 'flash'; tabId: string}
	| {kind: 'clear'; tabId: string}
	| {kind: 'tab-data'; tabId: string; data: TabData};

function dispatchUnsavedChangesIntent(intent: UnsavedChangesIntent): void {
	switch (intent.kind) {
		case 'set':
			UnsavedChanges.setUnsavedChanges(intent.tabId, intent.hasChanges);
			return;
		case 'flash':
			UnsavedChanges.triggerFlash(intent.tabId);
			return;
		case 'clear':
			UnsavedChanges.clearUnsavedChanges(intent.tabId);
			return;
		case 'tab-data':
			UnsavedChanges.setTabData(intent.tabId, intent.data);
			return;
	}
}

export function setUnsavedChanges(tabId: string, hasChanges: boolean): void {
	dispatchUnsavedChangesIntent({kind: 'set', tabId, hasChanges});
}

export function triggerFlashEffect(tabId: string): void {
	dispatchUnsavedChangesIntent({kind: 'flash', tabId});
}

export function clearUnsavedChanges(tabId: string): void {
	dispatchUnsavedChangesIntent({kind: 'clear', tabId});
}

export function setTabData(tabId: string, data: TabData): void {
	dispatchUnsavedChangesIntent({kind: 'tab-data', tabId, data});
}
