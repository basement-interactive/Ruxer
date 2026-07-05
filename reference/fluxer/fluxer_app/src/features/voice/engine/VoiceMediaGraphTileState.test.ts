// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createVoiceMediaGraphSnapshot,
	transitionVoiceMediaGraph,
	type VoiceMediaGraphSnapshot,
} from '@app/features/voice/engine/VoiceMediaGraph';
import {selectVoiceMediaGraphStreamTileState} from '@app/features/voice/engine/VoiceMediaGraphTileState';
import {VoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';
import {describe, expect, it} from 'vitest';

const STREAM_KEY = 'dm:channel-a:connection-a';
const PARTICIPANT_IDENTITY = 'user_2_connection-a';

const target = {
	streamKey: STREAM_KEY,
	participantIdentity: PARTICIPANT_IDENTITY,
	source: VoiceTrackSource.ScreenShare,
};

function subscribe(graph: VoiceMediaGraphSnapshot, hasPublication: boolean): VoiceMediaGraphSnapshot {
	const next = transitionVoiceMediaGraph(graph, {
		type: 'subscription.subscribe',
		participantIdentity: PARTICIPANT_IDENTITY,
		source: VoiceTrackSource.ScreenShare,
		hasPublication,
		observedElement: null,
		context: 'focused',
	});
	return transitionVoiceMediaGraph(next, {type: 'subscription.clearCommands'});
}

function attach(graph: VoiceMediaGraphSnapshot): VoiceMediaGraphSnapshot {
	return transitionVoiceMediaGraph(graph, {
		type: 'subscription.actualChanged',
		participantIdentity: PARTICIPANT_IDENTITY,
		source: VoiceTrackSource.ScreenShare,
		at: 100,
		subscribed: true,
		enabled: true,
		quality: 'high',
	});
}

describe('selectVoiceMediaGraphStreamTileState', () => {
	it('returns idle when the graph has no state for the tile', () => {
		expect(selectVoiceMediaGraphStreamTileState(createVoiceMediaGraphSnapshot(), target)).toBe('idle');
	});

	it('returns watchDesired when only watch intent exists', () => {
		const graph = transitionVoiceMediaGraph(createVoiceMediaGraphSnapshot(), {
			type: 'watchIntent.add',
			key: STREAM_KEY,
		});
		expect(selectVoiceMediaGraphStreamTileState(graph, target)).toBe('watchDesired');
	});

	it('returns publicationMissing when a desired subscription has no publication', () => {
		const graph = subscribe(createVoiceMediaGraphSnapshot(), false);
		expect(selectVoiceMediaGraphStreamTileState(graph, target)).toBe('publicationMissing');
	});

	it('returns attaching when the publication exists but actual is not yet subscribed', () => {
		const graph = subscribe(createVoiceMediaGraphSnapshot(), true);
		expect(selectVoiceMediaGraphStreamTileState(graph, target)).toBe('attaching');
	});

	it('returns subscribedAwaitingFrame once actual reports a subscription', () => {
		const graph = attach(subscribe(createVoiceMediaGraphSnapshot(), true));
		expect(selectVoiceMediaGraphStreamTileState(graph, target)).toBe('subscribedAwaitingFrame');
	});

	it('returns rendering once a frame is recorded for the attempt', () => {
		let graph = attach(subscribe(createVoiceMediaGraphSnapshot(), true));
		graph = transitionVoiceMediaGraph(graph, {
			type: 'watch.renderedFrame',
			streamKey: STREAM_KEY,
			attemptKey: 'attempt-1',
			renderedAt: 200,
		});
		expect(selectVoiceMediaGraphStreamTileState(graph, target)).toBe('rendering');
	});

	it('returns rendering from entry first frame state without an attempt', () => {
		let graph = attach(subscribe(createVoiceMediaGraphSnapshot(), true));
		graph = transitionVoiceMediaGraph(graph, {
			type: 'watch.renderedFrame',
			streamKey: STREAM_KEY,
			attemptKey: 'attempt-1',
			renderedAt: 200,
		});
		expect(selectVoiceMediaGraphStreamTileState(graph, {...target, streamKey: null})).toBe('rendering');
	});

	it('returns failed when a failure is recorded, beating rendering', () => {
		let graph = attach(subscribe(createVoiceMediaGraphSnapshot(), true));
		graph = transitionVoiceMediaGraph(graph, {
			type: 'watch.renderedFrame',
			streamKey: STREAM_KEY,
			attemptKey: 'attempt-1',
			renderedAt: 200,
		});
		graph = transitionVoiceMediaGraph(graph, {
			type: 'failure.reported',
			failure: {
				code: -2202,
				reason: 'remote-track-subscription-failed',
				reportedAt: 300,
				participantIdentity: PARTICIPANT_IDENTITY,
				source: 'screen_share',
			},
		});
		expect(selectVoiceMediaGraphStreamTileState(graph, target)).toBe('failed');
	});

	it('returns failed when the last subscription command failed', () => {
		let graph = subscribe(createVoiceMediaGraphSnapshot(), true);
		graph = transitionVoiceMediaGraph(graph, {
			type: 'subscription.commandFailed',
			participantIdentity: PARTICIPANT_IDENTITY,
			source: VoiceTrackSource.ScreenShare,
			at: 100,
			code: -2101,
			reason: 'subscription-set-subscribed-failed',
		});
		expect(selectVoiceMediaGraphStreamTileState(graph, target)).toBe('failed');
	});

	it('recovers from failed to subscribedAwaitingFrame after a successful actual change', () => {
		let graph = subscribe(createVoiceMediaGraphSnapshot(), true);
		graph = transitionVoiceMediaGraph(graph, {
			type: 'subscription.commandFailed',
			participantIdentity: PARTICIPANT_IDENTITY,
			source: VoiceTrackSource.ScreenShare,
			at: 100,
			code: -2101,
			reason: 'subscription-set-subscribed-failed',
		});
		graph = attach(graph);
		expect(selectVoiceMediaGraphStreamTileState(graph, target)).toBe('subscribedAwaitingFrame');
	});

	it('returns watchDesired for entry-less streams and idle after the watch ends', () => {
		let graph = transitionVoiceMediaGraph(createVoiceMediaGraphSnapshot(), {
			type: 'watchIntent.add',
			key: STREAM_KEY,
		});
		expect(selectVoiceMediaGraphStreamTileState(graph, {...target, participantIdentity: null})).toBe('watchDesired');
		graph = transitionVoiceMediaGraph(graph, {type: 'watchIntent.remove', key: STREAM_KEY});
		expect(selectVoiceMediaGraphStreamTileState(graph, {...target, participantIdentity: null})).toBe('idle');
	});
});
