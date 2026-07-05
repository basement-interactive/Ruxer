// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import type {VoiceEngineV2VideoCodec} from '../protocol/types';

export const VOICE_ENGINE_V2_VIDEO_CODEC_PREFERENCE: ReadonlyArray<VoiceEngineV2VideoCodec> = [
	'av1',
	'h265',
	'vp9',
	'h264',
	'vp8',
];

export const VOICE_ENGINE_V2_VIDEO_CODEC_FLOOR: VoiceEngineV2VideoCodec = 'vp8';

const VIDEO_CODEC_RANK: ReadonlyMap<VoiceEngineV2VideoCodec, number> = new Map(
	VOICE_ENGINE_V2_VIDEO_CODEC_PREFERENCE.map((codec, index) => [codec, index]),
);

function isKnownVoiceEngineV2VideoCodec(codec: VoiceEngineV2VideoCodec | null | undefined): boolean {
	if (codec == null) return false;
	if (codec === '') return false;
	return VIDEO_CODEC_RANK.has(codec);
}

export function voiceEngineV2VideoCodecRank(codec: VoiceEngineV2VideoCodec | null | undefined): number {
	if (!isKnownVoiceEngineV2VideoCodec(codec)) return VOICE_ENGINE_V2_VIDEO_CODEC_PREFERENCE.length;
	const rank = VIDEO_CODEC_RANK.get(codec as VoiceEngineV2VideoCodec);
	assert.ok(rank !== undefined, 'voiceEngineV2VideoCodecRank known codec must have a rank');
	return rank;
}

export function isMoreEfficientVoiceEngineV2VideoCodec(
	candidate: VoiceEngineV2VideoCodec,
	reference: VoiceEngineV2VideoCodec,
): boolean {
	return voiceEngineV2VideoCodecRank(candidate) < voiceEngineV2VideoCodecRank(reference);
}

export function worseVoiceEngineV2VideoCodec(
	a: VoiceEngineV2VideoCodec,
	b: VoiceEngineV2VideoCodec,
): VoiceEngineV2VideoCodec {
	return voiceEngineV2VideoCodecRank(b) > voiceEngineV2VideoCodecRank(a) ? b : a;
}

export function maxDecodableVoiceEngineV2VideoCodec(
	supported: ReadonlyArray<VoiceEngineV2VideoCodec>,
): VoiceEngineV2VideoCodec | null {
	assert.ok(Array.isArray(supported), 'maxDecodableVoiceEngineV2VideoCodec supported must be an array');
	let best: VoiceEngineV2VideoCodec | null = null;
	for (const codec of supported) {
		if (!isKnownVoiceEngineV2VideoCodec(codec)) continue;
		if (best === null || isMoreEfficientVoiceEngineV2VideoCodec(codec, best)) {
			best = codec;
		}
	}
	return best;
}

export interface VoiceEngineV2CodecViewer {
	identity: string;
	maxVideoCodec: VoiceEngineV2VideoCodec | null;
}

export type VoiceEngineV2NegotiatedCodecReason = 'preferred' | 'clampedToViewer';

export interface VoiceEngineV2NegotiatedCodecPlan {
	codec: VoiceEngineV2VideoCodec;
	reason: VoiceEngineV2NegotiatedCodecReason;
	constrainedBy: string | null;
}

interface VoiceEngineV2NegotiatedCodecInput {
	preferred: VoiceEngineV2VideoCodec;
	viewers: ReadonlyArray<VoiceEngineV2CodecViewer>;
}

export function planVoiceEngineV2NegotiatedVideoCodec(
	input: VoiceEngineV2NegotiatedCodecInput,
): VoiceEngineV2NegotiatedCodecPlan {
	assert.ok(input != null, 'planVoiceEngineV2NegotiatedVideoCodec input must not be null');
	assert.ok(Array.isArray(input.viewers), 'planVoiceEngineV2NegotiatedVideoCodec viewers must be an array');
	const preferred = isKnownVoiceEngineV2VideoCodec(input.preferred)
		? input.preferred
		: VOICE_ENGINE_V2_VIDEO_CODEC_FLOOR;
	let codec = preferred;
	let reason: VoiceEngineV2NegotiatedCodecReason = 'preferred';
	let constrainedBy: string | null = null;
	for (const viewer of input.viewers) {
		if (viewer.maxVideoCodec === null) continue;
		if (!isKnownVoiceEngineV2VideoCodec(viewer.maxVideoCodec)) continue;
		if (!isMoreEfficientVoiceEngineV2VideoCodec(codec, viewer.maxVideoCodec)) {
			continue;
		}
		codec = viewer.maxVideoCodec;
		reason = 'clampedToViewer';
		constrainedBy = viewer.identity;
	}
	return {codec, reason, constrainedBy};
}
