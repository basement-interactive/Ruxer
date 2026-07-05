// SPDX-License-Identifier: AGPL-3.0-or-later

import {collectNativeVoiceEngineConnectedRosterPublishedTracks} from '@app/features/voice/engine/native_voice_engine/nativeVoiceEngineEventMapper';
import {VoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';
import {describe, expect, it} from 'vitest';

describe('collectNativeVoiceEngineConnectedRosterPublishedTracks', () => {
	it('includes screen-share audio publications for subscription reattach', () => {
		const tracks = collectNativeVoiceEngineConnectedRosterPublishedTracks({
			participants: [
				{
					identity: 'user_1',
					tracks: [{source: 'screen_share_audio'}, {source: 'screen_share'}, {source: 'microphone'}],
				},
			],
		});

		expect(tracks).toEqual([
			{identity: 'user_1', source: VoiceTrackSource.ScreenShareAudio},
			{identity: 'user_1', source: VoiceTrackSource.ScreenShare},
		]);
	});
});
