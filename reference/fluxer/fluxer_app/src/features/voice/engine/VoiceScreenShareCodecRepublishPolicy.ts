// SPDX-License-Identifier: AGPL-3.0-or-later

import type {NegotiationReason} from '@app/features/voice/engine/ScreenShareCodecNegotiation';
import type {VideoCodec} from 'livekit-client';
import {assign, getInitialSnapshot, type SnapshotFrom, setup, transition} from 'xstate';

export type ScreenShareCodecRepublishDecision =
	| {
			action: 'noop';
			reason: 'same-codec';
	  }
	| {
			action: 'republish';
			reason: 'forced' | 'manual' | 'automatic';
	  }
	| {
			action: 'defer';
			reason: 'active-share-stability' | 'live-republish-disabled';
	  };

interface ScreenShareCodecPublicationContext {
	currentCodec: VideoCodec | undefined;
	nextCodec: VideoCodec | null;
	reason: NegotiationReason | null;
	force: boolean;
	allowLiveRepublish: boolean;
	decision: ScreenShareCodecRepublishDecision;
}

type ScreenShareCodecPublicationEvent = {
	type: 'codec.selection';
	currentCodec: VideoCodec | undefined;
	nextCodec: VideoCodec;
	reason: NegotiationReason;
	force?: boolean;
	allowLiveRepublish?: boolean;
};

function initialContext(): ScreenShareCodecPublicationContext {
	return {
		currentCodec: undefined,
		nextCodec: null,
		reason: null,
		force: false,
		allowLiveRepublish: false,
		decision: {action: 'noop', reason: 'same-codec'},
	};
}

function getRepublishDecision(event: ScreenShareCodecPublicationEvent): ScreenShareCodecRepublishDecision {
	if (event.currentCodec === event.nextCodec && event.force !== true) {
		return {action: 'noop', reason: 'same-codec'};
	}
	if (event.allowLiveRepublish === false) {
		return {action: 'defer', reason: event.force === true ? 'live-republish-disabled' : 'active-share-stability'};
	}
	if (event.force === true) {
		return {action: 'republish', reason: 'forced'};
	}
	if (event.reason === 'manual') {
		return {action: 'republish', reason: 'manual'};
	}
	return {action: 'republish', reason: 'automatic'};
}

export const screenShareCodecPublicationStateMachine = setup({
	types: {} as {
		context: ScreenShareCodecPublicationContext;
		events: ScreenShareCodecPublicationEvent;
	},
	actions: {
		recordSelection: assign(({event}) => ({
			currentCodec: event.currentCodec,
			nextCodec: event.nextCodec,
			reason: event.reason,
			force: event.force === true,
			allowLiveRepublish: event.allowLiveRepublish === true,
			decision: getRepublishDecision(event),
		})),
	},
	guards: {
		isNoop: ({event}) => getRepublishDecision(event).action === 'noop',
		isRepublish: ({event}) => getRepublishDecision(event).action === 'republish',
	},
}).createMachine({
	id: 'screenShareCodecPublication',
	context: () => initialContext(),
	initial: 'stable',
	states: {
		stable: {
			on: {
				'codec.selection': [
					{guard: 'isNoop', target: 'stable', actions: 'recordSelection'},
					{guard: 'isRepublish', target: 'republishing', actions: 'recordSelection'},
					{target: 'deferred', actions: 'recordSelection'},
				],
			},
		},
		deferred: {
			on: {
				'codec.selection': [
					{guard: 'isNoop', target: 'stable', actions: 'recordSelection'},
					{guard: 'isRepublish', target: 'republishing', actions: 'recordSelection'},
					{target: 'deferred', actions: 'recordSelection'},
				],
			},
		},
		republishing: {
			on: {
				'codec.selection': [
					{guard: 'isNoop', target: 'stable', actions: 'recordSelection'},
					{guard: 'isRepublish', target: 'republishing', actions: 'recordSelection'},
					{target: 'deferred', actions: 'recordSelection'},
				],
			},
		},
	},
});

export type ScreenShareCodecPublicationSnapshot = SnapshotFrom<typeof screenShareCodecPublicationStateMachine>;

export function createScreenShareCodecPublicationSnapshot(): ScreenShareCodecPublicationSnapshot {
	return getInitialSnapshot(screenShareCodecPublicationStateMachine);
}

export function transitionScreenShareCodecPublicationSnapshot(
	snapshot: ScreenShareCodecPublicationSnapshot,
	event: ScreenShareCodecPublicationEvent,
): ScreenShareCodecPublicationSnapshot {
	return transition(screenShareCodecPublicationStateMachine, snapshot, event)[0] as ScreenShareCodecPublicationSnapshot;
}

export function selectScreenShareCodecRepublishDecision(options: {
	currentCodec: VideoCodec | undefined;
	nextCodec: VideoCodec;
	reason: NegotiationReason;
	force?: boolean;
	allowLiveRepublish?: boolean;
}): ScreenShareCodecRepublishDecision {
	const snapshot = transitionScreenShareCodecPublicationSnapshot(createScreenShareCodecPublicationSnapshot(), {
		type: 'codec.selection',
		currentCodec: options.currentCodec,
		nextCodec: options.nextCodec,
		reason: options.reason,
		...(options.force !== undefined ? {force: options.force} : {}),
		...(options.allowLiveRepublish !== undefined ? {allowLiveRepublish: options.allowLiveRepublish} : {}),
	});
	return snapshot.context.decision;
}
