// SPDX-License-Identifier: AGPL-3.0-or-later

import * as PackCommands from '@app/features/expressions/commands/PackCommands';
import type {PackDashboardResponse} from '@fluxer/schema/src/domains/pack/PackSchemas';
import {makeAutoObservable, runInAction} from 'mobx';

type FetchStatus = 'idle' | 'pending' | 'success' | 'error';

class Packs {
	dashboard: PackDashboardResponse | null = null;
	fetchStatus: FetchStatus = 'idle';
	error: Error | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	async fetch(): Promise<PackDashboardResponse> {
		if (this.fetchStatus === 'pending') {
			throw new Error('Pack fetch already in progress');
		}
		this.fetchStatus = 'pending';
		this.error = null;
		try {
			const dashboard = await PackCommands.list();
			runInAction(() => {
				this.dashboard = dashboard;
				this.fetchStatus = 'success';
			});
			return dashboard;
		} catch (err) {
			runInAction(() => {
				this.fetchStatus = 'error';
				this.error = err instanceof Error ? err : new Error('Failed to load packs');
			});
			throw err;
		}
	}

	async refresh(): Promise<void> {
		await this.fetch();
	}

	async createPack(type: 'emoji' | 'sticker', name: string, description?: string | null): Promise<void> {
		await PackCommands.create(type, name, description);
		await this.refresh();
	}

	async updatePack(
		packId: string,
		data: {
			name?: string;
			description?: string | null;
		},
	): Promise<void> {
		await PackCommands.update(packId, data);
		await this.refresh();
	}

	async deletePack(packId: string): Promise<void> {
		await PackCommands.remove(packId);
		await this.refresh();
	}

	async installPack(packId: string): Promise<void> {
		await PackCommands.install(packId);
		await this.refresh();
	}

	async uninstallPack(packId: string): Promise<void> {
		await PackCommands.uninstall(packId);
		await this.refresh();
	}
}

export default new Packs();
