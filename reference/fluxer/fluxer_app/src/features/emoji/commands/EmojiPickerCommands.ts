// SPDX-License-Identifier: AGPL-3.0-or-later

import EmojiPicker, {getEmojiUsageKey} from '@app/features/emoji/state/EmojiPicker';
import type {FlatEmoji} from '@app/features/emoji/types/EmojiTypes';

type EmojiPickerIntent =
	| {kind: 'track'; emoji: FlatEmoji}
	| {kind: 'favorite'; emoji: FlatEmoji}
	| {kind: 'category'; category: string};

function dispatchEmojiPickerIntent(intent: EmojiPickerIntent): void {
	switch (intent.kind) {
		case 'track':
			EmojiPicker.trackEmojiUsage(getEmojiUsageKey(intent.emoji));
			return;
		case 'favorite':
			EmojiPicker.toggleFavorite(getEmojiUsageKey(intent.emoji));
			return;
		case 'category':
			EmojiPicker.toggleCategory(intent.category);
			return;
	}
}

export function trackEmojiUsage(emoji: FlatEmoji): void {
	dispatchEmojiPickerIntent({kind: 'track', emoji});
}

export function toggleFavorite(emoji: FlatEmoji): void {
	dispatchEmojiPickerIntent({kind: 'favorite', emoji});
}

export function toggleCategory(category: string): void {
	dispatchEmojiPickerIntent({kind: 'category', category});
}
