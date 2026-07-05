// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {
	type ChannelMessagesLoadInput,
	createChannelMessagesLoadSnapshot,
	resolveChannelMessagesLoadDecision,
	selectChannelMessagesLoadDecision,
	transitionChannelMessagesLoadSnapshot,
} from './ChannelMessagesLoadStateMachine';

function input(overrides: Partial<ChannelMessagesLoadInput> = {}): ChannelMessagesLoadInput {
	return {
		isBefore: false,
		isAfter: false,
		hasJump: false,
		wasReady: true,
		...overrides,
	};
}

describe('channelMessagesLoadMachine', () => {
	it('replaces the visible window for initial, replacement, and jump loads', () => {
		expect(resolveChannelMessagesLoadDecision(input({wasReady: false, isBefore: true}))).toMatchObject({
			mode: 'replace',
			trimTop: false,
			trimBottom: false,
			preserveHasMoreBefore: false,
			preserveHasMoreAfter: false,
		});
		expect(resolveChannelMessagesLoadDecision(input())).toMatchObject({mode: 'replace'});
		expect(resolveChannelMessagesLoadDecision(input({hasJump: true, isAfter: true}))).toMatchObject({
			mode: 'replace',
		});
	});

	it('merges before-pages by prepending and trimming the bottom side', () => {
		expect(resolveChannelMessagesLoadDecision(input({isBefore: true}))).toEqual({
			mode: 'mergeBefore',
			prepend: true,
			trimTop: false,
			trimBottom: true,
			preserveHasMoreBefore: false,
			preserveHasMoreAfter: true,
		});
	});

	it('merges after-pages by appending and trimming the top side', () => {
		expect(resolveChannelMessagesLoadDecision(input({isAfter: true}))).toEqual({
			mode: 'mergeAfter',
			prepend: false,
			trimTop: true,
			trimBottom: false,
			preserveHasMoreBefore: true,
			preserveHasMoreAfter: false,
		});
	});

	it('gives before-pages precedence when both directional flags are present', () => {
		expect(resolveChannelMessagesLoadDecision(input({isBefore: true, isAfter: true}))).toMatchObject({
			mode: 'mergeBefore',
		});
	});

	it('re-routes when load inputs change', () => {
		const beforeSnapshot = createChannelMessagesLoadSnapshot(input({isBefore: true}));
		expect(selectChannelMessagesLoadDecision(beforeSnapshot)).toMatchObject({mode: 'mergeBefore'});

		const replacementSnapshot = transitionChannelMessagesLoadSnapshot(beforeSnapshot, {
			type: 'channelMessagesLoad.updated',
			input: input({hasJump: true}),
		});

		expect(selectChannelMessagesLoadDecision(replacementSnapshot)).toMatchObject({mode: 'replace'});
	});
});
