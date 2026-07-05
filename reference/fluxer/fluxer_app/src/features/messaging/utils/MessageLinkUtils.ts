// SPDX-License-Identifier: AGPL-3.0-or-later

import {webAppUrl} from '@app/features/messaging/utils/MessagingUrlUtils';
import {ME} from '@fluxer/constants/src/AppConstants';

interface BuildMessageLinkOptions {
	guildId?: string | null;
	channelId: string;
	messageId: string;
	includeProtocol?: boolean;
}

interface BuildChannelLinkOptions {
	guildId?: string | null;
	channelId: string;
	includeProtocol?: boolean;
}

const buildCanonicalWebAppUrl = (path: string, includeProtocol: boolean): string => {
	const absoluteUrl = webAppUrl(path);
	if (includeProtocol) {
		return absoluteUrl;
	}
	try {
		const parsed = new URL(absoluteUrl);
		return `//${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return absoluteUrl.replace(/^[a-zA-Z][a-zA-Z\d+\-.]*:/, '');
	}
};

export function buildMessageJumpLink({
	guildId,
	channelId,
	messageId,
	includeProtocol = true,
}: BuildMessageLinkOptions): string {
	const resolvedGuildId = guildId ?? ME;
	return buildCanonicalWebAppUrl(`/channels/${resolvedGuildId}/${channelId}/${messageId}`, includeProtocol);
}

export function buildChannelLink({guildId, channelId, includeProtocol = true}: BuildChannelLinkOptions): string {
	const resolvedGuildId = guildId ?? ME;
	return buildCanonicalWebAppUrl(`/channels/${resolvedGuildId}/${channelId}`, includeProtocol);
}
