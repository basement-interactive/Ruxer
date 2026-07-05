// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import type {
	VoiceDebugLoggingEventsResponse,
	VoiceDebugLoggingStatusResponse,
} from '@fluxer/schema/src/domains/channel/ChannelSchemas';

export interface VoiceDebugLoggingEvent {
	type: string;
	timestamp_ns: string;
	monotonic_ns?: string;
	data?: Record<string, unknown>;
}

export async function fetchStatus(channelId: string): Promise<VoiceDebugLoggingStatusResponse> {
	const response = await http.get<VoiceDebugLoggingStatusResponse>(
		Endpoints.CHANNEL_VOICE_DEBUG_LOGGING_SESSION(channelId),
		{retries: 1},
	);
	return (
		response.body ?? {
			active: false,
			session_id: null,
			activated_by_user_id: null,
			started_at_ms: null,
			expires_at_ms: null,
			poll_interval_ms: 10000,
			upload_interval_ms: 2000,
		}
	);
}

export async function setEnabled(channelId: string, enabled: boolean): Promise<VoiceDebugLoggingStatusResponse> {
	const response = await http.put<VoiceDebugLoggingStatusResponse>(
		Endpoints.CHANNEL_VOICE_DEBUG_LOGGING_SESSION(channelId),
		{body: {enabled}, retries: 1},
	);
	const fallback = response.body ?? {
		active: false,
		session_id: null,
		activated_by_user_id: null,
		started_at_ms: null,
		expires_at_ms: null,
		poll_interval_ms: 10000,
		upload_interval_ms: 2000,
	};
	return await fetchStatus(channelId).catch(() => fallback);
}

export async function uploadEvents(params: {
	channelId: string;
	sessionId: string;
	connectionId: string | null;
	participantIdentity: string | null;
	events: Array<VoiceDebugLoggingEvent>;
}): Promise<VoiceDebugLoggingEventsResponse> {
	const response = await http.post<VoiceDebugLoggingEventsResponse>(
		Endpoints.CHANNEL_VOICE_DEBUG_LOGGING_EVENTS(params.channelId),
		{
			body: {
				session_id: params.sessionId,
				connection_id: params.connectionId ?? undefined,
				participant_identity: params.participantIdentity ?? undefined,
				events: params.events,
			},
			retries: 1,
		},
	);
	return response.body ?? {accepted: false, active: false, stored_event_count: 0};
}
