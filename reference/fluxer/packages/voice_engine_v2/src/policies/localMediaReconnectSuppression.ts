// SPDX-License-Identifier: AGPL-3.0-or-later

export type VoiceEngineV2ReconnectTrackSource =
	| 'microphone'
	| 'camera'
	| 'screen_share'
	| 'screen'
	| 'unknown'
	| string;

export interface VoiceEngineV2LocalTrackReconnectState {
	source: VoiceEngineV2ReconnectTrackSource;
	enabled: boolean;
	reconnecting: boolean;
	restoreVideo: boolean;
	restoreStream: boolean;
}

export function shouldSuppressVoiceEngineV2LocalTrackStateDuringReconnect({
	source,
	enabled,
	reconnecting,
	restoreVideo,
	restoreStream,
}: VoiceEngineV2LocalTrackReconnectState): boolean {
	if (enabled || !reconnecting) return false;
	if (source === 'camera') return restoreVideo;
	if (source === 'screen_share' || source === 'screen') return restoreStream;
	return false;
}
