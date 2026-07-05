// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message as WireMessage} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';

interface MessageModelMemberLoadInput {
	readonly id: string;
	readonly author: {readonly id: string};
	readonly webhookId?: string | null;
	readonly mentions: ReadonlyArray<{readonly id: string}>;
	readonly messageSnapshots?: ReadonlyArray<{mentions?: ReadonlyArray<string>}> | null;
	readonly referencedMessage?: MessageModelMemberLoadInput | null;
}

function addUserId(userIds: Set<string>, userId: string | null | undefined): void {
	if (!userId) {
		return;
	}
	userIds.add(userId);
}

function addAuthorUserId(
	userIds: Set<string>,
	userId: string | null | undefined,
	currentUserId: string | null | undefined,
): void {
	if (!userId || userId === currentUserId) {
		return;
	}
	userIds.add(userId);
}

function addSnapshotMentionUserIds(
	userIds: Set<string>,
	snapshots: ReadonlyArray<{mentions?: ReadonlyArray<string>}> | null | undefined,
): void {
	if (!snapshots) {
		return;
	}
	for (const snapshot of snapshots) {
		for (const userId of snapshot.mentions ?? []) {
			addUserId(userIds, userId);
		}
	}
}

function addWireMessageMemberUserIds(
	userIds: Set<string>,
	message: WireMessage,
	currentUserId: string | null | undefined,
	visitedMessageIds: Set<string>,
): void {
	if (visitedMessageIds.has(message.id)) {
		return;
	}
	visitedMessageIds.add(message.id);
	if (!message.webhook_id) {
		addAuthorUserId(userIds, message.author.id, currentUserId);
	}
	for (const mention of message.mentions ?? []) {
		addUserId(userIds, mention.id);
	}
	addSnapshotMentionUserIds(userIds, message.message_snapshots);
	if (message.referenced_message) {
		addWireMessageMemberUserIds(userIds, message.referenced_message, currentUserId, visitedMessageIds);
	}
}

function addMessageModelMemberUserIds(
	userIds: Set<string>,
	message: MessageModelMemberLoadInput,
	currentUserId: string | null | undefined,
	visitedMessageIds: Set<string>,
): void {
	if (visitedMessageIds.has(message.id)) {
		return;
	}
	visitedMessageIds.add(message.id);
	if (!message.webhookId) {
		addAuthorUserId(userIds, message.author.id, currentUserId);
	}
	for (const mention of message.mentions) {
		addUserId(userIds, mention.id);
	}
	addSnapshotMentionUserIds(userIds, message.messageSnapshots);
	if (message.referencedMessage) {
		addMessageModelMemberUserIds(userIds, message.referencedMessage, currentUserId, visitedMessageIds);
	}
}

export function collectWireMessageGuildMemberUserIds(
	messages: ReadonlyArray<WireMessage>,
	currentUserId: string | null | undefined,
): Array<string> {
	const userIds = new Set<string>();
	const visitedMessageIds = new Set<string>();
	for (const message of messages) {
		addWireMessageMemberUserIds(userIds, message, currentUserId, visitedMessageIds);
	}
	return Array.from(userIds);
}

export function collectMessageModelGuildMemberUserIds(
	messages: ReadonlyArray<MessageModelMemberLoadInput>,
	currentUserId: string | null | undefined,
): Array<string> {
	const userIds = new Set<string>();
	const visitedMessageIds = new Set<string>();
	for (const message of messages) {
		addMessageModelMemberUserIds(userIds, message, currentUserId, visitedMessageIds);
	}
	return Array.from(userIds);
}
