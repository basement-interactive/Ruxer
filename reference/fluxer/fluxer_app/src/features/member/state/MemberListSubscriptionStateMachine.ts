// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	type MemberListRange,
	type MemberListRanges,
	type NormalizedMemberListRanges,
	normalizeMemberListRanges,
} from '@app/features/member/utils/MemberListRangeUtils';
import {MEMBER_LIST_RANGE_MAX_SPAN} from '@fluxer/constants/src/GatewayConstants';
import {assign, getInitialSnapshot, type SnapshotFrom, setup, transition} from 'xstate';

export const INITIAL_MEMBER_LIST_SUBSCRIPTION_RANGE: [number, number] = [0, MEMBER_LIST_RANGE_MAX_SPAN];
export const MEMBER_LIST_INITIAL_RETRY_DELAY_MS = 2000;
export const MEMBER_LIST_MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

export type {MemberListRange, MemberListRanges, NormalizedMemberListRanges};

export interface MemberListSubscriptionMachineInput {
	enabled?: boolean;
	paused?: boolean;
	desiredRanges?: MemberListRanges;
	subscribedRanges?: MemberListRanges;
	retryDelayMs?: number;
	isSubscribed?: boolean;
}

export interface MemberListSubscriptionMachineContext {
	enabled: boolean;
	paused: boolean;
	desiredRanges: NormalizedMemberListRanges;
	pendingRanges: NormalizedMemberListRanges | null;
	subscribedRanges: NormalizedMemberListRanges;
	retryDelayMs: number;
	isSubscribed: boolean;
}

export type MemberListSubscriptionMachineEvent =
	| {
			type: 'memberListSubscription.enabled';
	  }
	| {
			type: 'memberListSubscription.disabled';
	  }
	| {
			type: 'memberListSubscription.paused';
	  }
	| {
			type: 'memberListSubscription.resumed';
	  }
	| {
			type: 'memberListSubscription.reset';
			desiredRanges?: MemberListRanges;
	  }
	| {
			type: 'memberListSubscription.rangesRequested';
			ranges: MemberListRanges;
	  }
	| {
			type: 'memberListSubscription.pendingFlushed';
	  }
	| {
			type: 'memberListSubscription.subscriptionApplied';
			ranges: MemberListRanges;
	  }
	| {
			type: 'memberListSubscription.subscriptionCleared';
	  }
	| {
			type: 'memberListSubscription.retrySucceeded';
	  }
	| {
			type: 'memberListSubscription.retryBackedOff';
	  };

export interface MemberListSubscriptionModel {
	isEnabled: boolean;
	isActive: boolean;
	isPaused: boolean;
	isSubscribed: boolean;
	desiredRanges: NormalizedMemberListRanges;
	pendingRanges: NormalizedMemberListRanges | null;
	subscribedRanges: NormalizedMemberListRanges;
	retryDelayMs: number;
}

export type MemberListSubscriptionMachineSnapshot = SnapshotFrom<typeof memberListSubscriptionStateMachine>;

function normalizeRanges(ranges: MemberListRanges | null | undefined): NormalizedMemberListRanges {
	return normalizeMemberListRanges(ranges ?? []);
}

function sanitizeRetryDelay(delayMs: number | null | undefined): number {
	if (delayMs == null || !Number.isFinite(delayMs)) {
		return MEMBER_LIST_INITIAL_RETRY_DELAY_MS;
	}
	return Math.min(Math.max(0, Math.floor(delayMs)), MEMBER_LIST_MAX_RETRY_DELAY_MS);
}

export const memberListSubscriptionStateMachine = setup({
	types: {} as {
		context: MemberListSubscriptionMachineContext;
		events: MemberListSubscriptionMachineEvent;
		input: MemberListSubscriptionMachineInput;
	},
	actions: {
		reset: assign(({context, event}) => ({
			enabled: context.enabled,
			paused: context.paused,
			desiredRanges: normalizeRanges(
				event.type === 'memberListSubscription.reset'
					? (event.desiredRanges ?? [INITIAL_MEMBER_LIST_SUBSCRIPTION_RANGE])
					: [INITIAL_MEMBER_LIST_SUBSCRIPTION_RANGE],
			),
			pendingRanges: null,
			subscribedRanges: normalizeRanges([]),
			isSubscribed: false,
			retryDelayMs: MEMBER_LIST_INITIAL_RETRY_DELAY_MS,
		})),
		applyRequestedRanges: assign(({event}) => {
			if (event.type !== 'memberListSubscription.rangesRequested') {
				return {};
			}
			const ranges = normalizeRanges(event.ranges);
			return {
				desiredRanges: ranges,
				pendingRanges: ranges,
			};
		}),
		clearPendingRanges: assign({
			pendingRanges: null,
		}),
		applySubscription: assign(({event}) => {
			if (event.type !== 'memberListSubscription.subscriptionApplied') {
				return {};
			}
			return {
				isSubscribed: true,
				subscribedRanges: normalizeRanges(event.ranges),
				pendingRanges: null,
				retryDelayMs: MEMBER_LIST_INITIAL_RETRY_DELAY_MS,
			};
		}),
		clearSubscription: assign({
			isSubscribed: false,
			subscribedRanges: normalizeRanges([]),
			pendingRanges: null,
		}),
		markEnabled: assign({
			enabled: true,
		}),
		markDisabled: assign({
			enabled: false,
			paused: false,
		}),
		markPaused: assign({
			paused: true,
		}),
		markResumed: assign({
			paused: false,
		}),
		resetRetryDelay: assign({
			retryDelayMs: MEMBER_LIST_INITIAL_RETRY_DELAY_MS,
		}),
		backOffRetryDelay: assign({
			retryDelayMs: ({context}) => Math.min(context.retryDelayMs * 2, MEMBER_LIST_MAX_RETRY_DELAY_MS),
		}),
	},
}).createMachine({
	id: 'memberListSubscription',
	context: ({input}) => ({
		enabled: input.enabled ?? true,
		paused: input.paused ?? false,
		desiredRanges: normalizeRanges(input.desiredRanges ?? [INITIAL_MEMBER_LIST_SUBSCRIPTION_RANGE]),
		pendingRanges: null,
		subscribedRanges: normalizeRanges(input.subscribedRanges),
		isSubscribed: input.isSubscribed ?? false,
		retryDelayMs: sanitizeRetryDelay(input.retryDelayMs),
	}),
	initial: 'routing',
	states: {
		routing: {
			always: [
				{guard: ({context}) => !context.enabled, target: 'disabled'},
				{guard: ({context}) => context.paused, target: 'paused'},
				{target: 'enabled'},
			],
		},
		disabled: {
			entry: 'clearSubscription',
			on: {
				'memberListSubscription.enabled': {target: 'enabled', actions: 'markEnabled'},
				'memberListSubscription.reset': {actions: 'reset'},
			},
		},
		enabled: {
			on: {
				'memberListSubscription.disabled': {target: 'disabled', actions: 'markDisabled'},
				'memberListSubscription.paused': {target: 'paused', actions: 'markPaused'},
				'memberListSubscription.reset': {actions: 'reset'},
				'memberListSubscription.rangesRequested': {actions: 'applyRequestedRanges'},
				'memberListSubscription.pendingFlushed': {actions: 'clearPendingRanges'},
				'memberListSubscription.subscriptionApplied': {actions: 'applySubscription'},
				'memberListSubscription.subscriptionCleared': {actions: 'clearSubscription'},
				'memberListSubscription.retrySucceeded': {actions: 'resetRetryDelay'},
				'memberListSubscription.retryBackedOff': {actions: 'backOffRetryDelay'},
			},
		},
		paused: {
			entry: 'clearSubscription',
			on: {
				'memberListSubscription.disabled': {target: 'disabled', actions: 'markDisabled'},
				'memberListSubscription.resumed': {target: 'enabled', actions: 'markResumed'},
				'memberListSubscription.reset': {actions: 'reset'},
				'memberListSubscription.rangesRequested': {actions: 'applyRequestedRanges'},
				'memberListSubscription.subscriptionCleared': {actions: 'clearSubscription'},
			},
		},
	},
});

export function createMemberListSubscriptionSnapshot(
	input: MemberListSubscriptionMachineInput = {},
): MemberListSubscriptionMachineSnapshot {
	return getInitialSnapshot(memberListSubscriptionStateMachine, input);
}

export function transitionMemberListSubscriptionSnapshot(
	snapshot: MemberListSubscriptionMachineSnapshot,
	event: MemberListSubscriptionMachineEvent,
): MemberListSubscriptionMachineSnapshot {
	return transition(memberListSubscriptionStateMachine, snapshot, event)[0] as MemberListSubscriptionMachineSnapshot;
}

export function selectMemberListSubscriptionModel(
	snapshot: MemberListSubscriptionMachineSnapshot,
): MemberListSubscriptionModel {
	const isActive = snapshot.value === 'enabled';
	const isPaused = snapshot.value === 'paused';
	return {
		isEnabled: snapshot.context.enabled,
		isActive,
		isPaused,
		isSubscribed: snapshot.context.isSubscribed,
		desiredRanges: snapshot.context.desiredRanges,
		pendingRanges: snapshot.context.pendingRanges,
		subscribedRanges: snapshot.context.subscribedRanges,
		retryDelayMs: snapshot.context.retryDelayMs,
	};
}
