// SPDX-License-Identifier: AGPL-3.0-or-later

import {selectNativeCameraLocalPreviewTrack} from '@app/features/voice/engine/native_voice_engine/NativeCameraPreviewTrackSelection';
import type {NativeInboundVideoTrack} from '@app/features/voice/engine/native_voice_engine/NativeVideoTileManager';
import {VoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';
import {describe, expect, it} from 'vitest';

function track({
	participantIdentity,
	participantSid,
	source = VoiceTrackSource.Camera,
	trackSid,
}: {
	participantIdentity?: string;
	participantSid: string;
	source?: string;
	trackSid: string;
}): NativeInboundVideoTrack {
	return {
		height: 0,
		participantIdentity,
		participantSid,
		source,
		stream: {id: `stream-${trackSid}`} as MediaStream,
		trackSid,
		width: 0,
	};
}

function trackMap(...tracks: Array<NativeInboundVideoTrack>): Readonly<Record<string, NativeInboundVideoTrack>> {
	return Object.fromEntries(tracks.map((entry) => [entry.trackSid, entry]));
}

describe('selectNativeCameraLocalPreviewTrack', () => {
	it('uses the current published camera track when the facade recorded its sid', () => {
		const camera = track({
			participantIdentity: 'user_1_connection_1',
			participantSid: 'PA_local',
			trackSid: 'TR_camera',
		});

		const selected = selectNativeCameraLocalPreviewTrack({
			currentTrackSid: 'TR_camera',
			localParticipant: null,
			sessionTrackSid: null,
			tracks: trackMap(camera),
		});

		expect(selected).toBe(camera);
	});

	it('falls back to the local participant identity when camera frames auto-registered the live tile', () => {
		const camera = track({
			participantIdentity: 'user_1_connection_1',
			participantSid: 'PA_native',
			trackSid: 'TR_camera',
		});
		const remote = track({
			participantIdentity: 'user_2_connection_2',
			participantSid: 'PA_remote',
			trackSid: 'TR_remote',
		});

		const selected = selectNativeCameraLocalPreviewTrack({
			currentTrackSid: null,
			localParticipant: {identity: 'user_1_connection_1', sid: 'PA_livekit'},
			sessionTrackSid: null,
			tracks: trackMap(remote, camera),
		});

		expect(selected).toBe(camera);
	});

	it('ignores the standalone preview session track while selecting the published local camera', () => {
		const preview = track({
			participantSid: 'local-camera-preview',
			trackSid: 'local-camera-preview',
		});
		const camera = track({
			participantIdentity: 'user_1_connection_1',
			participantSid: 'PA_local',
			trackSid: 'TR_camera',
		});

		const selected = selectNativeCameraLocalPreviewTrack({
			currentTrackSid: null,
			localParticipant: {identity: 'user_1_connection_1', sid: 'PA_local'},
			sessionTrackSid: 'local-camera-preview',
			tracks: trackMap(preview, camera),
		});

		expect(selected).toBe(camera);
	});
});
