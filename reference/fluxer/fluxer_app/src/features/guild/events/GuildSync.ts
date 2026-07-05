// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import type {GuildReadyData} from '@app/features/gateway/types/GatewayGuildTypes';
import {handleGuildCreate} from '@app/features/guild/events/GuildCreate';

export function handleGuildSync(data: GuildReadyData, context: GatewayHandlerContext): void {
	context.markGuildSynced(data.id);
	const syncContext = {...context, _isSync: true};
	handleGuildCreate(data, syncContext);
}
