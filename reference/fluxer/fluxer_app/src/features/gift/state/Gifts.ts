// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Gift} from '@app/features/gift/commands/GiftCommands';
import * as GiftCommands from '@app/features/gift/commands/GiftCommands';
import {makeAutoObservable, observable, runInAction} from 'mobx';

interface GiftState {
	loading: boolean;
	error: Error | null;
	data: Gift | null;
	invalid?: boolean;
}

class Gifts {
	gifts: Map<string, GiftState> = observable.map();
	pendingRequests: Map<string, Promise<Gift>> = observable.map();

	constructor() {
		makeAutoObservable(
			this,
			{
				gifts: false,
				pendingRequests: false,
			},
			{autoBind: true},
		);
	}

	markAsRedeemed(code: string): void {
		const existingGift = this.gifts.get(code);
		if (existingGift?.data) {
			const updatedGift: Gift = {
				...existingGift.data,
				redeemed: true,
			};
			this.gifts.set(code, {
				...existingGift,
				data: updatedGift,
			});
		}
	}

	markAsInvalid(code: string): void {
		this.gifts.set(code, {
			loading: false,
			error: new Error('Gift code not found'),
			data: null,
			invalid: true,
		});
	}

	async fetchGift(code: string): Promise<Gift> {
		const existingGift = this.gifts.get(code);
		if (existingGift?.invalid) {
			throw new Error('Gift code not found');
		}
		const existingRequest = this.pendingRequests.get(code);
		if (existingRequest) {
			return existingRequest;
		}
		if (existingGift?.data) {
			return existingGift.data;
		}
		this.gifts.set(code, {loading: true, error: null, data: null});
		const promise = GiftCommands.fetch(code);
		this.pendingRequests.set(code, promise);
		try {
			const gift = await promise;
			runInAction(() => {
				this.pendingRequests.delete(code);
				this.gifts.set(code, {loading: false, error: null, data: gift});
			});
			return gift;
		} catch (error) {
			runInAction(() => {
				this.pendingRequests.delete(code);
				this.gifts.set(code, {
					loading: false,
					error: error as Error,
					data: null,
				});
			});
			throw error;
		}
	}
}

export default new Gifts();
