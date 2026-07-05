// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import type {GuildEmojiWithUser} from '@fluxer/schema/src/domains/guild/GuildEmojiSchemas';

const logger = new Logger('Emojis');

interface EmojiUploadRequest {
	name: string;
	image: string;
}

interface EmojiUploadResult {
	success: Array<GuildEmojiWithUser>;
	failed: Array<{
		name: string;
		error: string;
	}>;
}

interface EmojiUpdateRequest {
	name: string;
}

interface EmojiCloneRequest {
	sourceEmojiId: string;
}

function emojiBulkEndpoint(guildId: string): string {
	return `${Endpoints.GUILD_EMOJIS(guildId)}/bulk`;
}

function purgeQuery(purge: boolean): {purge: true} | undefined {
	return purge ? {purge: true} : undefined;
}

export function sanitizeEmojiName(fileName: string): string {
	const name =
		fileName
			.split('.')
			.shift()
			?.replace(/[^a-zA-Z0-9_]/g, '') ?? '';
	return name.padEnd(2, '_').slice(0, 32);
}

export async function list(guildId: string): Promise<ReadonlyArray<GuildEmojiWithUser>> {
	try {
		const response = await http.get<ReadonlyArray<GuildEmojiWithUser>>(Endpoints.GUILD_EMOJIS(guildId));
		const emojis = response.body;
		logger.debug(`Retrieved ${emojis.length} emojis for guild ${guildId}`);
		return emojis;
	} catch (error) {
		logger.error(`Failed to list emojis for guild ${guildId}:`, error);
		throw error;
	}
}

export async function bulkUpload(
	guildId: string,
	emojis: Array<EmojiUploadRequest>,
	signal?: AbortSignal,
): Promise<EmojiUploadResult> {
	try {
		const response = await http.post<EmojiUploadResult>(emojiBulkEndpoint(guildId), {
			body: {emojis},
			signal,
		});
		const result = response.body;
		logger.debug(`Bulk uploaded ${result.success.length} emojis to guild ${guildId}, ${result.failed.length} failed`);
		return result;
	} catch (error) {
		logger.error(`Failed to bulk upload emojis to guild ${guildId}:`, error);
		throw error;
	}
}

export async function clone(guildId: string, emoji: EmojiCloneRequest): Promise<void> {
	try {
		await http.post(Endpoints.GUILD_EMOJIS_CLONE(guildId), {
			body: {
				source_emoji_id: emoji.sourceEmojiId,
			},
		});
		logger.debug(`Cloned emoji ${emoji.sourceEmojiId} into guild ${guildId}`);
	} catch (error) {
		logger.error(`Failed to clone emoji ${emoji.sourceEmojiId} into guild ${guildId}:`, error);
		throw error;
	}
}

export async function update(guildId: string, emojiId: string, data: EmojiUpdateRequest): Promise<void> {
	try {
		await http.patch(Endpoints.GUILD_EMOJI(guildId, emojiId), {body: data});
		logger.debug(`Updated emoji ${emojiId} in guild ${guildId}`);
	} catch (error) {
		logger.error(`Failed to update emoji ${emojiId} in guild ${guildId}:`, error);
		throw error;
	}
}

export async function remove(guildId: string, emojiId: string, purge = false): Promise<void> {
	try {
		await http.delete(Endpoints.GUILD_EMOJI(guildId, emojiId), {
			query: purgeQuery(purge),
		});
		logger.debug(`Removed emoji ${emojiId} from guild ${guildId}`);
	} catch (error) {
		logger.error(`Failed to remove emoji ${emojiId} from guild ${guildId}:`, error);
		throw error;
	}
}
