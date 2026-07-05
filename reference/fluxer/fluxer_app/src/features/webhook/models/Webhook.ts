// SPDX-License-Identifier: AGPL-3.0-or-later

import {webhookUrl} from '@app/features/messaging/utils/MessagingUrlUtils';
import type {User} from '@app/features/user/models/User';
import Users from '@app/features/user/state/Users';
import type {UserPartial} from '@fluxer/schema/src/domains/user/UserResponseSchemas';
import type {Webhook as WireWebhook} from '@fluxer/schema/src/domains/webhook/WebhookSchemas';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';

export class Webhook {
	readonly id: string;
	readonly guildId: string;
	readonly channelId: string;
	readonly name: string;
	readonly avatar: string | null;
	readonly token: string;
	readonly creatorId: string;
	readonly createdAt: Date;
	private readonly creatorSnapshot: UserPartial;

	constructor(webhook: WireWebhook) {
		this.id = webhook.id;
		this.guildId = webhook.guild_id;
		this.channelId = webhook.channel_id;
		this.name = webhook.name;
		this.avatar = webhook.avatar ?? null;
		this.token = webhook.token;
		this.creatorId = webhook.user.id;
		this.createdAt = new Date(SnowflakeUtils.extractTimestamp(webhook.id));
		this.creatorSnapshot = webhook.user;
		Users.cacheUsers([webhook.user]);
	}

	get webhookUrl(): string {
		return webhookUrl(this.id, this.token);
	}

	get creator(): User | null {
		return Users.getUser(this.creatorId)!;
	}

	get displayName(): string {
		return this.name;
	}

	withUpdates(updates: Partial<WireWebhook>): Webhook {
		return new Webhook({
			id: updates.id ?? this.id,
			guild_id: updates.guild_id ?? this.guildId,
			channel_id: updates.channel_id ?? this.channelId,
			user: updates.user ?? this.creatorSnapshot,
			name: updates.name ?? this.name,
			avatar: updates.avatar ?? this.avatar,
			token: updates.token ?? this.token,
		});
	}

	toJSON(): WireWebhook {
		const creator = this.creator;
		return {
			id: this.id,
			guild_id: this.guildId,
			channel_id: this.channelId,
			user: creator ? creator.toJSON() : this.creatorSnapshot,
			name: this.name,
			avatar: this.avatar,
			token: this.token,
		};
	}
}
