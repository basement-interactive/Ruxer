// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import type {VoiceConnectionState} from './VoiceEngineV2AppConnectionHostAdapter';
import {VoiceEngineV2AppNativeVoiceConnectionLifecycle} from './VoiceEngineV2AppNativeVoiceConnectionLifecycle';

function connectionState(overrides: Partial<VoiceConnectionState> = {}): VoiceConnectionState {
	return {
		room: null,
		guildId: 'guild-1',
		channelId: 'channel-1',
		connecting: true,
		connected: false,
		reconnecting: false,
		voiceServerEndpoint: 'wss://voice.example.test',
		connectionId: 'conn-1',
		...overrides,
	};
}

describe('VoiceEngineV2AppNativeVoiceConnectionLifecycle', () => {
	it('creates monotonic attempts and ignores stale clear requests', () => {
		const lifecycle = new VoiceEngineV2AppNativeVoiceConnectionLifecycle();
		const first = lifecycle.createAttempt({
			guildId: 'guild-1',
			channelId: 'channel-1',
			connectionId: 'conn-1',
			endpoint: 'wss://voice.example.test',
			reason: 'server-update',
		});
		const second = lifecycle.createAttempt({
			guildId: 'guild-1',
			channelId: 'channel-1',
			connectionId: 'conn-2',
			endpoint: 'wss://voice.example.test',
			reason: 'connect-timeout-retry',
		});

		lifecycle.clearActiveAttempt(first);

		expect(first.id).toBe(1);
		expect(second.id).toBe(2);
		expect(lifecycle.activeAttemptId).toBe(2);
		expect(lifecycle.isActiveAttempt(second)).toBe(true);
	});

	it('checks the active attempt against the current connection identity', () => {
		const lifecycle = new VoiceEngineV2AppNativeVoiceConnectionLifecycle();
		const attempt = lifecycle.createAttempt({
			guildId: 'guild-1',
			channelId: 'channel-1',
			connectionId: 'conn-1',
			endpoint: 'wss://voice.example.test',
			reason: 'server-update',
		});

		expect(lifecycle.isCurrentAttemptForConnection(attempt, connectionState())).toBe(true);
		expect(lifecycle.isCurrentAttemptForConnection(attempt, connectionState({connectionId: 'conn-2'}))).toBe(false);
	});

	it('detects duplicate active and ready server updates', () => {
		const lifecycle = new VoiceEngineV2AppNativeVoiceConnectionLifecycle();
		lifecycle.createAttempt({
			guildId: 'guild-1',
			channelId: 'channel-1',
			connectionId: 'conn-1',
			endpoint: 'wss://voice.example.test',
			reason: 'server-update',
		});
		const update = {
			guildId: 'guild-1',
			channelId: 'channel-1',
			connectionId: 'conn-1',
			endpoint: 'wss://voice.example.test',
			token: 'token-1',
		};

		expect(lifecycle.isDuplicateServerUpdate(update, connectionState(), 'token-1')).toBe(true);
		expect(
			lifecycle.isDuplicateServerUpdate(update, connectionState({voiceServerEndpoint: 'wss://other'}), 'token-1'),
		).toBe(false);

		lifecycle.clearSession();
		lifecycle.setReadyConnectionId('conn-1');
		expect(
			lifecycle.isDuplicateServerUpdate(update, connectionState({connecting: false, connected: true}), 'token-1'),
		).toBe(true);
	});
});
