// SPDX-License-Identifier: AGPL-3.0-or-later

import EmojiPicker from '@app/features/emoji/state/EmojiPicker';
import type {UsageRanking} from '@app/features/emoji/state/UsageFrecency';
import type {FlatEmoji, UnicodeEmoji} from '@app/features/emoji/types/EmojiTypes';
import UnicodeEmojis from '@app/features/expressions/utils/UnicodeEmojis';
import GuildList from '@app/features/guild/state/GuildList';
import SelectedGuild from '@app/features/navigation/state/SelectedGuild';
import {useMemo, useRef} from 'react';

export function useEmojiCategories(
	allEmojis: ReadonlyArray<FlatEmoji | UnicodeEmoji>,
	_searchResultEmojis: ReadonlyArray<FlatEmoji | UnicodeEmoji>,
) {
	const guilds = GuildList.guilds;
	const selectedGuildId = SelectedGuild.selectedGuildId;
	const favoriteEmojis = EmojiPicker.getFavoriteEmojis(allEmojis);
	const pinnedRankingRef = useRef<UsageRanking | null>(null);
	pinnedRankingRef.current ??= EmojiPicker.getRanking();
	const pinnedRanking = pinnedRankingRef.current;
	const frequentlyUsedEmojis = useMemo(
		() => EmojiPicker.getFrecentEmojis(allEmojis, 42, pinnedRanking),
		[allEmojis, pinnedRanking],
	);
	const customEmojisByGuildId = useMemo(() => {
		const guildEmojis = allEmojis.filter((emoji) => emoji.guildId != null);
		const guildEmojisByGuildId = new Map<string, Array<FlatEmoji>>();
		for (const guildEmoji of guildEmojis) {
			if (!guildEmojisByGuildId.has(guildEmoji.guildId!)) {
				guildEmojisByGuildId.set(guildEmoji.guildId!, []);
			}
			guildEmojisByGuildId.get(guildEmoji.guildId!)?.push(guildEmoji);
		}
		const sortedGuildIds = guilds.map((guild) => guild.id);
		if (selectedGuildId) {
			const index = sortedGuildIds.indexOf(selectedGuildId);
			if (index > 0) {
				sortedGuildIds.splice(index, 1);
				sortedGuildIds.unshift(selectedGuildId);
			}
		}
		const sortedGuildEmojisByGuildId = new Map<string, Array<FlatEmoji>>();
		for (const guildId of sortedGuildIds) {
			if (guildEmojisByGuildId.has(guildId)) {
				sortedGuildEmojisByGuildId.set(guildId, guildEmojisByGuildId.get(guildId)!);
			}
		}
		return sortedGuildEmojisByGuildId;
	}, [allEmojis, guilds, selectedGuildId]);
	const unicodeEmojisByCategory = useMemo(() => {
		const unicodeEmojis = allEmojis.filter((emoji) => emoji.guildId == null);
		const unicodeEmojisByCategory = new Map<string, Array<FlatEmoji>>();
		for (const emoji of unicodeEmojis) {
			const category = UnicodeEmojis.getCategoryForEmoji(emoji as UnicodeEmoji)!;
			if (!unicodeEmojisByCategory.has(category)) {
				unicodeEmojisByCategory.set(category, []);
			}
			unicodeEmojisByCategory.get(category)?.push(emoji);
		}
		const categories = UnicodeEmojis.getCategories();
		const sortedUnicodeEmojisByCategory = new Map<string, Array<FlatEmoji>>();
		for (const category of categories) {
			if (unicodeEmojisByCategory.has(category)) {
				sortedUnicodeEmojisByCategory.set(
					category,
					unicodeEmojisByCategory.get(category)!.sort((a, b) => a.index! - b.index!),
				);
			}
		}
		return sortedUnicodeEmojisByCategory;
	}, [allEmojis]);
	return {
		favoriteEmojis,
		frequentlyUsedEmojis,
		customEmojisByGuildId,
		unicodeEmojisByCategory,
	};
}
