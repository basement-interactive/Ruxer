// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
	GuildEmoji,
	GuildEmojiWithUser,
	GuildSticker,
	GuildStickerWithUser,
} from '@fluxer/schema/src/domains/guild/GuildEmojiSchemas';
import {sortBySnowflakeDesc} from '@fluxer/snowflake/src/SnowflakeUtils';

type EmojiUpdateListener = (emojis: ReadonlyArray<GuildEmojiWithUser>) => void;
type StickerUpdateListener = (stickers: ReadonlyArray<GuildStickerWithUser>) => void;

const MAX_GUILD_EXPRESSION_TAB_CACHE_ENTRIES = 50;

const emojiCache = new Map<string, ReadonlyArray<GuildEmojiWithUser>>();
const stickerCache = new Map<string, ReadonlyArray<GuildStickerWithUser>>();
const emojiAccessSequence = new Set<string>();
const stickerAccessSequence = new Set<string>();
const emojiListeners = new Map<string, Set<EmojiUpdateListener>>();
const stickerListeners = new Map<string, Set<StickerUpdateListener>>();

function freezeList<T>(items: ReadonlyArray<T>): ReadonlyArray<T> {
	return Object.freeze([...items]);
}

function notifyListeners<T>(
	listeners: Map<string, Set<(items: ReadonlyArray<T>) => void>>,
	guildId: string,
	value: ReadonlyArray<T>,
) {
	const listenersForGuild = listeners.get(guildId);
	if (!listenersForGuild) return;
	for (const listener of listenersForGuild) {
		listener(value);
	}
}

function setCache<
	T extends {
		id: string;
	},
>(
	cache: Map<string, ReadonlyArray<T>>,
	accessSequence: Set<string>,
	listeners: Map<string, Set<(items: ReadonlyArray<T>) => void>>,
	guildId: string,
	value: ReadonlyArray<T>,
	shouldNotify: boolean,
) {
	const frozen = freezeList(sortBySnowflakeDesc(value));
	cache.set(guildId, frozen);
	accessSequence.delete(guildId);
	accessSequence.add(guildId);
	evictCacheIfNeeded(cache, accessSequence);
	if (shouldNotify) {
		notifyListeners(listeners, guildId, frozen);
	}
}

function evictCacheIfNeeded<T>(cache: Map<string, T>, accessSequence: Set<string>) {
	for (const guildId of accessSequence) {
		if (!cache.has(guildId)) {
			accessSequence.delete(guildId);
		}
	}
	while (cache.size > MAX_GUILD_EXPRESSION_TAB_CACHE_ENTRIES) {
		const guildId = accessSequence.values().next().value;
		if (guildId == null) {
			break;
		}
		cache.delete(guildId);
		accessSequence.delete(guildId);
	}
}

export function seedGuildEmojiCache(guildId: string, emojis: ReadonlyArray<GuildEmojiWithUser>): void {
	setCache(emojiCache, emojiAccessSequence, emojiListeners, guildId, emojis, false);
}

export function seedGuildStickerCache(guildId: string, stickers: ReadonlyArray<GuildStickerWithUser>): void {
	setCache(stickerCache, stickerAccessSequence, stickerListeners, guildId, stickers, false);
}

export function subscribeToGuildEmojiUpdates(guildId: string, listener: EmojiUpdateListener): () => void {
	let listenersForGuild = emojiListeners.get(guildId);
	if (!listenersForGuild) {
		listenersForGuild = new Set();
		emojiListeners.set(guildId, listenersForGuild);
	}
	listenersForGuild.add(listener);
	return () => {
		listenersForGuild?.delete(listener);
		if (listenersForGuild && listenersForGuild.size === 0) {
			emojiListeners.delete(guildId);
		}
	};
}

export function subscribeToGuildStickerUpdates(guildId: string, listener: StickerUpdateListener): () => void {
	let listenersForGuild = stickerListeners.get(guildId);
	if (!listenersForGuild) {
		listenersForGuild = new Set();
		stickerListeners.set(guildId, listenersForGuild);
	}
	listenersForGuild.add(listener);
	return () => {
		listenersForGuild?.delete(listener);
		if (listenersForGuild && listenersForGuild.size === 0) {
			stickerListeners.delete(guildId);
		}
	};
}

export function patchGuildEmojiCacheFromGateway(guildId: string, updates: ReadonlyArray<GuildEmoji>) {
	const previous = emojiCache.get(guildId) ?? [];
	const previousUserById = new Map(previous.map((emoji) => [emoji.id, emoji.user]));
	const next = updates
		.map((emoji) => {
			const user = emoji.user ?? previousUserById.get(emoji.id);
			if (!user) {
				return null;
			}
			return {
				...emoji,
				user,
			};
		})
		.filter((entry): entry is GuildEmojiWithUser => Boolean(entry));
	setCache(emojiCache, emojiAccessSequence, emojiListeners, guildId, next, true);
}

export function patchGuildStickerCacheFromGateway(guildId: string, updates: ReadonlyArray<GuildSticker>) {
	const previous = stickerCache.get(guildId) ?? [];
	const previousUserById = new Map(previous.map((sticker) => [sticker.id, sticker.user]));
	const next = updates
		.map((sticker) => {
			const user = sticker.user ?? previousUserById.get(sticker.id);
			if (!user) {
				return null;
			}
			return {
				...sticker,
				user,
			};
		})
		.filter((entry): entry is GuildStickerWithUser => Boolean(entry));
	setCache(stickerCache, stickerAccessSequence, stickerListeners, guildId, next, true);
}
