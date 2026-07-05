// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {
	VOICE_ENGINE_V2_FRAME_STATS_FLUSH_INTERVAL_MS,
	VoiceEngineV2FrameStatsAccumulator,
	type VoiceEngineV2FrameStatsEvent,
	type VoiceEngineV2InboundVideoFrame,
} from '@fluxer/voice_engine_v2';
import type {VoiceEngineV2BridgeVideoFrame} from '@fluxer/voice_engine_v2/bridge';

export const NATIVE_VOICE_FRAME_STATS_DROP_REPORT_INTERVAL = 300;

type NativeVoiceFrameStatsIntervalHandle = unknown;

export interface NativeVoiceFrameStatsScheduler {
	setInterval(callback: () => void, ms: number): NativeVoiceFrameStatsIntervalHandle;
	clearInterval(handle: NativeVoiceFrameStatsIntervalHandle): void;
}

export interface NativeVoiceFrameStatsBatcherOptions {
	dispatch: (event: VoiceEngineV2FrameStatsEvent) => void;
	scheduler?: NativeVoiceFrameStatsScheduler;
	onDroppedUpdates?: (droppedUpdatesCount: number) => void;
}

function defaultScheduler(): NativeVoiceFrameStatsScheduler {
	return {
		setInterval(callback, ms): NativeVoiceFrameStatsIntervalHandle {
			return globalThis.setInterval(callback, ms);
		},
		clearInterval(handle): void {
			globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>);
		},
	};
}

export class NativeVoiceFrameStatsBatcher {
	private readonly dispatch: (event: VoiceEngineV2FrameStatsEvent) => void;
	private readonly scheduler: NativeVoiceFrameStatsScheduler;
	private readonly onDroppedUpdates: ((droppedUpdatesCount: number) => void) | null;
	private readonly accumulator = new VoiceEngineV2FrameStatsAccumulator();
	private readonly scratchFrame: VoiceEngineV2InboundVideoFrame = {
		participantSid: '',
		trackSid: '',
		width: 0,
		height: 0,
		timestampUs: 0,
		byteLength: 0,
	};
	private intervalHandle: NativeVoiceFrameStatsIntervalHandle | null = null;

	constructor(options: NativeVoiceFrameStatsBatcherOptions) {
		assert.ok(options != null, 'frame stats batcher requires options');
		assert.equal(typeof options.dispatch, 'function', 'frame stats batcher requires a dispatch function');
		this.dispatch = options.dispatch;
		this.scheduler = options.scheduler ?? defaultScheduler();
		assert.equal(typeof this.scheduler.setInterval, 'function', 'frame stats scheduler must expose setInterval');
		assert.equal(typeof this.scheduler.clearInterval, 'function', 'frame stats scheduler must expose clearInterval');
		this.onDroppedUpdates = options.onDroppedUpdates ?? null;
	}

	get isFlushTimerActive(): boolean {
		return this.intervalHandle !== null;
	}

	get droppedUpdatesCount(): number {
		return this.accumulator.droppedUpdatesCount;
	}

	get trackedTracksCount(): number {
		return this.accumulator.trackedTracksCount;
	}

	recordFrame(frame: VoiceEngineV2BridgeVideoFrame): void {
		assert.ok(frame != null, 'recordFrame requires a frame');
		assert.ok(frame.meta != null, 'recordFrame requires frame metadata');
		const scratch = this.scratchFrame;
		scratch.participantSid = frame.meta.participantSid;
		scratch.trackSid = frame.meta.trackSid;
		scratch.width = frame.meta.width;
		scratch.height = frame.meta.height;
		scratch.timestampUs = frame.meta.timestampUs;
		scratch.byteLength = frame.data.byteLength;
		const recorded = this.accumulator.record(scratch);
		if (!recorded) {
			this.noteDroppedUpdate();
		}
		this.ensureFlushTimer();
	}

	flush(): number {
		if (this.accumulator.dirtyTracksCount === 0) return 0;
		const flushedCount = this.accumulator.flushDirty(this.dispatch);
		assert.ok(flushedCount >= 1, 'flush of a dirty accumulator must emit at least one event');
		assert.equal(this.accumulator.dirtyTracksCount, 0, 'flush must leave no dirty tracks behind');
		return flushedCount;
	}

	removeTrack(trackSid: string): void {
		assert.equal(typeof trackSid, 'string', 'removeTrack requires a string trackSid');
		if (trackSid.length === 0) return;
		this.flush();
		this.accumulator.removeTrack(trackSid);
	}

	teardown(): void {
		try {
			this.flush();
		} finally {
			if (this.intervalHandle !== null) {
				this.scheduler.clearInterval(this.intervalHandle);
				this.intervalHandle = null;
			}
			this.accumulator.clear();
		}
		assert.equal(this.intervalHandle, null, 'teardown must cancel the flush timer');
		assert.equal(this.accumulator.dirtyTracksCount, 0, 'teardown must leave no dirty tracks behind');
	}

	private ensureFlushTimer(): void {
		if (this.intervalHandle !== null) return;
		this.intervalHandle = this.scheduler.setInterval(() => {
			this.flush();
		}, VOICE_ENGINE_V2_FRAME_STATS_FLUSH_INTERVAL_MS);
		assert.ok(this.intervalHandle != null, 'frame stats scheduler must return an interval handle');
	}

	private noteDroppedUpdate(): void {
		const droppedUpdatesCount = this.accumulator.droppedUpdatesCount;
		assert.ok(droppedUpdatesCount >= 1, 'dropped update accounting requires at least one drop');
		if (droppedUpdatesCount === 1 || droppedUpdatesCount % NATIVE_VOICE_FRAME_STATS_DROP_REPORT_INTERVAL === 0) {
			this.onDroppedUpdates?.(droppedUpdatesCount);
		}
	}
}
