// SPDX-License-Identifier: AGPL-3.0-or-later

export interface NoiseSuppressionSettingsLike {
	noiseSuppression: boolean;
	deepFilterNoiseSuppression: boolean;
}

export function isNoiseSuppressionEnabled(settings: NoiseSuppressionSettingsLike): boolean {
	return settings.noiseSuppression || settings.deepFilterNoiseSuppression;
}

export function isBrowserNoiseSuppressionLocked(
	settings: Pick<NoiseSuppressionSettingsLike, 'deepFilterNoiseSuppression'>,
): boolean {
	return settings.deepFilterNoiseSuppression;
}

export function getEffectiveBrowserNoiseSuppressionEnabled(settings: NoiseSuppressionSettingsLike): boolean {
	return settings.noiseSuppression && !settings.deepFilterNoiseSuppression;
}
