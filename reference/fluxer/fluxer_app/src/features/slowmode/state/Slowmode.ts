// SPDX-License-Identifier: AGPL-3.0-or-later

import {makePersistent} from '@app/features/platform/utils/MobXPersistence';
import {makeAutoObservable} from 'mobx';

class Slowmode {
	lastSendTimestamps: Record<string, number> = {};
	cooldownExpiresAt: Record<string, number> = {};

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		void this.initPersistence();
	}

	private async initPersistence(): Promise<void> {
		await makePersistent(this, 'Slowmode', ['lastSendTimestamps', 'cooldownExpiresAt']);
	}

	recordMessageSend(channelId: string): void {
		this.lastSendTimestamps = {
			...this.lastSendTimestamps,
			[channelId]: Date.now(),
		};
	}

	updateSlowmodeTimestamp(channelId: string, timestamp: number): void {
		if (this.lastSendTimestamps[channelId] === timestamp) {
			return;
		}
		this.lastSendTimestamps = {
			...this.lastSendTimestamps,
			[channelId]: timestamp,
		};
	}

	updateSlowmodeRemaining(channelId: string, retryAfterMs: number): void {
		const boundedRetryAfterMs = Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 0;
		const expiresAt = boundedRetryAfterMs > 0 ? Date.now() + boundedRetryAfterMs : 0;
		if (expiresAt <= 0) {
			this.clearChannel(channelId);
			return;
		}
		if (this.cooldownExpiresAt[channelId] === expiresAt) {
			return;
		}
		this.cooldownExpiresAt = {
			...this.cooldownExpiresAt,
			[channelId]: expiresAt,
		};
	}

	clearChannel(channelId: string): void {
		const {[channelId]: _lastSentAt, ...remainingLastSendTimestamps} = this.lastSendTimestamps;
		const {[channelId]: _expiresAt, ...remainingCooldownExpiresAt} = this.cooldownExpiresAt;
		this.lastSendTimestamps = remainingLastSendTimestamps;
		this.cooldownExpiresAt = remainingCooldownExpiresAt;
	}

	deleteChannel(channelId: string): void {
		if (!this.lastSendTimestamps[channelId] && !this.cooldownExpiresAt[channelId]) {
			return;
		}
		this.clearChannel(channelId);
	}

	getLastSendTimestamp(channelId: string): number | null {
		return this.lastSendTimestamps[channelId] ?? null;
	}

	getSlowmodeRemaining(channelId: string, rateLimitPerUser: number): number {
		const lastSentTime = this.lastSendTimestamps[channelId];
		const now = Date.now();
		const explicitRemaining = Math.max(0, (this.cooldownExpiresAt[channelId] ?? 0) - now);
		if (!lastSentTime) return explicitRemaining;
		const timeSinceLastMessage = Math.max(0, now - lastSentTime);
		const localRemaining = Math.max(0, rateLimitPerUser * 1000 - timeSinceLastMessage);
		return Math.max(localRemaining, explicitRemaining);
	}
}

export default new Slowmode();
