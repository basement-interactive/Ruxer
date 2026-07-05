// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import type {
	VoicePresenceHeartbeatEndResponse,
	VoicePresenceHeartbeatResponse,
} from '@fluxer/schema/src/domains/channel/ChannelSchemas';

export async function heartbeat(params: {
	channelId: string;
	connectionId: string;
}): Promise<VoicePresenceHeartbeatResponse> {
	const response = await http.post<VoicePresenceHeartbeatResponse>(
		Endpoints.CHANNEL_VOICE_PRESENCE_HEARTBEAT(params.channelId),
		{
			body: {connection_id: params.connectionId},
			mode: 'silent',
			retries: 1,
			timeoutMs: 5000,
		},
	);
	if (response.ok && response.body && typeof response.body.ok === 'boolean') {
		return response.body;
	}
	return {
		ok: false,
		heartbeat_interval_ms: 15000,
		heartbeat_ttl_ms: 45000,
		expires_at_ms: 0,
	};
}

export async function end(params: {
	channelId: string;
	connectionId: string;
}): Promise<VoicePresenceHeartbeatEndResponse> {
	const response = await http.delete<VoicePresenceHeartbeatEndResponse>(
		Endpoints.CHANNEL_VOICE_PRESENCE_HEARTBEAT(params.channelId),
		{
			body: {connection_id: params.connectionId},
			mode: 'silent',
			retries: 1,
			timeoutMs: 5000,
		},
	);
	if (response.ok && response.body && typeof response.body.ok === 'boolean') {
		return response.body;
	}
	return {ok: false};
}
