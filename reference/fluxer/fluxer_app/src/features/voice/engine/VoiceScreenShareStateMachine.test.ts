// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {
	createVoiceScreenShareSnapshot,
	getVoiceScreenShareStateValue,
	transitionVoiceScreenShareSnapshot,
	type VoiceScreenShareSnapshot,
} from './VoiceScreenShareStateMachine';

const STREAM_KEY = 'guild-a:channel-a:connection-a';

function resolveActive(
	snapshot: VoiceScreenShareSnapshot,
	sourceType: 'display' | 'native-display' | 'device' = 'display',
) {
	return transitionVoiceScreenShareSnapshot(snapshot, {
		type: 'share.resolve',
		active: true,
		sourceType,
		encoderVerificationScheduled: true,
		streamingPriorityHeld: true,
	});
}

describe('VoiceScreenShareStateMachine', () => {
	it('tracks repeated start and stop without leaving duplicate pending state', () => {
		let snapshot = createVoiceScreenShareSnapshot();
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.start', sourceType: 'display'});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.start', sourceType: 'display'});
		expect(getVoiceScreenShareStateValue(snapshot)).toBe('pending');
		expect(snapshot.context.pendingOperation).toBe('starting');
		snapshot = resolveActive(snapshot);
		expect(getVoiceScreenShareStateValue(snapshot)).toBe('active');
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.stop',
			request: {sendUpdate: true, playSound: true},
		});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.stop',
			request: {sendUpdate: false, playSound: false},
		});
		expect(snapshot.context.pendingOperation).toBe('stopping');
		expect(snapshot.context.queuedStopRequest).toEqual({sendUpdate: false, playSound: false});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.resolve',
			active: false,
			sourceType: null,
			encoderVerificationScheduled: false,
			streamingPriorityHeld: false,
		});
		expect(getVoiceScreenShareStateValue(snapshot)).toBe('inactive');
		expect(snapshot.context.sourceType).toBeNull();
		expect(snapshot.context.streamingPriorityHeld).toBe(false);
		expect(snapshot.context.encoderVerificationScheduled).toBe(false);
	});

	it('returns to inactive after start cancellation or denial', () => {
		let snapshot = createVoiceScreenShareSnapshot();
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.start', sourceType: 'display'});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.cancel', active: false, sourceType: null});
		expect(getVoiceScreenShareStateValue(snapshot)).toBe('inactive');
		expect(snapshot.context.pendingOperation).toBeNull();
		expect(snapshot.context.codecRepublishInFlight).toBe(false);
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.start', sourceType: 'device'});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.reject', active: false, sourceType: null});
		expect(getVoiceScreenShareStateValue(snapshot)).toBe('inactive');
	});

	it('queues stop while start is pending and preserves the requested stop options', () => {
		let snapshot = createVoiceScreenShareSnapshot();
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.start', sourceType: 'native-display'});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.stop',
			request: {sendUpdate: false, playSound: true},
		});
		expect(getVoiceScreenShareStateValue(snapshot)).toBe('pending');
		expect(snapshot.context.pendingOperation).toBe('starting');
		expect(snapshot.context.queuedStopRequest).toEqual({sendUpdate: false, playSound: true});
		snapshot = resolveActive(snapshot, 'native-display');
		expect(getVoiceScreenShareStateValue(snapshot)).toBe('active');
		expect(snapshot.context.queuedStopRequest).toEqual({sendUpdate: false, playSound: true});
	});

	it('tracks source replacement success and failure without losing the active source on failure', () => {
		let snapshot = resolveActive(
			transitionVoiceScreenShareSnapshot(createVoiceScreenShareSnapshot(), {
				type: 'share.start',
				sourceType: 'display',
			}),
		);
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.replace', sourceType: 'device'});
		expect(snapshot.context.pendingOperation).toBe('replacing');
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.reject',
			active: true,
			sourceType: 'display',
		});
		expect(getVoiceScreenShareStateValue(snapshot)).toBe('active');
		expect(snapshot.context.sourceType).toBe('display');
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.replace', sourceType: 'device'});
		snapshot = resolveActive(snapshot, 'device');
		expect(snapshot.context.sourceType).toBe('device');
	});

	it('holds the codec republish lock only while codec publication work is pending', () => {
		let snapshot = resolveActive(
			transitionVoiceScreenShareSnapshot(createVoiceScreenShareSnapshot(), {
				type: 'share.start',
				sourceType: 'display',
			}),
		);
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.codecRepublish'});
		expect(snapshot.context.pendingOperation).toBe('codecRepublishing');
		expect(snapshot.context.codecRepublishInFlight).toBe(true);
		snapshot = resolveActive(snapshot, 'display');
		expect(snapshot.context.codecRepublishInFlight).toBe(false);
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.replace',
			sourceType: 'display',
			codecRepublishInFlight: true,
		});
		expect(snapshot.context.codecRepublishInFlight).toBe(true);
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.cancel',
			active: true,
			sourceType: 'display',
		});
		expect(snapshot.context.codecRepublishInFlight).toBe(false);
	});

	it('tracks codec readiness through the xstate context while starting', () => {
		let snapshot = createVoiceScreenShareSnapshot();
		expect(snapshot.context.codecReadiness).toBe('idle');
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.start', sourceType: 'display'});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.codecReadiness.loading'});
		expect(snapshot.context.codecReadiness).toBe('loading');
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.codecReadiness.ready'});
		expect(snapshot.context.codecReadiness).toBe('ready');
		snapshot = resolveActive(snapshot);
		expect(getVoiceScreenShareStateValue(snapshot)).toBe('active');
		expect(snapshot.context.codecReadiness).toBe('ready');
	});

	it('records codec readiness timeout and resets it for the next operation', () => {
		let snapshot = createVoiceScreenShareSnapshot();
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.start', sourceType: 'display'});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.codecReadiness.loading'});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.codecReadiness.timeout'});
		expect(snapshot.context.codecReadiness).toBe('timeout');
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.cancel', active: false, sourceType: null});
		expect(snapshot.context.codecReadiness).toBe('idle');
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.start', sourceType: 'native-display'});
		expect(snapshot.context.codecReadiness).toBe('idle');
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.codecReadiness.loading'});
		expect(snapshot.context.codecReadiness).toBe('loading');
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.codecReadiness.reset'});
		expect(snapshot.context.codecReadiness).toBe('idle');
	});

	it('retains the latest queued codec republish request while screen share work is pending', () => {
		let snapshot = transitionVoiceScreenShareSnapshot(createVoiceScreenShareSnapshot(), {
			type: 'share.start',
			sourceType: 'display',
		});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.codecRepublish.queue',
			request: {codec: 'vp9', reason: 'manual', force: true},
		});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.codecRepublish.queue',
			request: {codec: 'vp9', reason: 'data', force: false},
		});
		expect(snapshot.context.pendingOperation).toBe('starting');
		expect(snapshot.context.queuedCodecRepublishRequest).toEqual({
			codec: 'vp9',
			reason: 'data',
			force: true,
		});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.codecRepublish.queue',
			request: {codec: 'h264', reason: 'manual', force: false},
		});
		expect(snapshot.context.queuedCodecRepublishRequest).toEqual({
			codec: 'h264',
			reason: 'manual',
			force: false,
		});
		snapshot = resolveActive(snapshot, 'display');
		expect(snapshot.context.queuedCodecRepublishRequest).toEqual({
			codec: 'h264',
			reason: 'manual',
			force: false,
		});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.queuedCodecRepublish.clear'});
		expect(snapshot.context.queuedCodecRepublishRequest).toBeNull();
	});

	it('records deferred codec republish requests without entering a pending state', () => {
		let snapshot = resolveActive(
			transitionVoiceScreenShareSnapshot(createVoiceScreenShareSnapshot(), {
				type: 'share.start',
				sourceType: 'display',
			}),
		);
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.codecRepublish.defer',
			request: {codec: 'h264', reason: 'participant-connected', force: false},
		});
		expect(getVoiceScreenShareStateValue(snapshot)).toBe('active');
		expect(snapshot.context.pendingOperation).toBeNull();
		expect(snapshot.context.codecRepublishInFlight).toBe(false);
		expect(snapshot.context.deferredCodecRepublishRequest).toEqual({
			codec: 'h264',
			reason: 'participant-connected',
			force: false,
		});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.codecRepublish.defer',
			request: {codec: 'h264', reason: 'data', force: true},
		});
		expect(snapshot.context.deferredCodecRepublishRequest).toEqual({
			codec: 'h264',
			reason: 'data',
			force: true,
		});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.deferredCodecRepublish.clear'});
		expect(snapshot.context.deferredCodecRepublishRequest).toBeNull();
	});

	it('tracks active track ended cleanup independently from stop resolution', () => {
		let snapshot = resolveActive(
			transitionVoiceScreenShareSnapshot(createVoiceScreenShareSnapshot(), {
				type: 'share.start',
				sourceType: 'display',
			}),
		);
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.endedStop.start'});
		expect(snapshot.context.endedTrackStopInFlight).toBe(true);
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.stop',
			request: {sendUpdate: true, playSound: true},
		});
		expect(snapshot.context.pendingOperation).toBe('stopping');
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.resolve',
			active: false,
			sourceType: null,
			encoderVerificationScheduled: false,
			streamingPriorityHeld: false,
		});
		expect(snapshot.context.endedTrackStopInFlight).toBe(true);
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.endedStop.finish'});
		expect(snapshot.context.endedTrackStopInFlight).toBe(false);
		expect(getVoiceScreenShareStateValue(snapshot)).toBe('inactive');
	});

	it('emits local watcher add and remove decisions only when a change is needed', () => {
		let snapshot = createVoiceScreenShareSnapshot();
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.localWatcher.sync',
			enabled: true,
			streamKey: STREAM_KEY,
			currentViewerStreamKeys: [],
		});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.localWatcher.sync',
			enabled: true,
			streamKey: STREAM_KEY,
			currentViewerStreamKeys: [STREAM_KEY],
		});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.localWatcher.sync',
			enabled: false,
			streamKey: STREAM_KEY,
			currentViewerStreamKeys: [STREAM_KEY],
		});
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
			type: 'share.localWatcher.sync',
			enabled: false,
			streamKey: STREAM_KEY,
			currentViewerStreamKeys: [],
		});
		expect(snapshot.context.watchCommands).toEqual([
			{type: 'watch.add', key: STREAM_KEY},
			{type: 'watch.remove', key: STREAM_KEY},
		]);
		snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.clearWatchCommands'});
		expect(snapshot.context.watchCommands).toEqual([]);
	});

	it('does not accumulate duplicate watcher commands after repeated restarts when current state is synced', () => {
		let snapshot = createVoiceScreenShareSnapshot();
		let currentViewerStreamKeys: Array<string> = [];
		for (let i = 0; i < 10; i++) {
			snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
				type: 'share.localWatcher.sync',
				enabled: true,
				streamKey: STREAM_KEY,
				currentViewerStreamKeys,
			});
			for (const command of snapshot.context.watchCommands) {
				if (command.type === 'watch.add' && !currentViewerStreamKeys.includes(command.key)) {
					currentViewerStreamKeys = [...currentViewerStreamKeys, command.key];
				}
			}
			snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.clearWatchCommands'});
			snapshot = transitionVoiceScreenShareSnapshot(snapshot, {
				type: 'share.localWatcher.sync',
				enabled: false,
				streamKey: STREAM_KEY,
				currentViewerStreamKeys,
			});
			for (const command of snapshot.context.watchCommands) {
				if (command.type === 'watch.remove') {
					currentViewerStreamKeys = currentViewerStreamKeys.filter((key) => key !== command.key);
				}
			}
			snapshot = transitionVoiceScreenShareSnapshot(snapshot, {type: 'share.clearWatchCommands'});
		}
		expect(currentViewerStreamKeys).toEqual([]);
		expect(snapshot.context.watchCommands).toEqual([]);
	});
});
