// SPDX-License-Identifier: AGPL-3.0-or-later

import {assign, getInitialSnapshot, type SnapshotFrom, setup, transition} from 'xstate';

export interface ChannelMessagesLoadInput {
	isBefore: boolean;
	isAfter: boolean;
	hasJump: boolean;
	wasReady: boolean;
}

export type ChannelMessagesLoadMode = 'replace' | 'mergeBefore' | 'mergeAfter';

export interface ChannelMessagesLoadDecision {
	mode: ChannelMessagesLoadMode;
	prepend: boolean;
	trimTop: boolean;
	trimBottom: boolean;
	preserveHasMoreBefore: boolean;
	preserveHasMoreAfter: boolean;
}

export type ChannelMessagesLoadEvent = {
	type: 'channelMessagesLoad.updated';
	input: ChannelMessagesLoadInput;
};

function shouldReplaceVisibleWindow(context: ChannelMessagesLoadInput): boolean {
	if (context.hasJump) return true;
	if (!context.wasReady) return true;
	return !context.isBefore && !context.isAfter;
}

function getLoadMode(snapshot: ChannelMessagesLoadSnapshot): ChannelMessagesLoadMode {
	switch (snapshot.value) {
		case 'mergeBefore':
			return 'mergeBefore';
		case 'mergeAfter':
			return 'mergeAfter';
		default:
			return 'replace';
	}
}

function getLoadModeFromInput(input: ChannelMessagesLoadInput): ChannelMessagesLoadMode {
	if (shouldReplaceVisibleWindow(input)) return 'replace';
	if (input.isBefore) return 'mergeBefore';
	return 'mergeAfter';
}

function buildChannelMessagesLoadDecision(mode: ChannelMessagesLoadMode): ChannelMessagesLoadDecision {
	switch (mode) {
		case 'mergeBefore':
			return {
				mode,
				prepend: true,
				trimTop: false,
				trimBottom: true,
				preserveHasMoreBefore: false,
				preserveHasMoreAfter: true,
			};
		case 'mergeAfter':
			return {
				mode,
				prepend: false,
				trimTop: true,
				trimBottom: false,
				preserveHasMoreBefore: true,
				preserveHasMoreAfter: false,
			};
		case 'replace':
			return {
				mode,
				prepend: false,
				trimTop: false,
				trimBottom: false,
				preserveHasMoreBefore: false,
				preserveHasMoreAfter: false,
			};
	}
}

export const channelMessagesLoadMachine = setup({
	types: {} as {
		context: ChannelMessagesLoadInput;
		events: ChannelMessagesLoadEvent;
		input: ChannelMessagesLoadInput;
	},
	actions: {
		applyInput: assign(({event}) => {
			if (event.type !== 'channelMessagesLoad.updated') return {};
			return event.input;
		}),
	},
	guards: {
		shouldReplaceVisibleWindow: ({context}) => shouldReplaceVisibleWindow(context),
		isBeforePage: ({context}) => context.isBefore,
	},
}).createMachine({
	id: 'channelMessagesLoad',
	context: ({input}) => input,
	initial: 'routing',
	states: {
		routing: {
			always: [
				{guard: 'shouldReplaceVisibleWindow', target: 'replace'},
				{guard: 'isBeforePage', target: 'mergeBefore'},
				{target: 'mergeAfter'},
			],
		},
		replace: {
			on: {'channelMessagesLoad.updated': {target: 'routing', actions: 'applyInput'}},
		},
		mergeBefore: {
			on: {'channelMessagesLoad.updated': {target: 'routing', actions: 'applyInput'}},
		},
		mergeAfter: {
			on: {'channelMessagesLoad.updated': {target: 'routing', actions: 'applyInput'}},
		},
	},
});

export type ChannelMessagesLoadSnapshot = SnapshotFrom<typeof channelMessagesLoadMachine>;

export function createChannelMessagesLoadSnapshot(input: ChannelMessagesLoadInput): ChannelMessagesLoadSnapshot {
	return getInitialSnapshot(channelMessagesLoadMachine, input);
}

export function transitionChannelMessagesLoadSnapshot(
	snapshot: ChannelMessagesLoadSnapshot,
	event: ChannelMessagesLoadEvent,
): ChannelMessagesLoadSnapshot {
	return transition(channelMessagesLoadMachine, snapshot, event)[0] as ChannelMessagesLoadSnapshot;
}

export function selectChannelMessagesLoadDecision(snapshot: ChannelMessagesLoadSnapshot): ChannelMessagesLoadDecision {
	return buildChannelMessagesLoadDecision(getLoadMode(snapshot));
}

export function resolveChannelMessagesLoadDecision(input: ChannelMessagesLoadInput): ChannelMessagesLoadDecision {
	return buildChannelMessagesLoadDecision(getLoadModeFromInput(input));
}
