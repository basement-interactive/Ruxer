// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {
	createMessageFetchExecutionSnapshot,
	createMessageFetchPreflightSnapshot,
	type MessageFetchExecutionInput,
	type MessageFetchPreflightInput,
	resolveMessageFetchExecutionDecision,
	resolveMessageFetchPreflightDecision,
	selectMessageFetchExecutionDecision,
	selectMessageFetchPreflightDecision,
	transitionMessageFetchExecutionSnapshot,
	transitionMessageFetchPreflightSnapshot,
} from './MessageFetchStateMachine';

function preflight(overrides: Partial<MessageFetchPreflightInput> = {}): MessageFetchPreflightInput {
	return {
		hasInFlightRequest: false,
		shouldBlockForGate: false,
		cacheHit: null,
		...overrides,
	};
}

function execution(overrides: Partial<MessageFetchExecutionInput> = {}): MessageFetchExecutionInput {
	return {
		forceFailure: false,
		...overrides,
	};
}

describe('messageFetchPreflightMachine', () => {
	it('prioritizes in-flight requests before gate and cache decisions', () => {
		expect(
			resolveMessageFetchPreflightDecision(
				preflight({
					hasInFlightRequest: true,
					shouldBlockForGate: true,
					cacheHit: 'before',
				}),
			),
		).toEqual({type: 'useInFlightRequest'});
	});

	it('blocks gated channels before consulting cache hits', () => {
		expect(resolveMessageFetchPreflightDecision(preflight({shouldBlockForGate: true, cacheHit: 'jump'}))).toEqual({
			type: 'blockForGate',
		});
	});

	it('returns the specific cache hit when cached messages can satisfy the request', () => {
		expect(resolveMessageFetchPreflightDecision(preflight({cacheHit: 'jump'}))).toEqual({
			type: 'useCache',
			cacheHit: 'jump',
		});
		expect(resolveMessageFetchPreflightDecision(preflight({cacheHit: 'before'}))).toEqual({
			type: 'useCache',
			cacheHit: 'before',
		});
		expect(resolveMessageFetchPreflightDecision(preflight({cacheHit: 'after'}))).toEqual({
			type: 'useCache',
			cacheHit: 'after',
		});
	});

	it('starts a network fetch when no preflight condition resolves the request', () => {
		expect(resolveMessageFetchPreflightDecision(preflight())).toEqual({type: 'startFetch'});
	});

	it('re-routes when preflight inputs change', () => {
		const cachedSnapshot = createMessageFetchPreflightSnapshot(preflight({cacheHit: 'after'}));
		expect(selectMessageFetchPreflightDecision(cachedSnapshot)).toEqual({type: 'useCache', cacheHit: 'after'});

		const networkSnapshot = transitionMessageFetchPreflightSnapshot(cachedSnapshot, {
			type: 'messageFetch.preflightChanged',
			input: preflight(),
		});

		expect(selectMessageFetchPreflightDecision(networkSnapshot)).toEqual({type: 'startFetch'});
	});
});

describe('messageFetchExecutionMachine', () => {
	it('requests the network by default', () => {
		expect(resolveMessageFetchExecutionDecision(execution())).toEqual({type: 'requestNetwork'});
	});

	it('routes developer-forced failures before network fetch', () => {
		expect(resolveMessageFetchExecutionDecision(execution({forceFailure: true}))).toEqual({
			type: 'simulateFailure',
		});
	});

	it('re-routes when execution inputs change', () => {
		const forcedSnapshot = createMessageFetchExecutionSnapshot(execution({forceFailure: true}));
		expect(selectMessageFetchExecutionDecision(forcedSnapshot)).toEqual({type: 'simulateFailure'});

		const networkSnapshot = transitionMessageFetchExecutionSnapshot(forcedSnapshot, {
			type: 'messageFetch.executionChanged',
			input: execution({forceFailure: false}),
		});

		expect(selectMessageFetchExecutionDecision(networkSnapshot)).toEqual({type: 'requestNetwork'});
	});
});
