// SPDX-License-Identifier: AGPL-3.0-or-later

import ChannelSticker from '@app/features/channel/state/ChannelSticker';
import type {GuildSticker} from '@app/features/expressions/models/GuildSticker';

type PendingStickerIntent =
	| {kind: 'set'; channelId: string; sticker: GuildSticker}
	| {kind: 'remove'; channelId: string};

function applyPendingStickerIntent(intent: PendingStickerIntent): void {
	if (intent.kind === 'set') {
		ChannelSticker.setPendingSticker(intent.channelId, intent.sticker);
		return;
	}
	ChannelSticker.removePendingSticker(intent.channelId);
}

export function setPendingSticker(channelId: string, sticker: GuildSticker): void {
	applyPendingStickerIntent({kind: 'set', channelId, sticker});
}

export function removePendingSticker(channelId: string): void {
	applyPendingStickerIntent({kind: 'remove', channelId});
}
