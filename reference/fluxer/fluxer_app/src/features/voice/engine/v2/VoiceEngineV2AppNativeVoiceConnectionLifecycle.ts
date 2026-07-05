// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import type {VoiceConnectionState} from './VoiceEngineV2AppConnectionHostAdapter';

export type VoiceEngineV2AppNativeVoiceConnectReason =
	| 'server-update'
	| 'connect-timeout-retry'
	| 'transport-reconnect';

export interface VoiceEngineV2AppNativeVoiceConnectAttempt {
	id: number;
	guildId: string | null;
	channelId: string;
	connectionId: string | null;
	endpoint: string;
	reason: VoiceEngineV2AppNativeVoiceConnectReason;
}

export interface VoiceEngineV2AppNativeVoiceServerUpdateIdentity {
	guildId: string | null;
	channelId: string;
	connectionId: string | null;
	endpoint: string;
	token: string;
}

export class VoiceEngineV2AppNativeVoiceConnectionLifecycle {
	private connectAttemptSerial = 0;
	private activeAttempt: VoiceEngineV2AppNativeVoiceConnectAttempt | null = null;
	private readyConnectionIdValue: string | null = null;

	get activeAttemptId(): number | null {
		return this.activeAttempt?.id ?? null;
	}

	get currentAttempt(): VoiceEngineV2AppNativeVoiceConnectAttempt | null {
		return this.activeAttempt;
	}

	get readyConnectionId(): string | null {
		return this.readyConnectionIdValue;
	}

	setReadyConnectionId(connectionId: string | null): void {
		assert.ok(connectionId === null || typeof connectionId === 'string', 'ready connection id must be string or null');
		this.readyConnectionIdValue = connectionId;
	}

	createAttempt(
		input: Omit<VoiceEngineV2AppNativeVoiceConnectAttempt, 'id'>,
	): VoiceEngineV2AppNativeVoiceConnectAttempt {
		assert.ok(input !== null && typeof input === 'object', 'native voice attempt input is required');
		assert.equal(typeof input.channelId, 'string', 'native voice attempt channelId must be a string');
		assert.ok(input.channelId.length > 0, 'native voice attempt channelId must not be empty');
		assert.equal(typeof input.endpoint, 'string', 'native voice attempt endpoint must be a string');
		assert.ok(input.endpoint.length > 0, 'native voice attempt endpoint must not be empty');
		this.connectAttemptSerial += 1;
		const attempt = {...input, id: this.connectAttemptSerial};
		this.activeAttempt = attempt;
		return attempt;
	}

	clearActiveAttempt(attempt?: VoiceEngineV2AppNativeVoiceConnectAttempt): void {
		if (attempt && this.activeAttempt?.id !== attempt.id) return;
		this.activeAttempt = null;
	}

	clearSession(): void {
		this.clearActiveAttempt();
		this.readyConnectionIdValue = null;
	}

	isActiveAttempt(attempt: VoiceEngineV2AppNativeVoiceConnectAttempt): boolean {
		assert.ok(attempt !== null && typeof attempt === 'object', 'active attempt check requires an attempt');
		assert.ok(Number.isInteger(attempt.id), 'active attempt id must be an integer');
		return this.activeAttempt?.id === attempt.id;
	}

	isCurrentAttemptForConnection(
		attempt: VoiceEngineV2AppNativeVoiceConnectAttempt,
		current: VoiceConnectionState,
	): boolean {
		assert.ok(current !== null && typeof current === 'object', 'current voice connection state is required');
		if (!this.isActiveAttempt(attempt)) return false;
		if (current.connectionId !== attempt.connectionId) return false;
		if (current.channelId !== attempt.channelId) return false;
		return (current.guildId ?? null) === attempt.guildId;
	}

	isDuplicateServerUpdate(
		update: VoiceEngineV2AppNativeVoiceServerUpdateIdentity,
		current: VoiceConnectionState,
		previousToken: string | null,
	): boolean {
		assert.ok(update !== null && typeof update === 'object', 'server update identity is required');
		assert.ok(current !== null && typeof current === 'object', 'current voice connection state is required');
		if (!update.connectionId) return false;
		if (previousToken !== update.token) return false;
		if (!voiceConnectionMatchesUpdate(current, update)) return false;
		if (!current.connecting && !current.connected && !current.reconnecting) return false;
		if (this.readyConnectionIdValue === update.connectionId && current.connected) return true;
		return attemptMatchesUpdate(this.activeAttempt, update);
	}
}

function voiceConnectionMatchesUpdate(
	current: VoiceConnectionState,
	update: VoiceEngineV2AppNativeVoiceServerUpdateIdentity,
): boolean {
	if (current.guildId !== update.guildId) return false;
	if (current.channelId !== update.channelId) return false;
	if (current.connectionId !== update.connectionId) return false;
	return current.voiceServerEndpoint === update.endpoint;
}

function attemptMatchesUpdate(
	attempt: VoiceEngineV2AppNativeVoiceConnectAttempt | null,
	update: VoiceEngineV2AppNativeVoiceServerUpdateIdentity,
): boolean {
	if (!attempt) return false;
	if (attempt.guildId !== update.guildId) return false;
	if (attempt.channelId !== update.channelId) return false;
	if (attempt.connectionId !== update.connectionId) return false;
	return attempt.endpoint === update.endpoint;
}
