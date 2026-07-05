// SPDX-License-Identifier: AGPL-3.0-or-later

import {shouldSuppressVoiceEngineV2LocalTrackStateDuringReconnect} from '@fluxer/voice_engine_v2';
import {describe, expect, it} from 'vitest';
import {shouldSuppressNativeLocalTrackStateDuringReconnect} from './NativeLocalMediaReconnectPolicy';

describe('NativeLocalMediaReconnectPolicy', () => {
	it('is a compatibility export for the v2 local media reconnect policy', () => {
		expect(shouldSuppressNativeLocalTrackStateDuringReconnect).toBe(
			shouldSuppressVoiceEngineV2LocalTrackStateDuringReconnect,
		);
	});
});
