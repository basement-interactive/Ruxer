// SPDX-License-Identifier: AGPL-3.0-or-later

import StickerPicker from '@app/features/emoji/state/StickerPicker';
import type {GuildSticker} from '@app/features/expressions/models/GuildSticker';

type StickerKeyInput = Readonly<Pick<GuildSticker, 'guildId' | 'id'>>;
type StickerPickerIntent =
	| {kind: 'track'; sticker: StickerKeyInput}
	| {kind: 'favorite'; sticker: StickerKeyInput}
	| {kind: 'category'; category: string};

function getStickerKey(sticker: StickerKeyInput): string {
	return `${sticker.guildId}:${sticker.id}`;
}

function dispatchStickerPickerIntent(intent: StickerPickerIntent): void {
	switch (intent.kind) {
		case 'track':
			StickerPicker.trackStickerUsage(getStickerKey(intent.sticker));
			return;
		case 'favorite':
			StickerPicker.toggleFavorite(getStickerKey(intent.sticker));
			return;
		case 'category':
			StickerPicker.toggleCategory(intent.category);
			return;
	}
}

export function trackStickerUsage(sticker: StickerKeyInput): void {
	dispatchStickerPickerIntent({kind: 'track', sticker});
}

export function toggleFavorite(sticker: StickerKeyInput): void {
	dispatchStickerPickerIntent({kind: 'favorite', sticker});
}

export function toggleCategory(category: string): void {
	dispatchStickerPickerIntent({kind: 'category', category});
}
