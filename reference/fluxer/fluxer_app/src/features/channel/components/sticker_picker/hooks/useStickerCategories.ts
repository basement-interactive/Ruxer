// SPDX-License-Identifier: AGPL-3.0-or-later

import StickerPicker from '@app/features/emoji/state/StickerPicker';
import type {GuildSticker} from '@app/features/expressions/models/GuildSticker';
import GuildList from '@app/features/guild/state/GuildList';
import SelectedGuild from '@app/features/navigation/state/SelectedGuild';
import {useMemo} from 'react';

export function useStickerCategories(
	allStickers: ReadonlyArray<GuildSticker>,
	_renderedStickers: ReadonlyArray<GuildSticker>,
) {
	const guilds = GuildList.guilds;
	const selectedGuildId = SelectedGuild.selectedGuildId;
	const stickerPickerState = StickerPicker;
	const favoriteStickers = useMemo(() => {
		return StickerPicker.getFavoriteStickers(allStickers);
	}, [allStickers, stickerPickerState.favoriteStickers]);
	const frequentlyUsedStickers = useMemo(() => {
		return StickerPicker.getFrecentStickers(allStickers, 42);
	}, [allStickers, stickerPickerState.stickerUsage]);
	const stickersByGuildId = useMemo(() => {
		const guildStickersMap = new Map<string, Array<GuildSticker>>();
		for (const sticker of allStickers) {
			if (!guildStickersMap.has(sticker.guildId)) {
				guildStickersMap.set(sticker.guildId, []);
			}
			guildStickersMap.get(sticker.guildId)?.push(sticker);
		}
		const sortedGuildIds = guilds.map((guild) => guild.id);
		if (selectedGuildId) {
			const index = sortedGuildIds.indexOf(selectedGuildId);
			if (index > 0) {
				sortedGuildIds.splice(index, 1);
				sortedGuildIds.unshift(selectedGuildId);
			}
		}
		const sortedGuildStickersMap = new Map<string, ReadonlyArray<GuildSticker>>();
		for (const guildId of sortedGuildIds) {
			if (guildStickersMap.has(guildId)) {
				sortedGuildStickersMap.set(guildId, guildStickersMap.get(guildId)!);
			}
		}
		return sortedGuildStickersMap;
	}, [allStickers, guilds, selectedGuildId]);
	return {
		favoriteStickers,
		frequentlyUsedStickers,
		stickersByGuildId,
	};
}
