// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';

interface VoiceServerUpdatePayload {
	token: string;
	endpoint: string;
	connection_id: string;
	guild_id?: string;
	channel_id?: string;
	e2ee_key?: string | null;
}

export function handleVoiceServerUpdate(data: VoiceServerUpdatePayload, _context: GatewayHandlerContext): void {
	MediaEngine.handleVoiceServerUpdate({
		token: data.token,
		endpoint: data.endpoint,
		connection_id: data.connection_id,
		guild_id: data.guild_id,
		channel_id: data.channel_id,
		e2ee_key: data.e2ee_key ?? null,
	});
}
