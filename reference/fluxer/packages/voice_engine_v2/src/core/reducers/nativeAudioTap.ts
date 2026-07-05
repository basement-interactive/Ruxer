// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import type {VoiceEngineV2Event} from '../../protocol/events';
import type {VoiceEngineV2Snapshot, VoiceEngineV2Transition} from '../state';
import {allocateOperation, queueCommand} from './_helpers';

type VoiceEngineV2NativeAudioTapEvent = Extract<VoiceEngineV2Event, {type: `nativeAudioTap.${string}`}>;

export function transitionNativeAudioTap(
	snapshot: VoiceEngineV2Snapshot,
	event: VoiceEngineV2NativeAudioTapEvent,
): VoiceEngineV2Transition {
	assert.ok(snapshot != null, 'transitionNativeAudioTap snapshot must not be null');
	assert.ok(event != null, 'transitionNativeAudioTap event must not be null');
	assert.equal(typeof event.type, 'string', 'nativeAudioTap event type must be a string');
	assert.ok(event.type.startsWith('nativeAudioTap.'), 'nativeAudioTap reducer received unrelated event');
	switch (event.type) {
		case 'nativeAudioTap.startRequested': {
			const allocated = allocateOperation(snapshot);
			return queueCommand(
				{
					...allocated.snapshot,
					nativeAudioTap: {
						...allocated.snapshot.nativeAudioTap,
						taps: {...allocated.snapshot.nativeAudioTap.taps, [event.options.tapId]: event.options},
						operationIds: {
							...allocated.snapshot.nativeAudioTap.operationIds,
							[event.options.tapId]: allocated.operationId,
						},
						failure: null,
					},
				},
				{type: 'nativeAudioTap.start', operationId: allocated.operationId, options: event.options},
			);
		}
		case 'nativeAudioTap.stopRequested': {
			const allocated = allocateOperation(snapshot);
			return queueCommand(
				{
					...allocated.snapshot,
					nativeAudioTap: {
						...allocated.snapshot.nativeAudioTap,
						operationIds: {
							...allocated.snapshot.nativeAudioTap.operationIds,
							[event.tapId]: allocated.operationId,
						},
					},
				},
				{type: 'nativeAudioTap.stop', operationId: allocated.operationId, tapId: event.tapId},
			);
		}
	}
}
