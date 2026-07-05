// SPDX-License-Identifier: AGPL-3.0-or-later

export interface MentionFilters {
	includeEveryone: boolean;
	includeRoles: boolean;
	includeGuilds: boolean;
}

export const DEFAULT_MENTION_FILTERS: MentionFilters = {
	includeEveryone: true,
	includeRoles: true,
	includeGuilds: true,
};

interface MentionTypeFields {
	mention_everyone?: boolean | null;
	mention_roles?: ReadonlyArray<string> | null;
	mentionEveryone?: boolean | null;
	mentionRoles?: ReadonlyArray<string> | null;
}

export function messageMatchesMentionTypeFilters(message: MentionTypeFields, filters: MentionFilters): boolean {
	const mentionsEveryone = message.mention_everyone ?? message.mentionEveryone ?? false;
	const mentionRoles = message.mention_roles ?? message.mentionRoles ?? [];
	if (!filters.includeEveryone && mentionsEveryone) return false;
	if (!filters.includeRoles && mentionRoles.length > 0) return false;
	return true;
}
