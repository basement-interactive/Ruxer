// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MentionSegment} from '@app/features/messaging/utils/TextareaSegmentManager';
import * as NicknameUtils from '@app/features/user/utils/NicknameUtils';

const MARKDOWN_MENTION_PATTERN = /<(@|#|@&)([a-zA-Z0-9]+)>/g;
const EMOJI_MARKDOWN_PATTERN = /<(a)?:([^:]+):([a-zA-Z0-9]+)>/g;

interface PastedSegmentInfo {
	displayText: string;
	actualText: string;
	type: MentionSegment['type'];
	id: string;
	start: number;
	end: number;
}

export interface LookupFunctions {
	userById: (id: string) => {
		id: string;
		tag: string;
	} | null;
	channelById: (id: string) => {
		id: string;
		name: string;
	} | null;
	roleById: (id: string) => {
		id: string;
		name: string;
	} | null;
	emojiById: (id: string) => {
		id: string;
		name: string;
		uniqueName: string;
	} | null;
}

export function detectPastedSegments(
	pastedText: string,
	pastePosition: number,
	lookups: LookupFunctions,
): Array<PastedSegmentInfo> {
	const segments: Array<PastedSegmentInfo> = [];
	let match: RegExpExecArray | null;
	MARKDOWN_MENTION_PATTERN.lastIndex = 0;
	while ((match = MARKDOWN_MENTION_PATTERN.exec(pastedText)) !== null) {
		const [fullMatch, prefix, id] = match;
		const start = pastePosition + match.index;
		const end = start + fullMatch.length;
		let type: MentionSegment['type'];
		let displayText: string | null = null;
		if (prefix === '@') {
			type = 'user';
			const user = lookups.userById(id);
			if (user) {
				displayText = `@${NicknameUtils.formatTagForStreamerMode(user.tag)}`;
			}
		} else if (prefix === '#') {
			type = 'channel';
			const channel = lookups.channelById(id);
			if (channel) {
				displayText = `#${channel.name}`;
			}
		} else if (prefix === '@&') {
			type = 'role';
			const role = lookups.roleById(id);
			if (role) {
				displayText = `@${role.name}`;
			}
		} else {
			continue;
		}
		if (displayText) {
			segments.push({
				displayText,
				actualText: fullMatch,
				type,
				id,
				start,
				end,
			});
		}
	}
	EMOJI_MARKDOWN_PATTERN.lastIndex = 0;
	while ((match = EMOJI_MARKDOWN_PATTERN.exec(pastedText)) !== null) {
		const [fullMatch, , , emojiId] = match;
		const emoji = lookups.emojiById(emojiId);
		if (emoji) {
			const start = pastePosition + match.index;
			const end = start + fullMatch.length;
			const overlaps = segments.some((seg) => start < seg.end && end > seg.start);
			if (!overlaps) {
				segments.push({
					displayText: `:${emoji.name}:`,
					actualText: fullMatch,
					type: 'emoji',
					id: emoji.id,
					start,
					end,
				});
			}
		}
	}
	return segments.sort((a, b) => a.start - b.start);
}
