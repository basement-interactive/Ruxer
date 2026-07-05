// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	NativeVoiceFrameStatsBatcher,
	type NativeVoiceFrameStatsScheduler,
} from '@app/features/voice/engine/native_voice_engine/NativeVoiceFrameStatsBatcher';
import {
	VOICE_ENGINE_V2_FRAME_STATS_FLUSH_INTERVAL_MS,
	VOICE_ENGINE_V2_FRAME_STATS_TRACKS_CAP,
	type VoiceEngineV2FrameStatsEvent,
} from '@fluxer/voice_engine_v2';
import type {VoiceEngineV2BridgeVideoFrame} from '@fluxer/voice_engine_v2/bridge';
import {describe, expect, it} from 'vitest';

interface ManualScheduler extends NativeVoiceFrameStatsScheduler {
	fire(): void;
	readonly activeIntervalCount: number;
	readonly scheduledIntervalsMs: Array<number>;
}

function createManualScheduler(): ManualScheduler {
	const callbacks = new Map<number, () => void>();
	const scheduledIntervalsMs: Array<number> = [];
	let nextHandle = 1;
	return {
		setInterval(callback, ms) {
			const handle = nextHandle++;
			callbacks.set(handle, callback);
			scheduledIntervalsMs.push(ms);
			return handle;
		},
		clearInterval(handle) {
			callbacks.delete(handle as number);
		},
		fire() {
			for (const callback of [...callbacks.values()]) {
				callback();
			}
		},
		get activeIntervalCount() {
			return callbacks.size;
		},
		scheduledIntervalsMs,
	};
}

function makeBridgeFrame(
	overrides: Partial<VoiceEngineV2BridgeVideoFrame['meta']> = {},
): VoiceEngineV2BridgeVideoFrame {
	return {
		meta: {
			participantSid: 'PA_alice',
			trackSid: 'TR_screen',
			width: 1280,
			height: 720,
			timestampUs: 33_333,
			...overrides,
		},
		data: new ArrayBuffer(16),
	};
}

function createBatcher() {
	const scheduler = createManualScheduler();
	const dispatched: Array<VoiceEngineV2FrameStatsEvent> = [];
	const droppedReports: Array<number> = [];
	const batcher = new NativeVoiceFrameStatsBatcher({
		dispatch: (event) => dispatched.push(event),
		scheduler,
		onDroppedUpdates: (count) => droppedReports.push(count),
	});
	return {batcher, scheduler, dispatched, droppedReports};
}

describe('NativeVoiceFrameStatsBatcher', () => {
	it('does not dispatch per frame and emits one absolute stats event per track on the flush cadence', () => {
		const {batcher, scheduler, dispatched} = createBatcher();
		for (let index = 1; index <= 30; index += 1) {
			batcher.recordFrame(makeBridgeFrame({timestampUs: index * 33_333}));
		}
		batcher.recordFrame(makeBridgeFrame({trackSid: 'TR_camera', timestampUs: 999}));
		expect(dispatched).toHaveLength(0);
		expect(scheduler.scheduledIntervalsMs).toEqual([VOICE_ENGINE_V2_FRAME_STATS_FLUSH_INTERVAL_MS]);

		scheduler.fire();
		expect(dispatched).toHaveLength(2);
		expect(dispatched[0]).toEqual({
			type: 'inboundVideo.frameStats',
			stats: {
				participantSid: 'PA_alice',
				trackSid: 'TR_screen',
				width: 1280,
				height: 720,
				frameCount: 30,
				lastFrameTimestampUs: 30 * 33_333,
				lastFrameByteLength: 16,
			},
		});

		scheduler.fire();
		expect(dispatched).toHaveLength(2);
	});

	it('flushes pending counts when a track is removed', () => {
		const {batcher, scheduler, dispatched} = createBatcher();
		batcher.recordFrame(makeBridgeFrame());
		batcher.removeTrack('TR_screen');
		expect(dispatched).toHaveLength(1);
		expect(dispatched[0]?.stats.frameCount).toBe(1);
		expect(batcher.trackedTracksCount).toBe(0);

		scheduler.fire();
		expect(dispatched).toHaveLength(1);
	});

	it('flushes final counts on teardown, cancels the flush timer, and clears tracked state', () => {
		const {batcher, scheduler, dispatched} = createBatcher();
		batcher.recordFrame(makeBridgeFrame({timestampUs: 1000}));
		batcher.recordFrame(makeBridgeFrame({timestampUs: 2000}));
		expect(batcher.isFlushTimerActive).toBe(true);
		expect(scheduler.activeIntervalCount).toBe(1);

		batcher.teardown();
		expect(dispatched).toHaveLength(1);
		expect(dispatched[0]?.stats.frameCount).toBe(2);
		expect(dispatched[0]?.stats.lastFrameTimestampUs).toBe(2000);
		expect(batcher.isFlushTimerActive).toBe(false);
		expect(scheduler.activeIntervalCount).toBe(0);
		expect(batcher.trackedTracksCount).toBe(0);

		scheduler.fire();
		expect(dispatched).toHaveLength(1);
		batcher.teardown();
		expect(dispatched).toHaveLength(1);
	});

	it('keeps recording after teardown by starting a fresh flush timer', () => {
		const {batcher, scheduler, dispatched} = createBatcher();
		batcher.recordFrame(makeBridgeFrame({timestampUs: 1000}));
		batcher.teardown();
		expect(dispatched).toHaveLength(1);

		batcher.recordFrame(makeBridgeFrame({timestampUs: 5000}));
		expect(batcher.isFlushTimerActive).toBe(true);
		scheduler.fire();
		expect(dispatched).toHaveLength(2);
		expect(dispatched[1]?.stats.frameCount).toBe(1);
	});

	it('reports the first dropped update beyond the track cap', () => {
		const {batcher, droppedReports} = createBatcher();
		for (let index = 0; index < VOICE_ENGINE_V2_FRAME_STATS_TRACKS_CAP; index += 1) {
			batcher.recordFrame(makeBridgeFrame({trackSid: `TR_${index}`}));
		}
		expect(droppedReports).toEqual([]);
		batcher.recordFrame(makeBridgeFrame({trackSid: 'TR_overflow'}));
		expect(droppedReports).toEqual([1]);
		expect(batcher.droppedUpdatesCount).toBe(1);
	});
});
