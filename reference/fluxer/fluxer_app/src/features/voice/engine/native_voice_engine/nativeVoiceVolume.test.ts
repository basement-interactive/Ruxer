// SPDX-License-Identifier: AGPL-3.0-or-later

import {computeNativeParticipantVolume} from '@app/features/voice/engine/native_voice_engine/nativeVoiceVolume';
import {computeVoiceEngineV2NativeParticipantVolume} from '@fluxer/voice_engine_v2';
import {describe, expect, it} from 'vitest';

describe('computeNativeParticipantVolume', () => {
	it('is a compatibility export for the v2 native participant volume policy', () => {
		expect(computeNativeParticipantVolume).toBe(computeVoiceEngineV2NativeParticipantVolume);
	});
});
