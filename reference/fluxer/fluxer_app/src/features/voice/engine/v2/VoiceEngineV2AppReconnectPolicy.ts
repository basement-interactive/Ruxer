// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {Store} from '@app/features/voice/engine/Store';
import type {Subscription} from 'rxjs';
import {timer} from 'rxjs';

const logger = new Logger('VoiceEngineV2AppReconnectPolicy');
const RECONNECT_WINDOW_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

export interface VoiceEngineV2AppReconnectState {
	lastConnectedGuildId: string | null;
	lastConnectedChannelId: string | null;
	shouldReconnect: boolean;
	disconnectReason: 'user' | 'error' | 'server' | null;
	lastDisconnectTime: number | null;
	reconnectAttempts: number;
	nextReconnectDelay: number;
}

const initialReconnectState: VoiceEngineV2AppReconnectState = {
	lastConnectedGuildId: null,
	lastConnectedChannelId: null,
	shouldReconnect: false,
	disconnectReason: null,
	lastDisconnectTime: null,
	reconnectAttempts: 0,
	nextReconnectDelay: RECONNECT_BASE_DELAY_MS,
};

export class VoiceEngineV2AppReconnectPolicy extends Store {
	reconnectState: VoiceEngineV2AppReconnectState = initialReconnectState;
	private reconnectTimerSub: Subscription | null = null;

	get shouldAutoReconnect(): boolean {
		const r = this.reconnectState;
		if (r.disconnectReason === 'user') return false;
		if (!r.shouldReconnect) return false;
		if (!r.lastConnectedGuildId || !r.lastConnectedChannelId) return false;
		if (r.lastDisconnectTime && Date.now() - r.lastDisconnectTime > RECONNECT_WINDOW_MS) return false;
		if (r.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return false;
		return true;
	}

	get reconnectAttempts(): number {
		return this.reconnectState.reconnectAttempts;
	}

	get lastConnectedChannel(): {
		guildId: string;
		channelId: string;
	} | null {
		const r = this.reconnectState;
		if (r.lastConnectedGuildId && r.lastConnectedChannelId) {
			return {
				guildId: r.lastConnectedGuildId,
				channelId: r.lastConnectedChannelId,
			};
		}
		return null;
	}

	setLastConnectedChannel(guildId: string | null, channelId: string): void {
		this.update(() => {
			this.reconnectState = {
				...this.reconnectState,
				lastConnectedGuildId: guildId,
				lastConnectedChannelId: channelId,
			};
		});
	}

	setReconnectState(reason: 'user' | 'error' | 'server'): void {
		const shouldReconnect = reason === 'error';
		this.update(() => {
			this.reconnectState = {
				...this.reconnectState,
				shouldReconnect,
				disconnectReason: reason,
				lastDisconnectTime: Date.now(),
			};
		});
		logger.debug('Reconnect state updated', {reason, shouldReconnect});
	}

	scheduleReconnect(callback: () => void): boolean {
		if (!this.shouldAutoReconnect) {
			logger.debug('Auto-reconnect not allowed');
			return false;
		}
		const delay = this.reconnectState.nextReconnectDelay;
		logger.info('Scheduling reconnect', {
			delay,
			attempt: this.reconnectState.reconnectAttempts + 1,
			maxAttempts: MAX_RECONNECT_ATTEMPTS,
		});
		this.clearReconnectTimer();
		this.reconnectTimerSub = timer(delay).subscribe(() => {
			if (!this.shouldAutoReconnect) {
				logger.debug('Reconnect cancelled');
				return;
			}
			this.update(() => {
				this.reconnectState = {
					...this.reconnectState,
					reconnectAttempts: this.reconnectState.reconnectAttempts + 1,
					nextReconnectDelay: Math.min(this.reconnectState.nextReconnectDelay * 2, RECONNECT_MAX_DELAY_MS),
				};
			});
			logger.info('Executing reconnect', {attempt: this.reconnectState.reconnectAttempts});
			callback();
		});
		return true;
	}

	resetOnConnection(): void {
		this.update(() => {
			this.reconnectState = {
				...this.reconnectState,
				reconnectAttempts: 0,
				nextReconnectDelay: RECONNECT_BASE_DELAY_MS,
				shouldReconnect: false,
			};
		});
		this.clearReconnectTimer();
	}

	markAttempted(): void {
		this.update(() => {
			this.reconnectState = {
				...this.reconnectState,
				shouldReconnect: false,
			};
		});
	}

	reset(): void {
		this.clearReconnectTimer();
		this.update(() => {
			this.reconnectState = initialReconnectState;
		});
	}

	forgetChannel(channelId: string): void {
		if (this.reconnectState.lastConnectedChannelId !== channelId) {
			return;
		}
		this.clearReconnectTimer();
		this.update(() => {
			this.reconnectState = initialReconnectState;
		});
	}

	private clearReconnectTimer(): void {
		this.reconnectTimerSub?.unsubscribe();
		this.reconnectTimerSub = null;
	}

	cleanup(): void {
		this.clearReconnectTimer();
	}
}
