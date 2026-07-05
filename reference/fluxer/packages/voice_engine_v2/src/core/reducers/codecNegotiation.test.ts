// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import type {VoiceEngineV2Event} from '../../protocol/events';
import {transitionVoiceEngineV2} from '../reducer';
import {
	availableVoiceEngineV2Capabilities,
	createVoiceEngineV2InitialSnapshot,
	type VoiceEngineV2Snapshot,
} from '../state';

function applyEvents(snapshot: VoiceEngineV2Snapshot, events: Array<VoiceEngineV2Event>): VoiceEngineV2Snapshot {
	let next = snapshot;
	for (const event of events) {
		next = transitionVoiceEngineV2(next, event).snapshot;
	}
	return next;
}

function publishedCameraOn(codec: 'av1' | 'h264' | 'vp9'): VoiceEngineV2Snapshot {
	return applyEvents(createVoiceEngineV2InitialSnapshot(availableVoiceEngineV2Capabilities()), [
		{type: 'connection.connectRequested', options: {url: 'wss://voice', token: 'token'}},
		{type: 'connection.connectSucceeded', operationId: 1},
		{type: 'camera.publishRequested', options: {deviceId: 'cam-1', codec}},
		{type: 'camera.publishSucceeded', operationId: 2},
		{
			type: 'codecNegotiation.streamRegistered',
			source: 'camera',
			streamIdentity: 'cam-stream-1',
			preferredCodec: codec,
		},
	]);
}

describe('codec negotiation reducer', () => {
	it('keeps the preferred codec while no one is watching', () => {
		const snapshot = publishedCameraOn('av1');
		expect(snapshot.codecNegotiation.streams.camera?.negotiatedCodec).toBe('av1');
		expect(snapshot.camera.published?.codec).toBe('av1');
	});

	it('downgrades and republishes when a viewer who cannot decode the codec starts watching', () => {
		const snapshot = publishedCameraOn('av1');
		const transition = transitionVoiceEngineV2(snapshot, {
			type: 'codecNegotiation.viewerChanged',
			source: 'camera',
			viewerIdentity: 'bob',
			watching: true,
			supportedVideoCodecs: ['h264', 'vp8'],
		});

		expect(transition.commands).toEqual([
			{type: 'camera.publish', operationId: 3, options: {deviceId: 'cam-1', codec: 'h264'}},
		]);
		expect(transition.snapshot.codecNegotiation.streams.camera?.negotiatedCodec).toBe('h264');
		expect(transition.snapshot.codecNegotiation.streams.camera?.constrainedBy).toBe('bob');
		expect(transition.snapshot.camera.status).toBe('publishing');
	});

	it('preserves the stream identity across the codec republish', () => {
		const snapshot = publishedCameraOn('av1');
		const downgraded = transitionVoiceEngineV2(snapshot, {
			type: 'codecNegotiation.viewerChanged',
			source: 'camera',
			viewerIdentity: 'bob',
			watching: true,
			supportedVideoCodecs: ['h264'],
		});
		expect(downgraded.snapshot.codecNegotiation.streams.camera?.streamIdentity).toBe('cam-stream-1');
	});

	it('upgrades back toward the preferred codec when the constraining viewer stops watching', () => {
		const downgraded = applyEvents(publishedCameraOn('av1'), [
			{
				type: 'codecNegotiation.viewerChanged',
				source: 'camera',
				viewerIdentity: 'bob',
				watching: true,
				supportedVideoCodecs: ['h264'],
			},
			{type: 'camera.publishSucceeded', operationId: 3},
		]);
		expect(downgraded.camera.published?.codec).toBe('h264');

		const upgraded = transitionVoiceEngineV2(downgraded, {
			type: 'codecNegotiation.viewerChanged',
			source: 'camera',
			viewerIdentity: 'bob',
			watching: false,
			supportedVideoCodecs: [],
		});
		expect(upgraded.commands).toEqual([
			{type: 'camera.publish', operationId: 4, options: {deviceId: 'cam-1', codec: 'av1'}},
		]);
		expect(upgraded.snapshot.codecNegotiation.streams.camera?.negotiatedCodec).toBe('av1');
		expect(upgraded.snapshot.codecNegotiation.streams.camera?.constrainedBy).toBeNull();
	});

	it('does not republish when a newly watching viewer can already decode the codec', () => {
		const snapshot = publishedCameraOn('h264');
		const transition = transitionVoiceEngineV2(snapshot, {
			type: 'codecNegotiation.viewerChanged',
			source: 'camera',
			viewerIdentity: 'bob',
			watching: true,
			supportedVideoCodecs: ['av1', 'vp9', 'h264', 'vp8'],
		});
		expect(transition.commands).toEqual([]);
		expect(transition.snapshot.codecNegotiation.streams.camera?.negotiatedCodec).toBe('h264');
	});

	it('clamps the manual override down to a current viewer that cannot decode it', () => {
		const watching = transitionVoiceEngineV2(publishedCameraOn('h264'), {
			type: 'codecNegotiation.viewerChanged',
			source: 'camera',
			viewerIdentity: 'bob',
			watching: true,
			supportedVideoCodecs: ['vp8'],
		}).snapshot;
		const settled = applyEvents(watching, [{type: 'camera.publishSucceeded', operationId: 3}]);
		expect(settled.camera.published?.codec).toBe('vp8');

		const overridden = transitionVoiceEngineV2(settled, {
			type: 'codecNegotiation.overrideSetRequested',
			source: 'camera',
			codec: 'av1',
		});
		expect(overridden.commands).toEqual([]);
		expect(overridden.snapshot.codecNegotiation.overrides.camera).toBe('av1');
		expect(overridden.snapshot.codecNegotiation.streams.camera?.negotiatedCodec).toBe('vp8');
		expect(overridden.snapshot.codecNegotiation.streams.camera?.constrainedBy).toBe('bob');
	});

	it('applies the manual override as a republish when no viewer constrains it', () => {
		const transition = transitionVoiceEngineV2(publishedCameraOn('h264'), {
			type: 'codecNegotiation.overrideSetRequested',
			source: 'camera',
			codec: 'vp9',
		});
		expect(transition.commands).toEqual([
			{type: 'camera.publish', operationId: 3, options: {deviceId: 'cam-1', codec: 'vp9'}},
		]);
		expect(transition.snapshot.codecNegotiation.streams.camera?.negotiatedCodec).toBe('vp9');
	});

	it('clears a per-source override back to the published preferred codec', () => {
		const overridden = transitionVoiceEngineV2(publishedCameraOn('h264'), {
			type: 'codecNegotiation.overrideSetRequested',
			source: 'camera',
			codec: 'vp9',
		});
		const settled = applyEvents(overridden.snapshot, [{type: 'camera.publishSucceeded', operationId: 3}]);
		expect(settled.camera.published?.codec).toBe('vp9');

		const cleared = transitionVoiceEngineV2(settled, {
			type: 'codecNegotiation.overrideSetRequested',
			source: 'camera',
			codec: null,
		});
		expect(cleared.snapshot.codecNegotiation.overrides.camera).toBeUndefined();
		expect(cleared.commands).toEqual([
			{type: 'camera.publish', operationId: 4, options: {deviceId: 'cam-1', codec: 'h264'}},
		]);
		expect(cleared.snapshot.codecNegotiation.streams.camera?.negotiatedCodec).toBe('h264');
	});
});
