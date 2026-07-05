// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	collectMessageModelGuildMemberUserIds,
	collectWireMessageGuildMemberUserIds,
} from '@app/features/messaging/utils/MessageMemberLoadUtils';
import type {MessageMention, Message as WireMessage} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {describe, expect, it} from 'vitest';

interface MessageModelFixture {
	readonly id: string;
	readonly guildId: string;
	readonly author: {readonly id: string};
	readonly webhookId?: string;
	readonly mentions: ReadonlyArray<{readonly id: string}>;
	readonly messageSnapshots?: ReadonlyArray<{
		mentions?: ReadonlyArray<string>;
		type: number;
		content: string;
		timestamp: string;
	}>;
	readonly referencedMessage?: MessageModelFixture | null;
}

function wireMention(id: string): MessageMention {
	return {
		id,
		username: id,
		discriminator: '0',
		global_name: null,
		avatar: null,
		avatar_color: null,
		flags: 0,
	};
}

function wireMessage(id: string, authorId: string, overrides: Partial<WireMessage> = {}): WireMessage {
	return {
		id,
		channel_id: 'channel-1',
		guild_id: 'guild-1',
		author: wireMention(authorId),
		type: 0,
		flags: 0,
		pinned: false,
		tts: false,
		mention_everyone: false,
		content: '',
		timestamp: '2026-01-01T00:00:00.000Z',
		mentions: [],
		mention_roles: [],
		...overrides,
	} as WireMessage;
}

function modelMessage(id: string, authorId: string, overrides: Partial<MessageModelFixture> = {}): MessageModelFixture {
	return {
		id,
		guildId: 'guild-1',
		author: {id: authorId},
		mentions: [],
		...overrides,
	};
}

describe('MessageMemberLoadUtils', () => {
	it('collects wire message authors, mentions, snapshot mentions, and referenced-message users', () => {
		const userIds = collectWireMessageGuildMemberUserIds(
			[
				wireMessage('message-1', 'author-1', {
					mentions: [wireMention('mention-1'), wireMention('current-user')],
					message_snapshots: [{mentions: ['snapshot-mention'], type: 0, content: '', timestamp: ''}],
					referenced_message: wireMessage('message-2', 'referenced-author', {
						mentions: [wireMention('referenced-mention')],
					}),
				}),
				wireMessage('message-3', 'webhook-author', {
					webhook_id: 'webhook-1',
					mentions: [wireMention('webhook-mention')],
				}),
				wireMessage('message-4', 'current-user'),
			],
			'current-user',
		);

		expect(userIds).toEqual([
			'author-1',
			'mention-1',
			'current-user',
			'snapshot-mention',
			'referenced-author',
			'referenced-mention',
			'webhook-mention',
		]);
	});

	it('collects cached message model authors, mentions, snapshot mentions, and referenced-message users', () => {
		const userIds = collectMessageModelGuildMemberUserIds(
			[
				modelMessage('message-1', 'author-1', {
					mentions: [{id: 'mention-1'}, {id: 'author-1'}],
					messageSnapshots: [{mentions: ['snapshot-mention'], type: 0, content: '', timestamp: ''}],
					referencedMessage: modelMessage('message-2', 'referenced-author', {
						mentions: [{id: 'referenced-mention'}],
					}),
				}),
				modelMessage('message-3', 'webhook-author', {
					webhookId: 'webhook-1',
					mentions: [{id: 'webhook-mention'}],
				}),
				modelMessage('message-4', 'current-user'),
			],
			'current-user',
		);

		expect(userIds).toEqual([
			'author-1',
			'mention-1',
			'snapshot-mention',
			'referenced-author',
			'referenced-mention',
			'webhook-mention',
		]);
	});
});
