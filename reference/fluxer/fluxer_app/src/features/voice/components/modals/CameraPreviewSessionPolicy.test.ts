// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	NATIVE_CAMERA_PREVIEW_RETRY_MAX,
	selectNativeCameraPreviewFallback,
} from '@app/features/voice/components/modals/CameraPreviewSessionPolicy';
import {describe, expect, it} from 'vitest';

describe('selectNativeCameraPreviewFallback', () => {
	it('does nothing while the native session is healthy', () => {
		expect(
			selectNativeCameraPreviewFallback({
				sessionFailed: false,
				backgroundEffectConfigured: true,
				retryAttempt: 0,
			}),
		).toEqual({showEffectsUnavailableNotice: false, shouldScheduleRetry: false});
	});

	it('shows the effects notice when a background effect is configured and the session failed', () => {
		expect(
			selectNativeCameraPreviewFallback({
				sessionFailed: true,
				backgroundEffectConfigured: true,
				retryAttempt: 0,
			}),
		).toEqual({showEffectsUnavailableNotice: true, shouldScheduleRetry: true});
	});

	it('hides the notice when no background effect is configured but still retries', () => {
		expect(
			selectNativeCameraPreviewFallback({
				sessionFailed: true,
				backgroundEffectConfigured: false,
				retryAttempt: 0,
			}),
		).toEqual({showEffectsUnavailableNotice: false, shouldScheduleRetry: true});
	});

	it('retries up to the named cap and then stops', () => {
		for (let attempt = 0; attempt < NATIVE_CAMERA_PREVIEW_RETRY_MAX; attempt++) {
			expect(
				selectNativeCameraPreviewFallback({
					sessionFailed: true,
					backgroundEffectConfigured: true,
					retryAttempt: attempt,
				}).shouldScheduleRetry,
			).toBe(true);
		}
		expect(
			selectNativeCameraPreviewFallback({
				sessionFailed: true,
				backgroundEffectConfigured: true,
				retryAttempt: NATIVE_CAMERA_PREVIEW_RETRY_MAX,
			}),
		).toEqual({showEffectsUnavailableNotice: true, shouldScheduleRetry: false});
	});

	it('rejects negative retry attempts', () => {
		expect(() =>
			selectNativeCameraPreviewFallback({
				sessionFailed: true,
				backgroundEffectConfigured: true,
				retryAttempt: -1,
			}),
		).toThrow('native camera preview retry attempt must be non-negative');
	});
});
