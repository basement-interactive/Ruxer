// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import type {GuildStickerWithUser} from '@fluxer/schema/src/domains/guild/GuildEmojiSchemas';

const logger = new Logger('Stickers');

interface StickerCreateRequest {
	name: string;
	description: string;
	tags: Array<string>;
	image: string;
}

interface StickerUpdateRequest {
	name?: string;
	description?: string;
	tags?: Array<string>;
}

interface StickerCloneRequest {
	sourceStickerId: string;
}

function purgeQuery(purge: boolean): {purge: true} | undefined {
	return purge ? {purge: true} : undefined;
}

export function sanitizeStickerName(fileName: string): string {
	const name =
		fileName
			.split('.')
			.shift()
			?.replace(/[^a-zA-Z0-9_]/g, '') ?? '';
	return name.padEnd(2, '_').slice(0, 30);
}

export async function list(guildId: string): Promise<ReadonlyArray<GuildStickerWithUser>> {
	try {
		const response = await http.get<ReadonlyArray<GuildStickerWithUser>>(Endpoints.GUILD_STICKERS(guildId));
		const stickers = response.body;
		logger.debug(`Retrieved ${stickers.length} stickers for guild ${guildId}`);
		return stickers;
	} catch (error) {
		logger.error(`Failed to list stickers for guild ${guildId}:`, error);
		throw error;
	}
}

export async function create(guildId: string, sticker: StickerCreateRequest): Promise<void> {
	try {
		await http.post(Endpoints.GUILD_STICKERS(guildId), {body: sticker});
		logger.debug(`Created sticker ${sticker.name} in guild ${guildId}`);
	} catch (error) {
		logger.error(`Failed to create sticker ${sticker.name} in guild ${guildId}:`, error);
		throw error;
	}
}

export async function clone(guildId: string, sticker: StickerCloneRequest): Promise<void> {
	try {
		await http.post(Endpoints.GUILD_STICKERS_CLONE(guildId), {
			body: {
				source_sticker_id: sticker.sourceStickerId,
			},
		});
		logger.debug(`Cloned sticker ${sticker.sourceStickerId} into guild ${guildId}`);
	} catch (error) {
		logger.error(`Failed to clone sticker ${sticker.sourceStickerId} into guild ${guildId}:`, error);
		throw error;
	}
}

export async function update(guildId: string, stickerId: string, data: StickerUpdateRequest): Promise<void> {
	try {
		await http.patch(Endpoints.GUILD_STICKER(guildId, stickerId), {body: data});
		logger.debug(`Updated sticker ${stickerId} in guild ${guildId}`);
	} catch (error) {
		logger.error(`Failed to update sticker ${stickerId} in guild ${guildId}:`, error);
		throw error;
	}
}

export async function remove(guildId: string, stickerId: string, purge = false): Promise<void> {
	try {
		await http.delete(Endpoints.GUILD_STICKER(guildId, stickerId), {
			query: purgeQuery(purge),
		});
		logger.debug(`Removed sticker ${stickerId} from guild ${guildId}`);
	} catch (error) {
		logger.error(`Failed to remove sticker ${stickerId} from guild ${guildId}:`, error);
		throw error;
	}
}
