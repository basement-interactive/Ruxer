// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import type {VoiceEngineV2InboundVideoFrame} from '../protocol/types';
import {
	VOICE_ENGINE_V2_FRAME_STATS_TRACKS_CAP,
	VoiceEngineV2FrameStatsAccumulator,
	type VoiceEngineV2FrameStatsEvent,
} from './frameStatsBatching';

function makeFrame(overrides: Partial<VoiceEngineV2InboundVideoFrame> = {}): VoiceEngineV2InboundVideoFrame {
	return {
		participantSid: 'PA_alice',
		participantIdentity: 'alice',
		trackSid: 'TR_screen',
		width: 1280,
		height: 720,
		timestampUs: 1000,
		byteLength: 1_382_400,
		...overrides,
	};
}

function collectFlush(accumulator: VoiceEngineV2FrameStatsAccumulator): Array<VoiceEngineV2FrameStatsEvent> {
	const events: Array<VoiceEngineV2FrameStatsEvent> = [];
	accumulator.flushDirty((event) => events.push(event));
	return events;
}

describe('voice engine v2 frame stats accumulator', () => {
	it('accumulates a cumulative frame count and flushes one absolute event per dirty track', () => {
		const accumulator = new VoiceEngineV2FrameStatsAccumulator();
		for (let index = 1; index <= 30; index += 1) {
			expect(accumulator.record(makeFrame({timestampUs: index * 33_333}))).toBe(true);
		}
		expect(accumulator.trackedTracksCount).toBe(1);
		expect(accumulator.dirtyTracksCount).toBe(1);

		const events = collectFlush(accumulator);
		expect(events).toEqual([
			{
				type: 'inboundVideo.frameStats',
				stats: {
					participantSid: 'PA_alice',
					participantIdentity: 'alice',
					trackSid: 'TR_screen',
					width: 1280,
					height: 720,
					frameCount: 30,
					lastFrameTimestampUs: 30 * 33_333,
					lastFrameByteLength: 1_382_400,
				},
			},
		]);
		expect(accumulator.dirtyTracksCount).toBe(0);
		expect(collectFlush(accumulator)).toEqual([]);
	});

	it('keeps the cumulative count across flushes and reuses the same record without re-allocating slots', () => {
		const accumulator = new VoiceEngineV2FrameStatsAccumulator();
		accumulator.record(makeFrame({timestampUs: 1000}));
		collectFlush(accumulator);
		accumulator.record(makeFrame({timestampUs: 2000, width: 640, height: 360, byteLength: undefined}));

		const events = collectFlush(accumulator);
		expect(events).toHaveLength(1);
		expect(events[0]?.stats).toMatchObject({
			frameCount: 2,
			lastFrameTimestampUs: 2000,
			lastFrameByteLength: null,
			width: 640,
			height: 360,
		});
		expect(accumulator.trackedTracksCount).toBe(1);
	});

	it('omits participantIdentity when never observed for the track', () => {
		const accumulator = new VoiceEngineV2FrameStatsAccumulator();
		accumulator.record(makeFrame({participantIdentity: undefined}));

		const events = collectFlush(accumulator);
		expect(events).toHaveLength(1);
		expect(events[0]?.stats).not.toHaveProperty('participantIdentity');
	});

	it('drops updates for new tracks at the cap and counts the drops', () => {
		const accumulator = new VoiceEngineV2FrameStatsAccumulator();
		for (let index = 0; index < VOICE_ENGINE_V2_FRAME_STATS_TRACKS_CAP; index += 1) {
			expect(accumulator.record(makeFrame({trackSid: `TR_${index}`}))).toBe(true);
		}
		expect(accumulator.trackedTracksCount).toBe(VOICE_ENGINE_V2_FRAME_STATS_TRACKS_CAP);

		expect(accumulator.record(makeFrame({trackSid: 'TR_overflow'}))).toBe(false);
		expect(accumulator.droppedUpdatesCount).toBe(1);
		expect(accumulator.record(makeFrame({trackSid: 'TR_0'}))).toBe(true);
		expect(accumulator.trackedTracksCount).toBe(VOICE_ENGINE_V2_FRAME_STATS_TRACKS_CAP);

		accumulator.removeTrack('TR_1');
		expect(accumulator.record(makeFrame({trackSid: 'TR_overflow'}))).toBe(true);
		expect(accumulator.trackedTracksCount).toBe(VOICE_ENGINE_V2_FRAME_STATS_TRACKS_CAP);
	});

	it('removes dirty bookkeeping when a tracked track is removed before a flush', () => {
		const accumulator = new VoiceEngineV2FrameStatsAccumulator();
		accumulator.record(makeFrame({trackSid: 'TR_a'}));
		accumulator.record(makeFrame({trackSid: 'TR_b'}));
		expect(accumulator.dirtyTracksCount).toBe(2);

		accumulator.removeTrack('TR_a');
		expect(accumulator.dirtyTracksCount).toBe(1);
		const events = collectFlush(accumulator);
		expect(events).toHaveLength(1);
		expect(events[0]?.stats.trackSid).toBe('TR_b');
	});

	it('clear resets records, dirty bookkeeping, and keeps the dropped counter', () => {
		const accumulator = new VoiceEngineV2FrameStatsAccumulator();
		for (let index = 0; index <= VOICE_ENGINE_V2_FRAME_STATS_TRACKS_CAP; index += 1) {
			accumulator.record(makeFrame({trackSid: `TR_${index}`}));
		}
		expect(accumulator.droppedUpdatesCount).toBe(1);

		accumulator.clear();
		expect(accumulator.trackedTracksCount).toBe(0);
		expect(accumulator.dirtyTracksCount).toBe(0);
		expect(accumulator.droppedUpdatesCount).toBe(1);
		expect(collectFlush(accumulator)).toEqual([]);
	});
});
