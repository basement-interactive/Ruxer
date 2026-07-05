// SPDX-License-Identifier: AGPL-3.0-or-later

import Authentication from '@app/features/auth/state/Authentication';
import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import type {PresenceRecord} from '@app/features/gateway/types/GatewayPresenceTypes';
import GuildReadState from '@app/features/guild/state/GuildReadState';
import {GuildMember} from '@app/features/member/models/GuildMember';
import GuildMembers from '@app/features/member/state/GuildMembers';
import MemberSearch from '@app/features/member/state/MemberSearch';
import Permission from '@app/features/permissions/state/Permission';
import TransientPresence from '@app/features/presence/state/TransientPresence';
import Users from '@app/features/user/state/Users';
import type {StatusType} from '@fluxer/constants/src/StatusConstants';
import {normalizeStatus} from '@fluxer/constants/src/StatusConstants';
import type {GuildMemberData} from '@fluxer/schema/src/domains/guild/GuildMemberSchemas';
import type {User} from '@fluxer/schema/src/domains/user/UserResponseSchemas';

interface GuildMembersChunkPayload {
	guild_id: string;
	members: ReadonlyArray<GuildMemberData>;
	chunk_index: number;
	chunk_count: number;
	not_found?: ReadonlyArray<string>;
	presences?: ReadonlyArray<PresenceRecord>;
	nonce?: string;
}

export function handleGuildMembersChunk(data: GuildMembersChunkPayload, _context: GatewayHandlerContext): void {
	const {guild_id: guildId, members, chunk_index: chunkIndex, chunk_count: chunkCount, presences, nonce} = data;
	const currentUserId = Authentication.currentUserId;
	for (const member of members) {
		Users.handleUserUpdate(member.user as User);
	}
	GuildMembers.handleMembersChunk({
		guildId,
		members: members as Array<GuildMemberData>,
		chunkIndex,
		chunkCount,
		nonce,
	});
	if (currentUserId != null && members.some((member) => member.user.id === currentUserId)) {
		Permission.handleGuildMemberUpdate(currentUserId);
		GuildReadState.handleGuildMemberUpdate(currentUserId, guildId);
	}
	const memberRecords = members.map((member) => new GuildMember(guildId, member));
	MemberSearch.handleMembersChunk(guildId, memberRecords);
	if (presences) {
		const updates: Array<{
			userId: string;
			status: StatusType;
		}> = [];
		for (const presence of presences) {
			const userId = presence.user?.id;
			const status = presence.status ? normalizeStatus(presence.status) : null;
			if (userId && status) {
				updates.push({userId, status});
			}
		}
		if (updates.length > 0) {
			TransientPresence.updatePresences(updates);
		}
	}
}
