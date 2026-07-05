// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {
	isMoreEfficientVoiceEngineV2VideoCodec,
	maxDecodableVoiceEngineV2VideoCodec,
	planVoiceEngineV2NegotiatedVideoCodec,
	VOICE_ENGINE_V2_VIDEO_CODEC_PREFERENCE,
	voiceEngineV2VideoCodecRank,
	worseVoiceEngineV2VideoCodec,
} from './codecNegotiation';

describe('voice engine v2 codec negotiation policy', () => {
	it('orders codecs most-efficient to most-compatible', () => {
		expect(VOICE_ENGINE_V2_VIDEO_CODEC_PREFERENCE).toEqual(['av1', 'h265', 'vp9', 'h264', 'vp8']);
		expect(voiceEngineV2VideoCodecRank('av1')).toBeLessThan(voiceEngineV2VideoCodecRank('h265'));
		expect(voiceEngineV2VideoCodecRank('h265')).toBeLessThan(voiceEngineV2VideoCodecRank('vp9'));
		expect(voiceEngineV2VideoCodecRank('vp9')).toBeLessThan(voiceEngineV2VideoCodecRank('h264'));
		expect(voiceEngineV2VideoCodecRank('h264')).toBeLessThan(voiceEngineV2VideoCodecRank('vp8'));
	});

	it('ranks unknown and empty codecs past the floor', () => {
		expect(voiceEngineV2VideoCodecRank('')).toBe(VOICE_ENGINE_V2_VIDEO_CODEC_PREFERENCE.length);
		expect(voiceEngineV2VideoCodecRank(undefined)).toBe(VOICE_ENGINE_V2_VIDEO_CODEC_PREFERENCE.length);
	});

	it('compares efficiency and compatibility', () => {
		expect(isMoreEfficientVoiceEngineV2VideoCodec('av1', 'h264')).toBe(true);
		expect(isMoreEfficientVoiceEngineV2VideoCodec('vp8', 'vp9')).toBe(false);
		expect(worseVoiceEngineV2VideoCodec('av1', 'h264')).toBe('h264');
		expect(worseVoiceEngineV2VideoCodec('vp8', 'vp9')).toBe('vp8');
	});

	it('computes a viewer max-decodable codec from its supported set', () => {
		expect(maxDecodableVoiceEngineV2VideoCodec(['h264', 'vp8', 'vp9'])).toBe('vp9');
		expect(maxDecodableVoiceEngineV2VideoCodec(['vp8', 'av1', 'h264'])).toBe('av1');
		expect(maxDecodableVoiceEngineV2VideoCodec([])).toBeNull();
		expect(maxDecodableVoiceEngineV2VideoCodec(['', 'totally-unknown' as never])).toBeNull();
	});

	it('uses the preferred codec when no viewer constrains it', () => {
		const plan = planVoiceEngineV2NegotiatedVideoCodec({
			preferred: 'av1',
			viewers: [
				{identity: 'alice', maxVideoCodec: 'av1'},
				{identity: 'bob', maxVideoCodec: 'av1'},
			],
		});
		expect(plan.codec).toBe('av1');
		expect(plan.reason).toBe('preferred');
		expect(plan.constrainedBy).toBeNull();
	});

	it('clamps down to the worst current viewer when one cannot decode the preferred codec', () => {
		const plan = planVoiceEngineV2NegotiatedVideoCodec({
			preferred: 'av1',
			viewers: [
				{identity: 'alice', maxVideoCodec: 'av1'},
				{identity: 'bob', maxVideoCodec: 'h264'},
			],
		});
		expect(plan.codec).toBe('h264');
		expect(plan.reason).toBe('clampedToViewer');
		expect(plan.constrainedBy).toBe('bob');
	});

	it('is order-independent and clamps to the single worst viewer', () => {
		const viewers = [
			{identity: 'alice', maxVideoCodec: 'vp9' as const},
			{identity: 'carol', maxVideoCodec: 'h264' as const},
			{identity: 'bob', maxVideoCodec: 'h265' as const},
		];
		const forward = planVoiceEngineV2NegotiatedVideoCodec({preferred: 'av1', viewers});
		const reversed = planVoiceEngineV2NegotiatedVideoCodec({preferred: 'av1', viewers: [...viewers].reverse()});
		expect(forward.codec).toBe('h264');
		expect(forward.constrainedBy).toBe('carol');
		expect(reversed.codec).toBe('h264');
		expect(reversed.constrainedBy).toBe('carol');
	});

	it('does not constrain on viewers with unknown capability (optimistic until they report)', () => {
		const plan = planVoiceEngineV2NegotiatedVideoCodec({
			preferred: 'av1',
			viewers: [
				{identity: 'alice', maxVideoCodec: null},
				{identity: 'bob', maxVideoCodec: 'vp9'},
			],
		});
		expect(plan.codec).toBe('vp9');
		expect(plan.constrainedBy).toBe('bob');
	});

	it('never upgrades beyond the preferred codec even if every viewer supports better', () => {
		const plan = planVoiceEngineV2NegotiatedVideoCodec({
			preferred: 'h264',
			viewers: [
				{identity: 'alice', maxVideoCodec: 'av1'},
				{identity: 'bob', maxVideoCodec: 'av1'},
			],
		});
		expect(plan.codec).toBe('h264');
		expect(plan.reason).toBe('preferred');
	});
});
