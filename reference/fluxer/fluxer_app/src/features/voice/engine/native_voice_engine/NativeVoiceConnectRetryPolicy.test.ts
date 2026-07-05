// SPDX-License-Identifier: AGPL-3.0-or-later

import {shouldRetryVoiceEngineV2NativeConnectTimeout} from '@fluxer/voice_engine_v2';
import {describe, expect, it} from 'vitest';
import {shouldRetryNativeVoiceConnectTimeout} from './NativeVoiceConnectRetryPolicy';

describe('NativeVoiceConnectRetryPolicy', () => {
	it('is a compatibility export for the v2 native connect retry policy', () => {
		expect(shouldRetryNativeVoiceConnectTimeout).toBe(shouldRetryVoiceEngineV2NativeConnectTimeout);
	});
});
