// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import type {VoiceEngineV2Event} from '../protocol/events';
import type {VoiceEngineV2InboundVideoFrame} from '../protocol/types';
import {VOICE_ENGINE_V2_COALESCED_TRACKS_CAP} from './frameCoalescing';

export const VOICE_ENGINE_V2_FRAME_STATS_TRACKS_CAP = VOICE_ENGINE_V2_COALESCED_TRACKS_CAP;
export const VOICE_ENGINE_V2_FRAME_STATS_FLUSH_INTERVAL_MS = 1000;

export type VoiceEngineV2FrameStatsEvent = Extract<VoiceEngineV2Event, {type: 'inboundVideo.frameStats'}>;

interface VoiceEngineV2FrameStatsRecord {
	participantSid: string;
	participantIdentity: string | null;
	trackSid: string;
	width: number;
	height: number;
	frameCount: number;
	lastFrameTimestampUs: number;
	lastFrameByteLength: number | null;
	dirty: boolean;
}

export class VoiceEngineV2FrameStatsAccumulator {
	private readonly recordsByTrack = new Map<string, VoiceEngineV2FrameStatsRecord>();
	private droppedUpdatesCountValue = 0;
	private dirtyTracksCountValue = 0;

	record(frame: VoiceEngineV2InboundVideoFrame): boolean {
		assert.ok(frame != null, 'record requires a non-null frame');
		assert.equal(typeof frame.trackSid, 'string', 'record requires a string trackSid');
		let entry = this.recordsByTrack.get(frame.trackSid);
		if (entry === undefined) {
			if (this.recordsByTrack.size >= VOICE_ENGINE_V2_FRAME_STATS_TRACKS_CAP) {
				this.droppedUpdatesCountValue += 1;
				assert.ok(this.droppedUpdatesCountValue >= 1, 'dropped updates count must stay positive after a drop');
				return false;
			}
			entry = {
				participantSid: frame.participantSid,
				participantIdentity: frame.participantIdentity ?? null,
				trackSid: frame.trackSid,
				width: frame.width,
				height: frame.height,
				frameCount: 0,
				lastFrameTimestampUs: frame.timestampUs,
				lastFrameByteLength: frame.byteLength ?? null,
				dirty: false,
			};
			this.recordsByTrack.set(frame.trackSid, entry);
			assert.ok(this.recordsByTrack.size <= VOICE_ENGINE_V2_FRAME_STATS_TRACKS_CAP, 'frame stats records exceeded cap');
		}
		entry.participantSid = frame.participantSid;
		entry.participantIdentity = frame.participantIdentity ?? entry.participantIdentity;
		entry.width = frame.width;
		entry.height = frame.height;
		entry.frameCount += 1;
		entry.lastFrameTimestampUs = frame.timestampUs;
		entry.lastFrameByteLength = frame.byteLength ?? null;
		if (!entry.dirty) {
			entry.dirty = true;
			this.dirtyTracksCountValue += 1;
		}
		assert.ok(this.dirtyTracksCountValue <= this.recordsByTrack.size, 'dirty count must not exceed tracked records');
		return true;
	}

	flushDirty(emit: (event: VoiceEngineV2FrameStatsEvent) => void): number {
		assert.equal(typeof emit, 'function', 'flushDirty requires a function emitter');
		assert.ok(this.dirtyTracksCountValue >= 0, 'dirty count must be non-negative before flush');
		let flushedCount = 0;
		for (const entry of this.recordsByTrack.values()) {
			if (!entry.dirty) continue;
			entry.dirty = false;
			flushedCount += 1;
			emit({
				type: 'inboundVideo.frameStats',
				stats: {
					participantSid: entry.participantSid,
					...(entry.participantIdentity !== null ? {participantIdentity: entry.participantIdentity} : {}),
					trackSid: entry.trackSid,
					width: entry.width,
					height: entry.height,
					frameCount: entry.frameCount,
					lastFrameTimestampUs: entry.lastFrameTimestampUs,
					lastFrameByteLength: entry.lastFrameByteLength,
				},
			});
		}
		assert.equal(flushedCount, this.dirtyTracksCountValue, 'flush must visit every dirty record exactly once');
		this.dirtyTracksCountValue = 0;
		return flushedCount;
	}

	removeTrack(trackSid: string): void {
		assert.equal(typeof trackSid, 'string', 'removeTrack requires a string trackSid');
		assert.ok(trackSid.length > 0, 'removeTrack requires a non-empty trackSid');
		const entry = this.recordsByTrack.get(trackSid);
		if (entry === undefined) return;
		if (entry.dirty) {
			this.dirtyTracksCountValue -= 1;
			assert.ok(this.dirtyTracksCountValue >= 0, 'dirty count must stay non-negative after removal');
		}
		this.recordsByTrack.delete(trackSid);
	}

	clear(): void {
		this.recordsByTrack.clear();
		this.dirtyTracksCountValue = 0;
		assert.equal(this.recordsByTrack.size, 0, 'clear must remove every tracked record');
		assert.equal(this.dirtyTracksCountValue, 0, 'clear must reset the dirty count');
	}

	get trackedTracksCount(): number {
		assert.ok(this.recordsByTrack.size <= VOICE_ENGINE_V2_FRAME_STATS_TRACKS_CAP, 'frame stats records exceeded cap');
		return this.recordsByTrack.size;
	}

	get dirtyTracksCount(): number {
		assert.ok(this.dirtyTracksCountValue >= 0, 'dirty count must be non-negative');
		return this.dirtyTracksCountValue;
	}

	get droppedUpdatesCount(): number {
		assert.ok(this.droppedUpdatesCountValue >= 0, 'dropped updates count must be non-negative');
		return this.droppedUpdatesCountValue;
	}
}
