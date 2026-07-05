// SPDX-License-Identifier: AGPL-3.0-or-later

import ChannelSticker from '@app/features/channel/state/ChannelSticker';
import Slowmode from '@app/features/slowmode/state/Slowmode';

function clearSendScopedSticker(channelId: string): void {
	ChannelSticker.clearPendingStickerOnMessageSend(channelId);
}

function markSlowmodeSend(channelId: string): void {
	Slowmode.recordMessageSend(channelId);
}

export function prepareMessageSend(channelId: string): void {
	clearSendScopedSticker(channelId);
}

export function recordMessageSend(channelId: string): void {
	markSlowmodeSend(channelId);
}

export function updateSlowmodeRemaining(channelId: string, retryAfterMs: number): void {
	Slowmode.updateSlowmodeRemaining(channelId, retryAfterMs);
}

export function retryAfterSecondsToMs(retryAfterSeconds: number | undefined): number {
	if (retryAfterSeconds == null || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
		return 0;
	}
	return Math.ceil(retryAfterSeconds * 1000);
}
