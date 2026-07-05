// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	clearRemoteVoicePlaybackBoost,
	getRemoteVoicePlaybackBoost,
	setRemoteVoicePlaybackBoost,
} from '@app/features/voice/state/RemoteVoicePlaybackBoost';
import {afterEach, describe, expect, test} from 'vitest';

describe('RemoteVoicePlaybackBoost', () => {
	afterEach(() => {
		clearRemoteVoicePlaybackBoost('user-1');
	});

	test('defaults to unity gain', () => {
		expect(getRemoteVoicePlaybackBoost('user-1')).toBe(1);
	});

	test('stores boosts above unity and clears non-positive values', () => {
		setRemoteVoicePlaybackBoost('user-1', 1.75);
		expect(getRemoteVoicePlaybackBoost('user-1')).toBe(1.75);

		setRemoteVoicePlaybackBoost('user-1', 1);
		expect(getRemoteVoicePlaybackBoost('user-1')).toBe(1);
	});
});
