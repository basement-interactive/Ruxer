// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import GuildReadState from '@app/features/guild/state/GuildReadState';
import Guilds from '@app/features/guild/state/Guilds';
import Permission from '@app/features/permissions/state/Permission';
import type {GuildRole} from '@fluxer/schema/src/domains/guild/GuildRoleSchemas';

interface GuildRoleUpdatePayload {
	guild_id: string;
	role: GuildRole;
}

export function handleGuildRoleUpdate(data: GuildRoleUpdatePayload, _context: GatewayHandlerContext): void {
	Guilds.handleGuildRoleUpdate({guildId: data.guild_id, role: data.role});
	Permission.handleGuildRole(data.guild_id);
	GuildReadState.handleGuildUpdate(data.guild_id);
}
