// SPDX-License-Identifier: AGPL-3.0-or-later

import {makeSyncedField} from '@app/features/user/state/SyncedField';
import {WhatsNewStateSchema} from '@fluxer/schema/src/gen/fluxer/user/preferences/v1/preferences_pb';
import {makeAutoObservable} from 'mobx';

class WhatsNew {
	lastDismissedEntryId: string | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		void this.initPersistence();
	}

	private async initPersistence(): Promise<void> {
		await makeSyncedField(this, {
			field: 'whatsNew',
			schema: WhatsNewStateSchema,
			persist: ['lastDismissedEntryId'],
			toMessage: (s) => ({
				lastDismissedEntryId: s.lastDismissedEntryId ?? undefined,
			}),
			applyMessage: (s, m) => {
				s.lastDismissedEntryId = m.lastDismissedEntryId ?? null;
			},
		});
	}

	shouldShow(entryId: string, entryDate: Date, userCreatedAt: Date): boolean {
		if (this.lastDismissedEntryId === entryId) return false;
		if (entryDate <= userCreatedAt) return false;
		return true;
	}

	dismiss(entryId: string): void {
		this.lastDismissedEntryId = entryId;
	}
}

export default new WhatsNew();
