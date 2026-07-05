// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';

export const VOICE_ENGINE_V2_VOLUME_MAX_PERCENT = 200;

const UNITY_GAIN_PERCENT = 100;
const QUIET_RANGE_EXPONENT = 1.2;
const PARTICIPANT_GAIN_MAX = 2;

export interface VoiceEngineV2NativeParticipantVolumeInput {
	userVolumePercent: number;
	outputVolumePercent: number;
	locallyMuted: boolean;
	effectiveDeaf?: boolean;
	streamVolumePercent?: number;
	streamMuted?: boolean;
}

export function clampVoiceEngineV2VolumePercent(value: number): number {
	if (!Number.isFinite(value)) return UNITY_GAIN_PERCENT;
	return Math.max(0, Math.min(VOICE_ENGINE_V2_VOLUME_MAX_PERCENT, value));
}

export function boostedVoiceEngineV2VolumePercentToTrackVolume(value: number): number {
	const clamped = clampVoiceEngineV2VolumePercent(value);
	if (clamped === 0) return 0;
	if (clamped <= UNITY_GAIN_PERCENT) {
		return 10 ** (((clamped - UNITY_GAIN_PERCENT) / UNITY_GAIN_PERCENT) * QUIET_RANGE_EXPONENT);
	}
	return 2 ** ((clamped - UNITY_GAIN_PERCENT) / (VOICE_ENGINE_V2_VOLUME_MAX_PERCENT - UNITY_GAIN_PERCENT));
}

export function computeVoiceEngineV2NativeParticipantVolume(input: VoiceEngineV2NativeParticipantVolumeInput): number {
	assert.equal(typeof input.locallyMuted, 'boolean', 'locallyMuted must be a boolean');
	if (input.effectiveDeaf !== undefined) {
		assert.equal(typeof input.effectiveDeaf, 'boolean', 'effectiveDeaf must be a boolean when provided');
	}
	if (input.streamMuted !== undefined) {
		assert.equal(typeof input.streamMuted, 'boolean', 'streamMuted must be a boolean when provided');
	}
	if (input.effectiveDeaf === true) return 0;
	if (input.locallyMuted) return 0;
	if (input.streamMuted === true) return 0;
	const streamVolumePercent =
		input.streamVolumePercent === undefined
			? UNITY_GAIN_PERCENT
			: clampVoiceEngineV2VolumePercent(input.streamVolumePercent);
	const composedPercent =
		(clampVoiceEngineV2VolumePercent(input.userVolumePercent) / UNITY_GAIN_PERCENT) *
		(streamVolumePercent / UNITY_GAIN_PERCENT) *
		clampVoiceEngineV2VolumePercent(input.outputVolumePercent);
	const gain = boostedVoiceEngineV2VolumePercentToTrackVolume(clampVoiceEngineV2VolumePercent(composedPercent));
	const volume = Math.max(0, Math.min(PARTICIPANT_GAIN_MAX, gain));
	assert.ok(volume >= 0, 'participant volume must be non-negative');
	assert.ok(volume <= PARTICIPANT_GAIN_MAX, 'participant volume must not exceed gain cap');
	return volume;
}
