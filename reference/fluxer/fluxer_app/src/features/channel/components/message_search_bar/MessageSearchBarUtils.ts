// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import type {Guild} from '@app/features/guild/models/Guild';
import Guilds from '@app/features/guild/state/Guilds';
import type {GuildMember} from '@app/features/member/models/GuildMember';
import GuildMembers from '@app/features/member/state/GuildMembers';
import type {MessageSearchScope, SearchFilterOption} from '@app/features/search/utils/SearchUtils';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import type {IconProps} from '@phosphor-icons/react';
import {ChatCenteredDotsIcon, EnvelopeSimpleIcon, GlobeIcon, HashIcon, UsersIcon} from '@phosphor-icons/react';

export const SCOPE_ICON_COMPONENTS: Record<MessageSearchScope, React.ComponentType<IconProps>> = {
	current: HashIcon,
	all_dms: EnvelopeSimpleIcon,
	open_dms: ChatCenteredDotsIcon,
	all_guilds: GlobeIcon,
	all: UsersIcon,
	open_dms_and_all_guilds: UsersIcon,
};

export function filterRequiresValue(filter: SearchFilterOption): boolean {
	return Boolean(filter.requiresValue) || (filter.values?.length ?? 0) > 0;
}

export function deduplicateMembers(members: Array<GuildMember>): Array<GuildMember> {
	const seen = new Set<string>();
	const result: Array<GuildMember> = [];
	for (const member of members) {
		if (!seen.has(member.user.id)) {
			seen.add(member.user.id);
			result.push(member);
		}
	}
	return result;
}

export function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
	if (!ref) {
		return;
	}
	if (typeof ref === 'function') {
		ref(value);
		return;
	}
	(ref as React.MutableRefObject<T | null>).current = value;
}

export function normalizeFilterKey(filterKey: string): string {
	return filterKey.replace(/^-/, '');
}

export function isDateFilterKey(filterKey: string): boolean {
	switch (normalizeFilterKey(filterKey)) {
		case 'before':
		case 'after':
		case 'during':
		case 'on':
			return true;
		default:
			return false;
	}
}

export function isUserFilterKey(filterKey: string): boolean {
	switch (normalizeFilterKey(filterKey)) {
		case 'from':
		case 'mentions':
			return true;
		default:
			return false;
	}
}

export type GuildSearchMode = 'none' | 'current_guild' | 'all_guilds';

export interface UserGuildSearchPlan {
	mode: GuildSearchMode;
	guildsToSearch: Array<Guild> | null;
	priorityGuildId?: string;
	workerFilters: {
		friends?: boolean;
		guild?: string;
	};
}

export function getUserGuildSearchPlan(
	scope: MessageSearchScope,
	currentGuildId: string | undefined,
): UserGuildSearchPlan {
	const SCOPES_WITH_GUILDS = new Set<MessageSearchScope>(['current', 'all_guilds', 'all', 'open_dms_and_all_guilds']);
	const ALL_GUILDS_SCOPES = new Set<MessageSearchScope>(['all_guilds', 'all', 'open_dms_and_all_guilds']);
	if (!SCOPES_WITH_GUILDS.has(scope)) {
		return {
			mode: 'none',
			guildsToSearch: null,
			priorityGuildId: undefined,
			workerFilters: {},
		};
	}
	if (scope === 'current') {
		if (!currentGuildId) {
			return {
				mode: 'none',
				guildsToSearch: null,
				priorityGuildId: undefined,
				workerFilters: {},
			};
		}
		const guild = Guilds.getGuild(currentGuildId);
		return {
			mode: 'current_guild',
			guildsToSearch: guild ? [guild] : [],
			priorityGuildId: currentGuildId,
			workerFilters: {guild: currentGuildId},
		};
	}
	if (ALL_GUILDS_SCOPES.has(scope)) {
		return {
			mode: 'all_guilds',
			guildsToSearch: Guilds.getGuilds(),
			priorityGuildId: currentGuildId,
			workerFilters: {},
		};
	}
	return {
		mode: 'none',
		guildsToSearch: null,
		priorityGuildId: undefined,
		workerFilters: {},
	};
}

export type MemberSearchBoosters = Record<string, number>;

export function buildUserSearchBoosters(
	channel: Channel | undefined,
	currentGuildId: string | undefined,
	mode: GuildSearchMode,
) {
	const boosters: MemberSearchBoosters = {};
	if (
		channel &&
		(channel.type === ChannelTypes.DM ||
			channel.type === ChannelTypes.GROUP_DM ||
			channel.type === ChannelTypes.DM_PERSONAL_NOTES)
	) {
		for (const id of channel.recipientIds) {
			boosters[id] = Math.max(boosters[id] ?? 1, 3);
		}
	}
	if (mode === 'all_guilds' && currentGuildId) {
		const members = GuildMembers.getMembers(currentGuildId);
		const MAX_BOOSTED_MEMBERS = 300;
		for (let i = 0; i < members.length && i < MAX_BOOSTED_MEMBERS; i += 1) {
			const id = members[i]!.user.id;
			boosters[id] = Math.max(boosters[id] ?? 1, 2);
		}
	}
	return boosters;
}
