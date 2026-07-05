// SPDX-License-Identifier: AGPL-3.0-or-later

import {assign, getInitialSnapshot, type SnapshotFrom, setup, transition} from 'xstate';

export const LOCAL_TYPING_REMOTE_SEND_DELAY_MS = 1500;
export const LOCAL_TYPING_REMOTE_REFRESH_MS = 10000 * 0.8;

export interface LocalTypingMachineInput {
	channelId?: string | null;
	localTyping?: boolean;
	remoteCooldownChannelId?: string | null;
	remoteCooldownUntil?: number | null;
	remotePending?: boolean;
	remotePendingVersion?: number;
}

export interface LocalTypingMachineContext {
	channelId: string | null;
	localTyping: boolean;
	remoteCooldownChannelId: string | null;
	remoteCooldownUntil: number | null;
	remotePending: boolean;
	remotePendingVersion: number;
}

export type LocalTypingMachineEvent =
	| {
			type: 'localTyping.started';
			channelId: string;
			now: number;
	  }
	| {
			type: 'localTyping.stopped';
			channelId: string;
	  }
	| {
			type: 'localTyping.remoteSent';
			channelId: string;
			now: number;
			pendingVersion: number;
	  };

export interface LocalTypingModel {
	channelId: string | null;
	localTyping: boolean;
	remotePending: boolean;
	remotePendingVersion: number;
	remoteCooldownChannelId: string | null;
	remoteCooldownUntil: number | null;
	remoteSendDelayMs: number;
}

export type LocalTypingSnapshot = SnapshotFrom<typeof localTypingStateMachine>;

function canScheduleRemoteSend(context: LocalTypingMachineContext, channelId: string, now: number): boolean {
	return (
		context.remoteCooldownChannelId !== channelId ||
		context.remoteCooldownUntil == null ||
		context.remoteCooldownUntil <= now
	);
}

function matchesActiveChannel(context: LocalTypingMachineContext, channelId: string): boolean {
	return context.localTyping && context.channelId === channelId;
}

export const localTypingStateMachine = setup({
	types: {} as {
		context: LocalTypingMachineContext;
		events: LocalTypingMachineEvent;
		input: LocalTypingMachineInput;
	},
	actions: {
		startLocalTyping: assign(({context, event}) => {
			if (event.type !== 'localTyping.started') {
				return {};
			}
			const shouldScheduleRemote = canScheduleRemoteSend(context, event.channelId, event.now);
			return {
				channelId: event.channelId,
				localTyping: true,
				remotePending: shouldScheduleRemote,
				remotePendingVersion: shouldScheduleRemote ? context.remotePendingVersion + 1 : context.remotePendingVersion,
			};
		}),
		stopLocalTyping: assign(({context, event}) => {
			if (event.type !== 'localTyping.stopped' || !matchesActiveChannel(context, event.channelId)) {
				return {};
			}
			return {
				channelId: null,
				localTyping: false,
				remotePending: false,
			};
		}),
		markRemoteSent: assign(({context, event}) => {
			if (
				event.type !== 'localTyping.remoteSent' ||
				context.channelId !== event.channelId ||
				context.remotePendingVersion !== event.pendingVersion ||
				!context.remotePending
			) {
				return {};
			}
			return {
				remotePending: false,
				remoteCooldownChannelId: event.channelId,
				remoteCooldownUntil: event.now + LOCAL_TYPING_REMOTE_REFRESH_MS,
			};
		}),
	},
}).createMachine({
	id: 'localTyping',
	context: ({input}) => ({
		channelId: input.channelId ?? null,
		localTyping: input.localTyping ?? false,
		remoteCooldownChannelId: input.remoteCooldownChannelId ?? null,
		remoteCooldownUntil: input.remoteCooldownUntil ?? null,
		remotePending: input.remotePending ?? false,
		remotePendingVersion: input.remotePendingVersion ?? 0,
	}),
	initial: 'ready',
	states: {
		ready: {
			on: {
				'localTyping.started': {actions: 'startLocalTyping'},
				'localTyping.stopped': {actions: 'stopLocalTyping'},
				'localTyping.remoteSent': {actions: 'markRemoteSent'},
			},
		},
	},
});

export function createLocalTypingSnapshot(input: LocalTypingMachineInput = {}): LocalTypingSnapshot {
	return getInitialSnapshot(localTypingStateMachine, input);
}

export function transitionLocalTypingSnapshot(
	snapshot: LocalTypingSnapshot,
	event: LocalTypingMachineEvent,
): LocalTypingSnapshot {
	return transition(localTypingStateMachine, snapshot, event)[0] as LocalTypingSnapshot;
}

export function selectLocalTypingModel(snapshot: LocalTypingSnapshot): LocalTypingModel {
	return {
		channelId: snapshot.context.channelId,
		localTyping: snapshot.context.localTyping,
		remotePending: snapshot.context.remotePending,
		remotePendingVersion: snapshot.context.remotePendingVersion,
		remoteCooldownChannelId: snapshot.context.remoteCooldownChannelId,
		remoteCooldownUntil: snapshot.context.remoteCooldownUntil,
		remoteSendDelayMs: LOCAL_TYPING_REMOTE_SEND_DELAY_MS,
	};
}
