// SPDX-License-Identifier: AGPL-3.0-or-later

import {bench, describe} from 'vitest';
import {
	createMemberListSubscriptionSnapshot,
	selectMemberListSubscriptionModel,
	transitionMemberListSubscriptionSnapshot,
} from './MemberListSubscriptionStateMachine';
import {
	createMemberListViewportSnapshot,
	selectMemberListViewportModel,
	transitionMemberListViewportSnapshot,
} from './MemberListViewportStateMachine';

const REQUEST_WINDOWS = Array.from({length: 1_000}, (_, index): Array<[number, number]> => {
	const page = (index * 37) % 1_000;
	return [[page * 100, page * 100 + 99]];
});

describe('Member list state machine benchmarks', () => {
	bench('subscription machine coalesces 1k fast range requests', () => {
		let snapshot = createMemberListSubscriptionSnapshot();
		for (const ranges of REQUEST_WINDOWS) {
			snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
				type: 'memberListSubscription.rangesRequested',
				ranges,
			});
		}
		selectMemberListSubscriptionModel(snapshot);
	});

	bench('subscription machine applies and clears 1k subscriptions', () => {
		let snapshot = createMemberListSubscriptionSnapshot();
		for (const ranges of REQUEST_WINDOWS) {
			snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
				type: 'memberListSubscription.subscriptionApplied',
				ranges,
			});
			snapshot = transitionMemberListSubscriptionSnapshot(snapshot, {
				type: 'memberListSubscription.subscriptionCleared',
			});
		}
		selectMemberListSubscriptionModel(snapshot);
	});

	bench('viewport machine resolves 1k render-window transitions', () => {
		let snapshot = createMemberListViewportSnapshot({
			hasReceivedInitialPayload: true,
			requestedRanges: [[0, 99]],
			subscribedRanges: [[0, 99]],
			totalRows: 100_000,
		});
		for (const requestedRanges of REQUEST_WINDOWS) {
			snapshot = transitionMemberListViewportSnapshot(snapshot, {
				type: 'memberList.rangesRequested',
				requestedRanges,
			});
			selectMemberListViewportModel(snapshot);
		}
	});
});
