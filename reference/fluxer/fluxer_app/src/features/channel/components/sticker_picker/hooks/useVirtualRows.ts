// SPDX-License-Identifier: AGPL-3.0-or-later

import StickerPicker from '@app/features/emoji/state/StickerPicker';
import type {GuildSticker} from '@app/features/expressions/models/GuildSticker';
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

export type VirtualRow =
	| {
			type: 'header';
			category: string;
			name: string;
			guildId?: string;
			index: number;
	  }
	| {
			type: 'sticker-row';
			stickers: Array<GuildSticker>;
			index: number;
			guildId?: string;
	  };

export const useVirtualRows = (
	searchTerm: string,
	renderedStickers: ReadonlyArray<GuildSticker>,
	favoriteStickers: ReadonlyArray<GuildSticker>,
	frequentlyUsedStickers: ReadonlyArray<GuildSticker>,
	stickersByGuildId: ReadonlyMap<string, ReadonlyArray<GuildSticker>>,
	stickersPerRow: number = 4,
) => {
	const {i18n} = useLingui();
	const collapsedCategories = StickerPicker.collapsedCategories;
	return useMemo(() => {
		const rows: Array<VirtualRow> = [];
		let currentIndex = 0;
		if (searchTerm) {
			for (let i = 0; i < renderedStickers.length; i += stickersPerRow) {
				rows.push({
					type: 'sticker-row',
					stickers: renderedStickers.slice(i, i + stickersPerRow),
					index: currentIndex++,
				});
			}
		} else {
			if (favoriteStickers.length > 0) {
				const isFavoritesCollapsed = StickerPicker.isCategoryCollapsed('favorites');
				rows.push({
					type: 'header',
					category: 'favorites',
					name: i18n._(FAVORITED_DESCRIPTOR),
					index: currentIndex++,
				});
				if (!isFavoritesCollapsed) {
					for (let i = 0; i < favoriteStickers.length; i += stickersPerRow) {
						rows.push({
							type: 'sticker-row',
							stickers: favoriteStickers.slice(i, i + stickersPerRow),
							index: currentIndex++,
						});
					}
				}
			}
			if (frequentlyUsedStickers.length > 0) {
				const isFrequentlyUsedCollapsed = StickerPicker.isCategoryCollapsed('frequently-used');
				rows.push({
					type: 'header',
					category: 'frequently-used',
					name: i18n._(FREQUENTLY_USED_DESCRIPTOR),
					index: currentIndex++,
				});
				if (!isFrequentlyUsedCollapsed) {
					for (let i = 0; i < frequentlyUsedStickers.length; i += stickersPerRow) {
						rows.push({
							type: 'sticker-row',
							stickers: frequentlyUsedStickers.slice(i, i + stickersPerRow),
							index: currentIndex++,
						});
					}
				}
			}
			for (const [guildId, stickers] of stickersByGuildId.entries()) {
				const guild = Guilds.getGuild(guildId)!;
				const isGuildCollapsed = StickerPicker.isCategoryCollapsed(guildId);
				rows.push({
					type: 'header',
					category: guildId,
					name: guild.name,
					guildId,
					index: currentIndex++,
				});
				if (!isGuildCollapsed) {
					for (let i = 0; i < stickers.length; i += stickersPerRow) {
						rows.push({
							type: 'sticker-row',
							stickers: stickers.slice(i, i + stickersPerRow),
							index: currentIndex++,
							guildId,
						});
					}
				}
			}
		}
		return rows;
	}, [
		searchTerm,
		renderedStickers,
		favoriteStickers,
		frequentlyUsedStickers,
		stickersByGuildId,
		stickersPerRow,
		collapsedCategories,
		i18n.locale,
	]);
};
