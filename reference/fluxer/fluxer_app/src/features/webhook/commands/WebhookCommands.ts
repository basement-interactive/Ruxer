// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import Webhooks from '@app/features/webhook/state/Webhooks';
import type {Webhook} from '@fluxer/schema/src/domains/webhook/WebhookSchemas';

const logger = new Logger('WebhookCommands');

export interface CreateWebhookParams {
	channelId: string;
	name: string;
	avatar?: string | null;
}

export interface UpdateWebhookParams {
	webhookId: string;
	name?: string;
	avatar?: string | null;
}

interface MoveWebhookRequest {
	channel_id: string;
}

interface WebhookPatchRequest {
	name?: string;
	avatar: string | null;
}

function createWebhookRequest({name, avatar}: CreateWebhookParams): WebhookPatchRequest {
	return {name, avatar: avatar ?? null};
}

function moveWebhookRequest(newChannelId: string): MoveWebhookRequest {
	return {channel_id: newChannelId};
}

function updateWebhookRequest({name, avatar}: UpdateWebhookParams): WebhookPatchRequest {
	return {name, avatar: avatar ?? null};
}

function applyWebhookFetchSuccess(guildId: string, data: Array<Webhook>, channelId?: string): void {
	if (channelId) {
		Webhooks.handleChannelWebhooksFetchSuccess(channelId, guildId, data);
		return;
	}
	Webhooks.handleGuildWebhooksFetchSuccess(guildId, data);
}

export async function fetchGuildWebhooks(guildId: string): Promise<Array<Webhook>> {
	Webhooks.handleGuildWebhooksFetchPending(guildId);
	try {
		const response = await http.get<Array<Webhook>>(Endpoints.GUILD_WEBHOOKS(guildId));
		const data = response.body;
		applyWebhookFetchSuccess(guildId, data);
		return data;
	} catch (error) {
		logger.error(`Failed to fetch webhooks for guild ${guildId}:`, error);
		Webhooks.handleGuildWebhooksFetchError(guildId);
		throw error;
	}
}

export async function fetchChannelWebhooks({
	guildId,
	channelId,
}: {
	guildId: string;
	channelId: string;
}): Promise<Array<Webhook>> {
	Webhooks.handleChannelWebhooksFetchPending(channelId);
	try {
		const response = await http.get<Array<Webhook>>(Endpoints.CHANNEL_WEBHOOKS(channelId));
		const data = response.body;
		applyWebhookFetchSuccess(guildId, data, channelId);
		return data;
	} catch (error) {
		logger.error(`Failed to fetch webhooks for channel ${channelId}:`, error);
		Webhooks.handleChannelWebhooksFetchError(channelId);
		throw error;
	}
}

export async function createWebhook({channelId, name, avatar}: CreateWebhookParams): Promise<Webhook> {
	try {
		const response = await http.post<Webhook>(Endpoints.CHANNEL_WEBHOOKS(channelId), {
			body: createWebhookRequest({channelId, name, avatar}),
		});
		const data = response.body;
		Webhooks.handleWebhookCreate(data);
		return data;
	} catch (error) {
		logger.error(`Failed to create webhook for channel ${channelId}:`, error);
		throw error;
	}
}

export async function deleteWebhook(webhookId: string): Promise<void> {
	const existing = Webhooks.getWebhook(webhookId);
	try {
		await http.delete(Endpoints.WEBHOOK(webhookId));
		Webhooks.handleWebhookDelete(webhookId, existing?.channelId ?? null, existing?.guildId ?? null);
	} catch (error) {
		logger.error(`Failed to delete webhook ${webhookId}:`, error);
		throw error;
	}
}

export async function moveWebhook(webhookId: string, newChannelId: string): Promise<Webhook> {
	const existing = Webhooks.getWebhook(webhookId);
	if (!existing) {
		throw new Error(`Webhook ${webhookId} not found`);
	}
	try {
		const response = await http.patch<Webhook>(Endpoints.WEBHOOK(webhookId), {
			body: moveWebhookRequest(newChannelId),
		});
		const data = response.body;
		Webhooks.handleWebhooksUpdate(existing.guildId, existing.channelId);
		Webhooks.handleWebhookCreate(data);
		return data;
	} catch (error) {
		logger.error(`Failed to move webhook ${webhookId} to channel ${newChannelId}:`, error);
		throw error;
	}
}

const updateWebhook = async ({webhookId, name, avatar}: UpdateWebhookParams): Promise<Webhook> => {
	try {
		const response = await http.patch<Webhook>(Endpoints.WEBHOOK(webhookId), {
			body: updateWebhookRequest({webhookId, name, avatar}),
		});
		const data = response.body;
		Webhooks.handleWebhookCreate(data);
		return data;
	} catch (error) {
		logger.error(`Failed to update webhook ${webhookId}:`, error);
		throw error;
	}
};

export async function updateWebhooks(updates: Array<UpdateWebhookParams>): Promise<Array<Webhook>> {
	const results: Array<Webhook> = [];
	for (const update of updates) {
		try {
			const result = await updateWebhook(update);
			results.push(result);
		} catch (error) {
			logger.error(`Failed to update webhook ${update.webhookId}:`, error);
		}
	}
	return results;
}
