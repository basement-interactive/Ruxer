// SPDX-License-Identifier: AGPL-3.0-or-later

import {fromTimestamp} from '@fluxer/snowflake/src/SnowflakeUtils';
import {describe, expect, it} from 'vitest';
import {
	createReadStateIncomingMessageSnapshot,
	type ReadStateIncomingMessageInput,
	resolveReadStateIncomingMessageDecision,
	selectReadStateIncomingMessageDecision,
	transitionReadStateIncomingMessageSnapshot,
} from './ReadStateIncomingMessageMachine';

const BASE_TIMESTAMP = Date.UTC(2024, 0, 1);
const PREVIOUS_ID = fromTimestamp(BASE_TIMESTAMP + 1000);
const ACK_ID = fromTimestamp(BASE_TIMESTAMP + 2000);
const MESSAGE_ID = fromTimestamp(BASE_TIMESTAMP + 3000);

function input(overrides: Partial<ReadStateIncomingMessageInput> = {}): ReadStateIncomingMessageInput {
	return {
		isCurrentUserAuthor: false,
		automaticAckEnabled: false,
		isAtBottom: false,
		authorBlocked: false,
		hadUnreadOrMentions: false,
		readStateKnown: true,
		messageId: MESSAGE_ID,
		ackMessageId: ACK_ID,
		previousLastMessageId: PREVIOUS_ID,
		...overrides,
	};
}

describe('readStateIncomingMessageMachine', () => {
	it('prioritizes current-user and automatic acknowledgements before unread recording', () => {
		expect(
			resolveReadStateIncomingMessageDecision(
				input({
					isCurrentUserAuthor: true,
					automaticAckEnabled: true,
					isAtBottom: true,
					authorBlocked: true,
				}),
			),
		).toEqual({type: 'ackCurrentUserMessage'});
		expect(resolveReadStateIncomingMessageDecision(input({automaticAckEnabled: true, isAtBottom: true}))).toEqual({
			type: 'ackAutomaticMessage',
		});
	});

	it('handles blocked authors without disturbing existing unread state', () => {
		expect(resolveReadStateIncomingMessageDecision(input({authorBlocked: true, hadUnreadOrMentions: false}))).toEqual({
			type: 'ackBlockedMessage',
		});
		expect(resolveReadStateIncomingMessageDecision(input({authorBlocked: true, hadUnreadOrMentions: true}))).toEqual({
			type: 'ignoreBlockedMessage',
		});
	});

	it('treats known and unknown read-state acknowledgements as coverage', () => {
		expect(resolveReadStateIncomingMessageDecision(input({messageId: ACK_ID, ackMessageId: ACK_ID}))).toEqual({
			type: 'coveredByAck',
		});
		expect(
			resolveReadStateIncomingMessageDecision(
				input({
					readStateKnown: false,
					messageId: PREVIOUS_ID,
					ackMessageId: null,
				}),
			),
		).toEqual({type: 'coveredByAck'});
	});

	it('records unread and initializes unknown read state only when needed', () => {
		expect(resolveReadStateIncomingMessageDecision(input())).toEqual({
			type: 'recordUnread',
			initializeUnknownReadState: false,
		});
		expect(resolveReadStateIncomingMessageDecision(input({readStateKnown: false, ackMessageId: null}))).toEqual({
			type: 'recordUnread',
			initializeUnknownReadState: true,
		});
	});

	it('updates the decision from later message input', () => {
		const unreadSnapshot = createReadStateIncomingMessageSnapshot(input());
		expect(selectReadStateIncomingMessageDecision(unreadSnapshot)).toEqual({
			type: 'recordUnread',
			initializeUnknownReadState: false,
		});

		const autoAckSnapshot = transitionReadStateIncomingMessageSnapshot(unreadSnapshot, {
			type: 'incomingMessage.updated',
			input: input({automaticAckEnabled: true, isAtBottom: true}),
		});

		expect(selectReadStateIncomingMessageDecision(autoAckSnapshot)).toEqual({type: 'ackAutomaticMessage'});
	});
});
