// SPDX-License-Identifier: AGPL-3.0-or-later

import {bench, describe} from 'vitest';
import type {VoiceEngineV2InboundVideoFrame} from '../protocol/types';
import {VoiceEngineV2FrameStatsAccumulator} from './frameStatsBatching';

const frame: VoiceEngineV2InboundVideoFrame = Object.freeze({
	participantSid: 'sid-remote',
	participantIdentity: 'identity-remote',
	trackSid: 'track-video-1',
	width: 1280,
	height: 720,
	timestampUs: 1_000_000,
	byteLength: 320_000,
});

const recordAccumulator = new VoiceEngineV2FrameStatsAccumulator();
const flushAccumulator = new VoiceEngineV2FrameStatsAccumulator();

describe('voice engine v2 frame stats accumulator hot paths', () => {
	bench('record per-frame update', () => {
		recordAccumulator.record(frame);
	});

	bench('record then flush one dirty track', () => {
		flushAccumulator.record(frame);
		flushAccumulator.flushDirty(() => {});
	});
});
