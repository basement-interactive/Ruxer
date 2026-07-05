// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';

export const NATIVE_CAMERA_PREVIEW_RETRY_MAX = 3;
export const NATIVE_CAMERA_PREVIEW_RETRY_DELAY_MS = 2000;

export interface NativeCameraPreviewFallbackInput {
	sessionFailed: boolean;
	backgroundEffectConfigured: boolean;
	retryAttempt: number;
}

export interface NativeCameraPreviewFallbackDecision {
	showEffectsUnavailableNotice: boolean;
	shouldScheduleRetry: boolean;
}

export function selectNativeCameraPreviewFallback(
	input: NativeCameraPreviewFallbackInput,
): NativeCameraPreviewFallbackDecision {
	assert.ok(Number.isInteger(input.retryAttempt), 'native camera preview retry attempt must be an integer');
	assert.ok(input.retryAttempt >= 0, 'native camera preview retry attempt must be non-negative');
	if (!input.sessionFailed) {
		return {showEffectsUnavailableNotice: false, shouldScheduleRetry: false};
	}
	return {
		showEffectsUnavailableNotice: input.backgroundEffectConfigured,
		shouldScheduleRetry: input.retryAttempt < NATIVE_CAMERA_PREVIEW_RETRY_MAX,
	};
}
