// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import LocalVoiceState from '@app/features/voice/state/LocalVoiceState';

export function applyVoiceEngineV2NativeScreenShareAudioState(enabled: boolean): void {
	assert.equal(typeof enabled, 'boolean', 'native screen-share audio state must be a boolean');
	const selfStream = LocalVoiceState.getSelfStream();
	assert.equal(typeof selfStream, 'boolean', 'self stream state must be a boolean');
	LocalVoiceState.updateSelfStreamAudio(enabled && selfStream);
}
