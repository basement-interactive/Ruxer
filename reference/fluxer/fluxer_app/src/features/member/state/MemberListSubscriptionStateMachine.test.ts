// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {
	createMemberListSubscriptionSnapshot,
	INITIAL_MEMBER_LIST_SUBSCRIPTION_RANGE,
	MEMBER_LIST_INITIAL_RETRY_DELAY_MS,
	MEMBER_LIST_MAX_RETRY_DELAY_MS,
	selectMemberListSubscriptionModel,
	transitionMemberListSubscriptionSnapshot,
} from './MemberListSubscriptionStateMachine';

describe('MemberListSubscriptionStateMachine', () => {
	it('starts enabled with the initial subscription range by default', () => {
		const model = selectMemberListSubscriptionModel(createMemberListSubscriptionSnapshot());
		expect(model.isEnabled).toBe(true);
		expect(model.isActive).toBe(true);
		expect(model.isPaused).toBe(false);
		expect(model.isSubscribed).toBe(false);
		expect(model.desiredRanges).toEqual([INITIAL_MEMBER_LIST_SUBSCRIPTION_RANGE]);
		expect(model.pendingRanges).toBeNull();
	});

	it('coalesces requested ranges by keeping only the latest pending request', () => {
		let snapshot = createMemberListSubscriptionSnapshot();
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.rangesRequested',
			ranges: [[0, 99]],
		});
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.rangesRequested',
			ranges: [
				[400, 499],
				[300, 399],
			],
		});
		const model = selectMemberListSubscriptionModel(snapshot);
		expect(model.desiredRanges).toEqual([
			[300, 399],
			[400, 499],
		]);
		expect(model.pendingRanges).toEqual([
			[300, 399],
			[400, 499],
		]);
	});

	it('records the applied subscription and clears pending ranges after a flush', () => {
		let snapshot = createMemberListSubscriptionSnapshot();
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.rangesRequested',
			ranges: [[400, 499]],
		});
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.pendingFlushed',
		});
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.subscriptionApplied',
			ranges: [[400, 499]],
		});
		const model = selectMemberListSubscriptionModel(snapshot);
		expect(model.isSubscribed).toBe(true);
		expect(model.pendingRanges).toBeNull();
		expect(model.subscribedRanges).toEqual([[400, 499]]);
		expect(model.retryDelayMs).toBe(MEMBER_LIST_INITIAL_RETRY_DELAY_MS);
	});

	it('clears subscription state when disabled without losing the desired range', () => {
		let snapshot = createMemberListSubscriptionSnapshot();
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.rangesRequested',
			ranges: [[400, 499]],
		});
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.subscriptionApplied',
			ranges: [[400, 499]],
		});
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.disabled',
		});
		const model = selectMemberListSubscriptionModel(snapshot);
		expect(model.isEnabled).toBe(false);
		expect(model.isActive).toBe(false);
		expect(model.isPaused).toBe(false);
		expect(model.isSubscribed).toBe(false);
		expect(model.desiredRanges).toEqual([[400, 499]]);
		expect(model.subscribedRanges).toEqual([]);
	});

	it('pauses an active subscription without losing the desired range', () => {
		let snapshot = createMemberListSubscriptionSnapshot();
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.rangesRequested',
			ranges: [[400, 499]],
		});
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.subscriptionApplied',
			ranges: [[400, 499]],
		});
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.paused',
		});
		let model = selectMemberListSubscriptionModel(snapshot);
		expect(model.isEnabled).toBe(true);
		expect(model.isActive).toBe(false);
		expect(model.isPaused).toBe(true);
		expect(model.isSubscribed).toBe(false);
		expect(model.desiredRanges).toEqual([[400, 499]]);
		expect(model.subscribedRanges).toEqual([]);

		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.rangesRequested',
			ranges: [[500, 599]],
		});
		model = selectMemberListSubscriptionModel(snapshot);
		expect(model.isPaused).toBe(true);
		expect(model.desiredRanges).toEqual([[500, 599]]);
		expect(model.pendingRanges).toEqual([[500, 599]]);
	});

	it('resumes from paused with the latest desired range intact', () => {
		let snapshot = createMemberListSubscriptionSnapshot({
			paused: true,
			desiredRanges: [[400, 499]],
			subscribedRanges: [[400, 499]],
			isSubscribed: true,
		});
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.rangesRequested',
			ranges: [[500, 599]],
		});
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.resumed',
		});
		const model = selectMemberListSubscriptionModel(snapshot);
		expect(model.isEnabled).toBe(true);
		expect(model.isActive).toBe(true);
		expect(model.isPaused).toBe(false);
		expect(model.isSubscribed).toBe(false);
		expect(model.desiredRanges).toEqual([[500, 599]]);
		expect(model.pendingRanges).toEqual([[500, 599]]);
		expect(model.subscribedRanges).toEqual([]);
	});

	it('backs retry delay off up to the configured maximum and resets on success', () => {
		let snapshot = createMemberListSubscriptionSnapshot();
		for (let i = 0; i < 20; i += 1) {
			snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
				type: 'memberListSubscription.retryBackedOff',
			});
		}
		let model = selectMemberListSubscriptionModel(snapshot);
		expect(model.retryDelayMs).toBe(MEMBER_LIST_MAX_RETRY_DELAY_MS);
		snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
			type: 'memberListSubscription.retrySucceeded',
		});
		model = selectMemberListSubscriptionModel(snapshot);
		expect(model.retryDelayMs).toBe(MEMBER_LIST_INITIAL_RETRY_DELAY_MS);
	});
});
