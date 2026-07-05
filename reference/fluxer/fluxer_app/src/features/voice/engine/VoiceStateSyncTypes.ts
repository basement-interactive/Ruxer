// SPDX-License-Identifier: AGPL-3.0-or-later

export interface VoiceStateSyncPayload {
	guild_id: string | null;
	channel_id: string;
	connection_id: string;
	self_mute: boolean;
	self_deaf: boolean;
	self_video: boolean;
	self_stream: boolean;
	viewer_stream_keys: ReadonlyArray<string>;
}

export type VoiceStateSyncPartial = Partial<
	Pick<VoiceStateSyncPayload, 'self_video' | 'self_stream' | 'self_mute' | 'self_deaf' | 'viewer_stream_keys'>
>;
