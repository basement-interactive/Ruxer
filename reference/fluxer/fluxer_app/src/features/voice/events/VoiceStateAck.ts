// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import type {VoiceState} from '@app/features/gateway/types/GatewayVoiceTypes';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';

export interface VoiceStateAckPayload {
	mutation_id?: string;
	runtime_epoch?: string | null;
	connection_id?: string | null;
	guild_id?: string | null;
	channel_id?: string | null;
	status?: string;
	server_version?: number;
	canonical_state?: VoiceState | null;
	error_code?: string;
	error_message?: string;
}

export function handleVoiceStateAck(data: VoiceStateAckPayload, _context: GatewayHandlerContext): void {
	MediaEngine.handleGatewayVoiceStateAck(data);
}
