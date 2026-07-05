// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {
	decodeVoiceEngineV2CodecGossip,
	encodeVoiceEngineV2CodecGossip,
	VOICE_ENGINE_V2_CODEC_GOSSIP_TOPIC,
} from './codecGossip';
import type {VoiceEngineV2CodecGossipMessage} from './types';

describe('voice engine v2 codec gossip wire protocol', () => {
	it('exposes a stable topic', () => {
		expect(VOICE_ENGINE_V2_CODEC_GOSSIP_TOPIC).toBe('fluxer.codec.v1');
	});

	it('round-trips a capability message', () => {
		const message: VoiceEngineV2CodecGossipMessage = {
			kind: 'codec.capability',
			supportedVideoCodecs: ['av1', 'vp9', 'h264', 'vp8'],
		};
		const decoded = decodeVoiceEngineV2CodecGossip(encodeVoiceEngineV2CodecGossip(message));
		expect(decoded).toEqual(message);
	});

	it('round-trips a viewing message', () => {
		const message: VoiceEngineV2CodecGossipMessage = {
			kind: 'codec.viewing',
			source: 'screen',
			watching: true,
			supportedVideoCodecs: ['h264', 'vp8'],
		};
		const decoded = decodeVoiceEngineV2CodecGossip(encodeVoiceEngineV2CodecGossip(message));
		expect(decoded).toEqual(message);
	});

	it('decodes from a raw ArrayBuffer payload', () => {
		const bytes = encodeVoiceEngineV2CodecGossip({kind: 'codec.capability', supportedVideoCodecs: ['av1']});
		const buffer = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(buffer).set(bytes);
		expect(decodeVoiceEngineV2CodecGossip(buffer)).toEqual({kind: 'codec.capability', supportedVideoCodecs: ['av1']});
	});

	it('rejects malformed and adversarial payloads as null', () => {
		expect(decodeVoiceEngineV2CodecGossip('not json')).toBeNull();
		expect(decodeVoiceEngineV2CodecGossip('123')).toBeNull();
		expect(decodeVoiceEngineV2CodecGossip(JSON.stringify({kind: 'other'}))).toBeNull();
		expect(decodeVoiceEngineV2CodecGossip(JSON.stringify({kind: 'codec.capability'}))).toBeNull();
		expect(
			decodeVoiceEngineV2CodecGossip(JSON.stringify({kind: 'codec.capability', supportedVideoCodecs: ['fake']})),
		).toBeNull();
		expect(
			decodeVoiceEngineV2CodecGossip(
				JSON.stringify({kind: 'codec.viewing', source: 'mic', watching: true, supportedVideoCodecs: []}),
			),
		).toBeNull();
		expect(
			decodeVoiceEngineV2CodecGossip(
				JSON.stringify({kind: 'codec.viewing', source: 'camera', watching: 'yes', supportedVideoCodecs: []}),
			),
		).toBeNull();
	});

	it('rejects an oversized codec list', () => {
		const tooMany = JSON.stringify({
			kind: 'codec.capability',
			supportedVideoCodecs: ['av1', 'av1', 'av1', 'av1', 'av1', 'av1', 'av1', 'av1', 'av1'],
		});
		expect(decodeVoiceEngineV2CodecGossip(tooMany)).toBeNull();
	});
});
