// SPDX-License-Identifier: AGPL-3.0-or-later

import {EmbedMediaFlags, MessageAttachmentFlags} from '@fluxer/constants/src/ChannelConstants';

const ALWAYS_ANIMATED_CONTENT_TYPES = new Set(['image/gif', 'image/apng']);

export function isAnimatedAttachment(params: {contentType: string; flags?: number | null}): boolean {
	if (ALWAYS_ANIMATED_CONTENT_TYPES.has(params.contentType)) return true;
	return ((params.flags ?? 0) & MessageAttachmentFlags.IS_ANIMATED) !== 0;
}

export function isAnimatedEmbedMedia(params: {contentType?: string | null; flags?: number | null}): boolean {
	if (params.contentType && ALWAYS_ANIMATED_CONTENT_TYPES.has(params.contentType)) return true;
	return ((params.flags ?? 0) & EmbedMediaFlags.IS_ANIMATED) !== 0;
}
