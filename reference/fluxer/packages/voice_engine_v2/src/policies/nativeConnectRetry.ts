// SPDX-License-Identifier: AGPL-3.0-or-later

const PRIVATE_VOICE_SCOPE_ID = '@me';

export interface VoiceEngineV2RetryVoiceState {
	guild_id: string | null;
	channel_id: string | null;
}

export interface VoiceEngineV2RetryConnectionState {
	connectionId: string | null;
	guildId: string | null;
	channelId: string | null;
	connecting: boolean;
	connected: boolean;
	reconnecting: boolean;
}

export interface VoiceEngineV2NativeConnectRetryPolicyInput {
	connectionId: string;
	guildId: string | null;
	channelId: string;
	voiceState: VoiceEngineV2RetryVoiceState | null;
	connectionState: VoiceEngineV2RetryConnectionState;
}

function normalizeVoiceScope(guildId: string | null | undefined): string {
	return guildId ?? PRIVATE_VOICE_SCOPE_ID;
}

function isGatewayVoiceStateActiveForConnection({
	guildId,
	channelId,
	voiceState,
}: VoiceEngineV2NativeConnectRetryPolicyInput): boolean {
	if (!voiceState?.channel_id) return false;
	return (
		voiceState.channel_id === channelId && normalizeVoiceScope(voiceState.guild_id) === normalizeVoiceScope(guildId)
	);
}

function isAcceptedVoiceConnectionStillActive({
	connectionId,
	guildId,
	channelId,
	connectionState,
}: VoiceEngineV2NativeConnectRetryPolicyInput): boolean {
	return (
		connectionState.connectionId === connectionId &&
		connectionState.channelId === channelId &&
		normalizeVoiceScope(connectionState.guildId) === normalizeVoiceScope(guildId) &&
		(connectionState.connecting || connectionState.connected || connectionState.reconnecting)
	);
}

export function shouldRetryVoiceEngineV2NativeConnectTimeout(
	input: VoiceEngineV2NativeConnectRetryPolicyInput,
): boolean {
	return isGatewayVoiceStateActiveForConnection(input) || isAcceptedVoiceConnectionStillActive(input);
}
