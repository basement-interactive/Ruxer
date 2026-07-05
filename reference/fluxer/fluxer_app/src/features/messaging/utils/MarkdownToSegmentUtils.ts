// SPDX-License-Identifier: AGPL-3.0-or-later

import Channels from '@app/features/channel/state/Channels';
import Emoji from '@app/features/emoji/state/Emoji';
import Guilds from '@app/features/guild/state/Guilds';
import type {MentionSegment, TextareaSegmentManager} from '@app/features/messaging/utils/TextareaSegmentManager';
import Users from '@app/features/user/state/Users';
import * as NicknameUtils from '@app/features/user/utils/NicknameUtils';

const MARKDOWN_SEGMENT_PATTERN = /<(@|#|@&)([a-zA-Z0-9]+)>|<(a)?:([^:]+):([a-zA-Z0-9]+)>/g;

interface SegmentConversionResult {
	displayText: string;
	segments: Array<{
		start: number;
		displayText: string;
		actualText: string;
		type: MentionSegment['type'];
		id: string;
	}>;
}

export function convertMarkdownToSegments(markdown: string, guildId?: string | null): SegmentConversionResult {
	let displayText = markdown;
	let offset = 0;
	const segments: SegmentConversionResult['segments'] = [];
	const matches = Array.from(markdown.matchAll(MARKDOWN_SEGMENT_PATTERN));
	for (const match of matches) {
		const fullMatch = match[0];
		const originalStart = match.index!;
		const adjustedStart = originalStart + offset;
		let segmentDisplayText: string | null = null;
		let segmentType: MentionSegment['type'] | null = null;
		let segmentId: string | null = null;
		if (match[1] && match[2]) {
			const prefix = match[1];
			const id = match[2];
			if (prefix === '@') {
				const user = Users.getUser(id);
				if (user) {
					segmentDisplayText = `@${NicknameUtils.formatUserTagForStreamerMode(user)}`;
					segmentType = 'user';
					segmentId = id;
				}
			} else if (prefix === '#') {
				const foundChannel = Channels.getChannel(id);
				if (foundChannel?.name) {
					segmentDisplayText = `#${foundChannel.name}`;
					segmentType = 'channel';
					segmentId = id;
				}
			} else if (prefix === '@&') {
				const role = guildId ? Guilds.getGuildRole(guildId, id) : undefined;
				if (role) {
					segmentDisplayText = `@${role.name}`;
					segmentType = 'role';
					segmentId = id;
				}
			}
		} else if (match[4] && match[5]) {
			const emojiId = match[5];
			const emoji = Emoji.getEmojiById(emojiId);
			if (emoji) {
				segmentDisplayText = `:${emoji.name}:`;
				segmentType = 'emoji';
				segmentId = emojiId;
			}
		}
		if (segmentDisplayText && segmentType && segmentId) {
			displayText =
				displayText.slice(0, adjustedStart) + segmentDisplayText + displayText.slice(adjustedStart + fullMatch.length);
			segments.push({
				start: adjustedStart,
				displayText: segmentDisplayText,
				actualText: fullMatch,
				type: segmentType,
				id: segmentId,
			});
			offset += segmentDisplayText.length - fullMatch.length;
		}
	}
	return {displayText, segments};
}

export function applyMarkdownSegments(
	markdown: string,
	guildId: string | null | undefined,
	segmentManager: TextareaSegmentManager,
): string {
	const {displayText, segments} = convertMarkdownToSegments(markdown, guildId);
	for (const segment of segments) {
		segmentManager.insertSegment(
			displayText.slice(0, segment.start + segment.displayText.length),
			segment.start,
			segment.displayText,
			segment.actualText,
			segment.type,
			segment.id,
		);
	}
	return displayText;
}
