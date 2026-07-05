// SPDX-License-Identifier: AGPL-3.0-or-later

export const VOICE_VOLUME_MAX_PERCENT = 200;
const UNITY_GAIN_PERCENT = 100;
const QUIET_RANGE_EXPONENT = 1.2;

export function clampVoiceVolumePercent(value: number): number {
	if (!Number.isFinite(value)) {
		return 100;
	}
	return Math.max(0, Math.min(VOICE_VOLUME_MAX_PERCENT, value));
}

export function voiceVolumePercentToTrackVolume(value: number): number {
	return Math.max(0, Math.min(1, clampVoiceVolumePercent(value) / 100));
}

export function inputVoiceVolumePercentToGain(value: number): number {
	return clampVoiceVolumePercent(value) / UNITY_GAIN_PERCENT;
}

export function boostedVoiceVolumePercentToTrackVolume(value: number): number {
	const clamped = clampVoiceVolumePercent(value);
	if (clamped === 0) {
		return 0;
	}
	if (clamped <= UNITY_GAIN_PERCENT) {
		return 10 ** (((clamped - UNITY_GAIN_PERCENT) / UNITY_GAIN_PERCENT) * QUIET_RANGE_EXPONENT);
	}
	return 2 ** ((clamped - UNITY_GAIN_PERCENT) / (VOICE_VOLUME_MAX_PERCENT - UNITY_GAIN_PERCENT));
}
