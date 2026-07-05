// SPDX-License-Identifier: AGPL-3.0-or-later

import {makeSyncedField} from '@app/features/user/state/SyncedField';
import {GuildFolderExpandedStateSchema} from '@fluxer/schema/src/gen/fluxer/user/preferences/v1/preferences_pb';
import {makeAutoObservable} from 'mobx';

class GuildFolderExpanded {
	expandedFolderIds: Array<number> = [];

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		void this.initPersistence();
	}

	private async initPersistence(): Promise<void> {
		await makeSyncedField(this, {
			field: 'guildFolders',
			schema: GuildFolderExpandedStateSchema,
			persist: ['expandedFolderIds'],
			toMessage: (s) => ({expandedFolderIds: s.expandedFolderIds.map((n) => BigInt(n))}),
			applyMessage: (s, m) => {
				s.expandedFolderIds = m.expandedFolderIds.map((b) => Number(b));
			},
		});
	}

	isExpanded(folderId: number): boolean {
		return this.expandedFolderIds.includes(folderId);
	}

	toggleExpanded(folderId: number): void {
		if (this.expandedFolderIds.includes(folderId)) {
			const index = this.expandedFolderIds.indexOf(folderId);
			if (index > -1) {
				this.expandedFolderIds.splice(index, 1);
			}
		} else {
			this.expandedFolderIds.push(folderId);
		}
	}
}

export default new GuildFolderExpanded();
