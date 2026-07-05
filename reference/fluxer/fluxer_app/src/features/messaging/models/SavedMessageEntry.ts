// SPDX-License-Identifier: AGPL-3.0-or-later

import {Message} from '@app/features/messaging/models/MessagingMessage';
import type {Message as WireMessage} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';

export interface SavedMessageEntryWire {
	id: string;
	channel_id: string;
	message_id: string;
	status: SavedMessageStatus;
	message: WireMessage | null;
}

export type SavedMessageStatus = 'available' | 'missing_permissions';

export interface SavedMessageMissingEntry {
	id: string;
	channelId: string;
	messageId: string;
}

export class SavedMessageEntry {
	readonly id: string;
	readonly channelId: string;
	readonly messageId: string;
	readonly status: SavedMessageStatus;
	readonly message: Message | null;

	constructor(data: SavedMessageEntryWire) {
		this.id = data.id;
		this.channelId = data.channel_id;
		this.messageId = data.message_id;
		this.status = data.status;
		this.message = data.message ? new Message(data.message, {missingReactions: 'preserve'}) : null;
	}

	static fromResponse(response: SavedMessageEntryWire): SavedMessageEntry {
		return new SavedMessageEntry(response);
	}

	toMissingEntry(): SavedMessageMissingEntry {
		return {
			id: this.id,
			channelId: this.channelId,
			messageId: this.messageId,
		};
	}
}
