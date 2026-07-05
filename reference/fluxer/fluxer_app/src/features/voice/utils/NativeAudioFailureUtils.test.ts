// SPDX-License-Identifier: AGPL-3.0-or-later

import {getNativeAudioErrorDetail} from '@app/features/voice/utils/NativeAudioFailureUtils';
import {describe, expect, it} from 'vitest';

describe('NativeAudioFailureUtils', () => {
	it('preserves native audio error details for diagnostics', () => {
		expect(getNativeAudioErrorDetail(new Error('Native audio addon unavailable'))).toBe(
			'Native audio addon unavailable',
		);
		expect(getNativeAudioErrorDetail('failed to start PipeWire direct audio capture')).toBe(
			'failed to start PipeWire direct audio capture',
		);
	});
	it('does not turn silence at startup into a user-facing failure classification', () => {
		expect(getNativeAudioErrorDetail('selected source was silent during startup')).toBe(
			'selected source was silent during startup',
		);
	});
});
