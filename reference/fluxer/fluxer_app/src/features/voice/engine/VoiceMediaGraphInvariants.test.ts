// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	buildVoiceMediaGraphSubscriptionEntry,
	createVoiceMediaGraphSnapshot,
	createVoiceMediaGraphSubscriptionActualState,
	createVoiceMediaGraphSubscriptionPublicationState,
	transitionVoiceMediaGraph,
	type VoiceMediaGraphDeadline,
	type VoiceMediaGraphSnapshot,
} from '@app/features/voice/engine/VoiceMediaGraph';
import {checkVoiceMediaGraphInvariants} from '@app/features/voice/engine/VoiceMediaGraphInvariants';
import {VoiceTrackSource} from '@app/features/voice/engine/VoiceTrackSource';
import {describe, expect, it} from 'vitest';

const STREAM_KEY = 'dm:channel-a:connection-a';

function entryWithActualSubscribed(subscribed: boolean) {
	return buildVoiceMediaGraphSubscriptionEntry(
		{participantIdentity: 'user_2_connection-a', source: VoiceTrackSource.ScreenShare},
		{
			desired: {enabled: true, quality: 'high', context: 'focused', isIntersecting: false, observedElement: null},
			actual: {...createVoiceMediaGraphSubscriptionActualState(), subscribed: true},
			publication: createVoiceMediaGraphSubscriptionPublicationState(true),
			firstFrame: {renderedAt: null},
			subscribed,
		},
	);
}

describe('checkVoiceMediaGraphInvariants', () => {
	it('accepts a fresh snapshot and ordinary transitions', () => {
		let graph = createVoiceMediaGraphSnapshot();
		expect(checkVoiceMediaGraphInvariants(graph)).toEqual([]);

		graph = transitionVoiceMediaGraph(graph, {type: 'watch.started', streamKey: STREAM_KEY, at: 0});
		graph = transitionVoiceMediaGraph(graph, {type: 'watchIntent.add', key: STREAM_KEY});
		graph = transitionVoiceMediaGraph(graph, {type: 'watchIntent.deferRemove', key: STREAM_KEY, at: 100});
		graph = transitionVoiceMediaGraph(graph, {
			type: 'stats.observed',
			at: 1000,
			connectionId: 'connection-a',
			platform: 'web',
			tracks: [],
		});

		expect(checkVoiceMediaGraphInvariants(graph)).toEqual([]);
	});

	it('flags actual subscriptions without a desired entry', () => {
		const entry = entryWithActualSubscribed(false);
		const graph: VoiceMediaGraphSnapshot = {
			...createVoiceMediaGraphSnapshot(),
			subscriptionsByKey: new Map([['user_2_connection-a:screen_share', entry]]),
		};

		const violations = checkVoiceMediaGraphInvariants(graph);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('actually subscribed without a desired entry');
	});

	it('flags failures recorded for a generation newer than current', () => {
		const graph = transitionVoiceMediaGraph(createVoiceMediaGraphSnapshot(), {
			type: 'failure.reported',
			failure: {
				code: -2302,
				reason: 'subscription-attach-timeout',
				reportedAt: 1000,
				streamKey: STREAM_KEY,
				generation: 5,
			},
		});

		const violations = checkVoiceMediaGraphInvariants(graph);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('newer than current');
	});

	it('flags deadlines referencing a missing attempt', () => {
		const deadline: VoiceMediaGraphDeadline = {
			kind: 'watchAttempt',
			streamKey: STREAM_KEY,
			subscriptionKey: null,
			generation: 0,
			attemptKey: 'attempt-gone',
			dueAt: 15000,
		};
		const graph: VoiceMediaGraphSnapshot = {
			...createVoiceMediaGraphSnapshot(),
			deadlinesByKey: new Map([[`watchAttempt:${STREAM_KEY}`, deadline]]),
		};

		const violations = checkVoiceMediaGraphInvariants(graph);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('missing attempt');
	});

	it('flags stats entries for an unknown connection id', () => {
		let graph = transitionVoiceMediaGraph(createVoiceMediaGraphSnapshot(), {
			type: 'stats.observed',
			at: 1000,
			connectionId: 'connection-a',
			platform: 'web',
			tracks: [
				{
					trackSid: 'TR_1',
					trackIdentifier: null,
					mediaSourceId: null,
					mid: null,
					rid: null,
					ssrc: null,
					participantIdentity: null,
					participantSid: null,
					source: null,
					direction: 'recv',
					kind: 'video',
					fps: 30,
					width: null,
					height: null,
					sourceFps: null,
					sourceWidth: null,
					sourceHeight: null,
				},
			],
		});
		graph = {...graph, statsConnectionId: 'connection-b'};

		const violations = checkVoiceMediaGraphInvariants(graph);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('unknown connection');
	});

	it('flags deferred stop keys that are not viewer stream keys', () => {
		const graph: VoiceMediaGraphSnapshot = {
			...createVoiceMediaGraphSnapshot(),
			watchIntent: {viewerStreamKeys: [], deferredStopKeys: new Set([STREAM_KEY])},
		};

		const violations = checkVoiceMediaGraphInvariants(graph);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('not a viewer stream key');
	});
});
