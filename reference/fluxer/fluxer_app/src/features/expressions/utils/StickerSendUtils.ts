// SPDX-License-Identifier: AGPL-3.0-or-later

import * as ChannelStickerCommands from '@app/features/channel/commands/ChannelStickerCommands';
import type {GuildSticker} from '@app/features/expressions/models/GuildSticker';
import Drafts from '@app/features/messaging/state/MessagingDrafts';
import {CloudUpload} from '@app/features/messaging/upload/CloudUpload';

export function shouldSetPendingSticker(channelId: string): boolean {
	const draft = Drafts.getDraft(channelId);
	const hasTextContent = draft && draft.trim().length > 0;
	const hasAttachments = CloudUpload.getTextareaAttachments(channelId).length > 0;
	return hasTextContent || hasAttachments;
}

export function setPendingSticker(channelId: string, sticker: GuildSticker): void {
	ChannelStickerCommands.setPendingSticker(channelId, sticker);
}
