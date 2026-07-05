// SPDX-License-Identifier: AGPL-3.0-or-later

import {getVoiceEngineV2MicrophoneOperationFailureAction} from '@fluxer/voice_engine_v2';
import {describe, expect, it} from 'vitest';
import {getNativeMicrophoneOperationFailureAction} from './NativeMicrophoneOperationFailurePolicy';

describe('NativeMicrophoneOperationFailurePolicy', () => {
	it('is a compatibility export for the v2 microphone failure policy', () => {
		expect(getNativeMicrophoneOperationFailureAction).toBe(getVoiceEngineV2MicrophoneOperationFailureAction);
	});
});
