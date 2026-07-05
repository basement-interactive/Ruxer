// SPDX-License-Identifier: AGPL-3.0-or-later

import type {VoiceEngineV2VideoCodec} from '@fluxer/voice_engine_v2';
import {describe, expect, it} from 'vitest';
import {capVoiceEngineV2DecodableVideoCodecs} from './VoiceEngineV2AppCodecCapability';

const FULL: Array<VoiceEngineV2VideoCodec> = ['av1', 'h265', 'vp9', 'h264', 'vp8'];

describe('capVoiceEngineV2DecodableVideoCodecs', () => {
	it('is a no-op for auto', () => {
		expect(capVoiceEngineV2DecodableVideoCodecs(FULL, 'auto')).toEqual(FULL);
	});

	it('drops codecs more efficient than the cap so the advertised best is the cap', () => {
		expect(capVoiceEngineV2DecodableVideoCodecs(FULL, 'h264')).toEqual(['h264', 'vp8']);
		expect(capVoiceEngineV2DecodableVideoCodecs(FULL, 'vp9')).toEqual(['vp9', 'h264', 'vp8']);
		expect(capVoiceEngineV2DecodableVideoCodecs(FULL, 'vp8')).toEqual(['vp8']);
	});

	it('keeps the cap and everything more compatible, regardless of true support gaps', () => {
		const partial: Array<VoiceEngineV2VideoCodec> = ['av1', 'h264', 'vp8'];
		expect(capVoiceEngineV2DecodableVideoCodecs(partial, 'vp9')).toEqual(['h264', 'vp8']);
	});
});
