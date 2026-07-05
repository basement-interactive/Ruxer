// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import GuildReadState from '@app/features/guild/state/GuildReadState';
import UserGuildSettings, {type GatewayGuildSettings} from '@app/features/user/state/UserGuildSettings';

export function handleUserGuildSettingsUpdate(data: GatewayGuildSettings, _context: GatewayHandlerContext): void {
	UserGuildSettings.handleUserGuildSettingsUpdate(data);
	GuildReadState.handleUserGuildSettingsUpdate();
}
