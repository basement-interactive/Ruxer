// SPDX-License-Identifier: AGPL-3.0-or-later

import {encodeVoiceEngineV2CodecGossip, type VoiceEngineV2WatchedStream} from '@fluxer/voice_engine_v2';
import {describe, expect, it} from 'vitest';
import {
	computeVoiceEngineV2WatchedStreamGossip,
	ingestVoiceEngineV2CodecGossip,
	type VoiceEngineV2CodecGossipController,
} from './VoiceEngineV2AppCodecGossipAdapter';

function recordingController(): VoiceEngineV2CodecGossipController & {
	viewerCalls: Array<unknown>;
	capabilityCalls: Array<unknown>;
} {
	const viewerCalls: Array<unknown> = [];
	const capabilityCalls: Array<unknown> = [];
	return {
		viewerCalls,
		capabilityCalls,
		reportStreamViewer: (source, viewerIdentity, watching, supportedVideoCodecs) => {
			viewerCalls.push({source, viewerIdentity, watching, supportedVideoCodecs});
		},
		reportRemoteVideoCodecCapability: (identity, supportedVideoCodecs) => {
			capabilityCalls.push({identity, supportedVideoCodecs});
		},
	};
}

function watchedStream(participantIdentity: string, source: string): VoiceEngineV2WatchedStream {
	return {participantIdentity, source, trackSid: null, quality: null, enabled: true};
}

describe('ingestVoiceEngineV2CodecGossip', () => {
	it('dispatches a viewing message as a stream-viewer report', () => {
		const controller = recordingController();
		const payload = encodeVoiceEngineV2CodecGossip({
			kind: 'codec.viewing',
			source: 'screen',
			watching: true,
			supportedVideoCodecs: ['h264', 'vp8'],
		});
		expect(ingestVoiceEngineV2CodecGossip(controller, 'bob', payload)).toBe(true);
		expect(controller.viewerCalls).toEqual([
			{source: 'screen', viewerIdentity: 'bob', watching: true, supportedVideoCodecs: ['h264', 'vp8']},
		]);
	});

	it('dispatches a capability message as a remote capability report', () => {
		const controller = recordingController();
		const payload = encodeVoiceEngineV2CodecGossip({kind: 'codec.capability', supportedVideoCodecs: ['av1', 'vp9']});
		expect(ingestVoiceEngineV2CodecGossip(controller, 'alice', payload)).toBe(true);
		expect(controller.capabilityCalls).toEqual([{identity: 'alice', supportedVideoCodecs: ['av1', 'vp9']}]);
	});

	it('ignores malformed payloads and unknown senders without touching the controller', () => {
		const controller = recordingController();
		expect(ingestVoiceEngineV2CodecGossip(controller, 'bob', 'garbage')).toBe(false);
		expect(
			ingestVoiceEngineV2CodecGossip(
				controller,
				'',
				encodeVoiceEngineV2CodecGossip({kind: 'codec.capability', supportedVideoCodecs: []}),
			),
		).toBe(false);
		expect(controller.viewerCalls).toEqual([]);
		expect(controller.capabilityCalls).toEqual([]);
	});
});

describe('computeVoiceEngineV2WatchedStreamGossip', () => {
	it('emits watching=true for newly watched video streams only', () => {
		const previous = new Map<string, {identity: string; source: 'camera' | 'screen'}>();
		const result = computeVoiceEngineV2WatchedStreamGossip(
			previous,
			{
				a: watchedStream('alice', 'screen'),
				b: watchedStream('bob', 'camera'),
				c: watchedStream('carol', 'microphone'),
			},
			['av1', 'h264', 'vp8'],
		);
		expect(result.messages).toEqual([
			{
				destinationIdentity: 'alice',
				message: {
					kind: 'codec.viewing',
					source: 'screen',
					watching: true,
					supportedVideoCodecs: ['av1', 'h264', 'vp8'],
				},
			},
			{
				destinationIdentity: 'bob',
				message: {
					kind: 'codec.viewing',
					source: 'camera',
					watching: true,
					supportedVideoCodecs: ['av1', 'h264', 'vp8'],
				},
			},
		]);
		expect(result.next.size).toBe(2);
	});

	it('emits watching=false when a stream is no longer watched and nothing for steady state', () => {
		const first = computeVoiceEngineV2WatchedStreamGossip(new Map(), {a: watchedStream('alice', 'screen')}, ['h264']);
		const steady = computeVoiceEngineV2WatchedStreamGossip(first.next, {a: watchedStream('alice', 'screen')}, ['h264']);
		expect(steady.messages).toEqual([]);
		const stopped = computeVoiceEngineV2WatchedStreamGossip(steady.next, {}, ['h264']);
		expect(stopped.messages).toEqual([
			{
				destinationIdentity: 'alice',
				message: {kind: 'codec.viewing', source: 'screen', watching: false, supportedVideoCodecs: ['h264']},
			},
		]);
		expect(stopped.next.size).toBe(0);
	});
});
