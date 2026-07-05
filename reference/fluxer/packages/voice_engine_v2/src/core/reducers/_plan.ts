// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import type {VoiceEngineV2Command} from '../../protocol/commands';
import type {VoiceEngineV2Snapshot, VoiceEngineV2Transition} from '../state';
import {allocateOperation, appendTransition} from './_helpers';
import {beginCameraPublish} from './camera';
import {beginMicrophonePublish} from './microphone';
import {beginScreenPublish} from './screen';
import {beginScreenAudioPublish} from './screenAudio';

function planDesiredLocalMedia(snapshot: VoiceEngineV2Snapshot): VoiceEngineV2Transition {
	assert.ok(snapshot != null, 'planDesiredLocalMedia snapshot must not be null');
	assert.ok(snapshot.capabilities != null, 'planDesiredLocalMedia snapshot.capabilities must not be null');
	let transition: VoiceEngineV2Transition = {snapshot, commands: []};
	transition = appendTransition(transition, beginMicrophonePublish(transition.snapshot));
	transition = appendTransition(transition, beginCameraPublish(transition.snapshot));
	transition = appendTransition(transition, beginScreenPublish(transition.snapshot));
	transition = appendTransition(transition, beginScreenAudioPublish(transition.snapshot));
	return transition;
}

function planDesiredSessionConfiguration(snapshot: VoiceEngineV2Snapshot): VoiceEngineV2Transition {
	assert.ok(snapshot != null, 'planDesiredSessionConfiguration snapshot must not be null');
	assert.ok(snapshot.capabilities != null, 'planDesiredSessionConfiguration snapshot.capabilities must not be null');
	let next = snapshot;
	const commands: Array<VoiceEngineV2Command> = [];
	if (next.outputDevice.desiredDeviceId && next.capabilities.outputDevice) {
		const desiredDeviceId = next.outputDevice.desiredDeviceId;
		const allocated = allocateOperation(next);
		next = {
			...allocated.snapshot,
			outputDevice: {...allocated.snapshot.outputDevice, operationId: allocated.operationId, failure: null},
		};
		commands.push({
			type: 'outputDevice.set',
			operationId: allocated.operationId,
			options: {deviceId: desiredDeviceId},
		});
	}
	if (next.capabilities.participantVolume) {
		for (const participantIdentity of Object.keys(next.participantVolumes).sort()) {
			const allocated = allocateOperation(next);
			next = allocated.snapshot;
			commands.push({
				type: 'participantVolume.set',
				operationId: allocated.operationId,
				options: {
					participantIdentity,
					volume: next.participantVolumes[participantIdentity] ?? 1,
				},
			});
		}
	}
	if (next.capabilities.remoteTrackSubscription) {
		for (const key of Object.keys(next.remoteTrackSubscriptions).sort()) {
			const options = next.remoteTrackSubscriptions[key];
			if (!options) continue;
			const allocated = allocateOperation(next);
			next = allocated.snapshot;
			commands.push({
				type: 'remoteTrackSubscription.set',
				operationId: allocated.operationId,
				options,
			});
		}
	}
	return {snapshot: next, commands};
}

export function planDesiredState(snapshot: VoiceEngineV2Snapshot): VoiceEngineV2Transition {
	assert.ok(snapshot != null, 'planDesiredState snapshot must not be null');
	assert.ok(snapshot.capabilities != null, 'planDesiredState snapshot.capabilities must not be null');
	const localMedia = planDesiredLocalMedia(snapshot);
	return appendTransition(localMedia, planDesiredSessionConfiguration(localMedia.snapshot));
}
