// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import type {VoiceEngineV2Event} from '../../protocol/events';
import type {VoiceEngineV2Snapshot, VoiceEngineV2Transition} from '../state';
import {beginMicrophonePublish} from './microphone';

type VoiceEngineV2NativeAudioDeviceModuleEvent = Extract<
	VoiceEngineV2Event,
	{type: 'nativeAudioDeviceModule.statusChanged'}
>;

export function transitionNativeAudioDeviceModule(
	snapshot: VoiceEngineV2Snapshot,
	event: VoiceEngineV2NativeAudioDeviceModuleEvent,
): VoiceEngineV2Transition {
	assert.ok(snapshot != null, 'transitionNativeAudioDeviceModule snapshot must not be null');
	assert.ok(event != null, 'transitionNativeAudioDeviceModule event must not be null');
	assert.equal(event.type, 'nativeAudioDeviceModule.statusChanged', 'unexpected ADM event type');
	assert.equal(typeof event.status, 'string', 'ADM status must be a string');
	const next: VoiceEngineV2Snapshot = {
		...snapshot,
		nativeAudioDeviceModule: {
			status: event.status,
			detail: event.detail ?? null,
		},
	};
	return beginMicrophonePublish(next);
}
