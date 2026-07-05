// SPDX-License-Identifier: AGPL-3.0-or-later

import GuildMembers from '@app/features/member/state/GuildMembers';
import Users from '@app/features/user/state/Users';
import {type MentionReplyPreference, MentionReplyPreferences} from '@fluxer/constants/src/UserConstants';

export type ReplyMentionPreferenceConflict = 'prefers_mention' | 'prefers_no_mention';

export function resolveMentionReplyPreference(params: {
	authorId: string;
	guildId: string | null | undefined;
}): MentionReplyPreference {
	const {authorId, guildId} = params;
	if (guildId) {
		const member = GuildMembers.getMember(guildId, authorId);
		if (member && member.mentionFlags !== MentionReplyPreferences.NO_PREFERENCE) {
			return member.mentionFlags;
		}
	}
	const author = Users.getUser(authorId);
	return (author?.mentionFlags ?? MentionReplyPreferences.NO_PREFERENCE) as MentionReplyPreference;
}

export function getReplyMentionPreferenceConflict(
	mentioning: boolean,
	preference: MentionReplyPreference,
): ReplyMentionPreferenceConflict | null {
	if (!mentioning && preference === MentionReplyPreferences.PREFER_MENTION) return 'prefers_mention';
	if (mentioning && preference === MentionReplyPreferences.PREFER_NO_MENTION) return 'prefers_no_mention';
	return null;
}

export function getDefaultReplyMention(params: {
	authorId: string;
	isOwnMessage: boolean;
	guildId: string | null | undefined;
	fallbackMention?: boolean;
}): boolean {
	const {authorId, isOwnMessage, guildId, fallbackMention} = params;
	if (isOwnMessage || !guildId) {
		return false;
	}
	const preference = resolveMentionReplyPreference({authorId, guildId});
	if (preference === MentionReplyPreferences.PREFER_MENTION) return true;
	if (preference === MentionReplyPreferences.PREFER_NO_MENTION) return false;
	return fallbackMention ?? true;
}
