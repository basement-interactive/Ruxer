// SPDX-License-Identifier: AGPL-3.0-or-later

import {EMOJIS_PER_ROW} from '@app/features/channel/components/emoji_picker/EmojiPickerConstants';
import type {VirtualRow} from '@app/features/channel/components/emoji_picker/VirtualRow';
import EmojiPicker from '@app/features/emoji/state/EmojiPicker';
import type {FlatEmoji} from '@app/features/emoji/types/EmojiTypes';
import UnicodeEmojis from '@app/features/expressions/utils/UnicodeEmojis';
import Guilds from '@app/features/guild/state/Guilds';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {useMemo} from 'react';

const FAVORITED_DESCRIPTOR = msg({
	message: 'Favorited',
	comment: 'Short label in the use virtual rows hook. Keep it concise.',
});
const FREQUENTLY_USED_DESCRIPTOR = msg({
	message: 'Frequently used',
	comment: 'Short label in the use virtual rows hook. Keep it concise.',
});

export function useVirtualRows(
	searchTerm: string,
	renderedEmojis: Array<FlatEmoji>,
	favoriteEmojis: Array<FlatEmoji>,
	frequentlyUsedEmojis: Array<FlatEmoji>,
	customEmojisByGuildId: Map<string, Array<FlatEmoji>>,
	unicodeEmojisByCategory: Map<string, Array<FlatEmoji>>,
	emojisPerRow: number = EMOJIS_PER_ROW,
) {
	const {i18n} = useLingui();
	const collapsedCategories = EmojiPicker.collapsedCategories;
	return useMemo(() => {
		const rows: Array<VirtualRow> = [];
		let currentIndex = 0;
		if (searchTerm) {
			for (let i = 0; i < renderedEmojis.length; i += emojisPerRow) {
				rows.push({
					type: 'emoji-row',
					emojis: renderedEmojis.slice(i, i + emojisPerRow),
					index: currentIndex++,
				});
			}
		} else {
			if (favoriteEmojis.length > 0) {
				const isFavoritesCollapsed = EmojiPicker.isCategoryCollapsed('favorites');
				rows.push({
					type: 'header',
					category: 'favorites',
					name: i18n._(FAVORITED_DESCRIPTOR),
					index: currentIndex++,
				});
				if (!isFavoritesCollapsed) {
					for (let i = 0; i < favoriteEmojis.length; i += emojisPerRow) {
						rows.push({
							type: 'emoji-row',
							emojis: favoriteEmojis.slice(i, i + emojisPerRow),
							index: currentIndex++,
						});
					}
				}
			}
			if (frequentlyUsedEmojis.length > 0) {
				const isFrequentlyUsedCollapsed = EmojiPicker.isCategoryCollapsed('frequently-used');
				rows.push({
					type: 'header',
					category: 'frequently-used',
					name: i18n._(FREQUENTLY_USED_DESCRIPTOR),
					index: currentIndex++,
				});
				if (!isFrequentlyUsedCollapsed) {
					for (let i = 0; i < frequentlyUsedEmojis.length; i += emojisPerRow) {
						rows.push({
							type: 'emoji-row',
							emojis: frequentlyUsedEmojis.slice(i, i + emojisPerRow),
							index: currentIndex++,
						});
					}
				}
			}
			for (const [guildId, emojis] of customEmojisByGuildId.entries()) {
				const guild = Guilds.getGuild(guildId)!;
				const isGuildCollapsed = EmojiPicker.isCategoryCollapsed(guildId);
				rows.push({
					type: 'header',
					category: guildId,
					name: guild.name,
					guildId,
					index: currentIndex++,
				});
				if (!isGuildCollapsed) {
					for (let i = 0; i < emojis.length; i += emojisPerRow) {
						rows.push({
							type: 'emoji-row',
							emojis: emojis.slice(i, i + emojisPerRow),
							index: currentIndex++,
							isCustomEmoji: true,
							guildId,
						});
					}
				}
			}
			for (const [category, emojis] of unicodeEmojisByCategory.entries()) {
				const isCategoryCollapsed = EmojiPicker.isCategoryCollapsed(category);
				rows.push({
					type: 'header',
					category,
					name: UnicodeEmojis.getCategoryLabel(category, i18n),
					index: currentIndex++,
				});
				if (!isCategoryCollapsed) {
					for (let i = 0; i < emojis.length; i += emojisPerRow) {
						rows.push({
							type: 'emoji-row',
							emojis: emojis.slice(i, i + emojisPerRow),
							index: currentIndex++,
						});
					}
				}
			}
		}
		return rows;
	}, [
		searchTerm,
		renderedEmojis,
		favoriteEmojis,
		frequentlyUsedEmojis,
		customEmojisByGuildId,
		unicodeEmojisByCategory,
		emojisPerRow,
		collapsedCategories,
		i18n.locale,
	]);
}
