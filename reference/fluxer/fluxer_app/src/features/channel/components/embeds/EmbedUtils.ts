// SPDX-License-Identifier: AGPL-3.0-or-later

import i18n from '@app/app/I18n';
import * as FavoriteMemeUtils from '@app/features/expressions/utils/FavoriteMemeUtils';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import type {I18n} from '@lingui/core';

export function deriveDefaultNameFromMessage({
	message,
	attachmentId,
	embedIndex,
	url,
	proxyUrl,
	i18nInstance = i18n,
}: {
	message: Message | undefined;
	attachmentId: string | undefined;
	embedIndex?: number | undefined;
	url: string;
	proxyUrl: string;
	i18nInstance?: I18n;
}): string {
	if (message && attachmentId) {
		const attachment = message.attachments.find((a) => a.id === attachmentId);
		if (attachment) {
			return FavoriteMemeUtils.deriveDefaultNameFromAttachment(i18nInstance, attachment);
		}
	}
	if (message && embedIndex !== undefined) {
		const embed = message.embeds[embedIndex];
		if (embed) {
			return FavoriteMemeUtils.deriveDefaultNameFromEmbedMedia(
				i18nInstance,
				{url, proxy_url: proxyUrl, flags: 0},
				embed,
			);
		}
	}
	return FavoriteMemeUtils.deriveDefaultNameFromEmbedMedia(i18nInstance, {url, proxy_url: proxyUrl, flags: 0});
}

export const splitFilename = (
	filename: string,
): {
	name: string;
	extension: string;
} => {
	const lastDotIndex = filename.lastIndexOf('.');
	if (lastDotIndex === -1) {
		return {name: filename, extension: ''};
	}
	return {
		name: filename.substring(0, lastDotIndex),
		extension: filename.substring(lastDotIndex),
	};
};
