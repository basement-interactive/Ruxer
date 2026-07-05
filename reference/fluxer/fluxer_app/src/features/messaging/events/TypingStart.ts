// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import GuildMembers from '@app/features/member/state/GuildMembers';
import TypingIndicator from '@app/features/typing/state/TypingIndicator';
import type {GuildMemberData} from '@fluxer/schema/src/domains/guild/GuildMemberSchemas';

interface TypingStartPayload {
	channel_id: string;
	user_id: string;
	timestamp: number;
	guild_id?: string;
	member?: GuildMemberData;
}

export function handleTypingStart(data: TypingStartPayload, _context: GatewayHandlerContext): void {
	if (data.guild_id && data.member) {
		GuildMembers.hydrateIfMissing(data.guild_id, data.member);
	}
	TypingIndicator.startRemoteTyping(data.channel_id, data.user_id);
}
