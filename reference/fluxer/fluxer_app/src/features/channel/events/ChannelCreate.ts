// SPDX-License-Identifier: AGPL-3.0-or-later

import Channels from '@app/features/channel/state/Channels';
import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import GuildReadState from '@app/features/guild/state/GuildReadState';
import Permission from '@app/features/permissions/state/Permission';
import ReadStates from '@app/features/read_state/state/ReadStates';
import QuickSwitcher from '@app/features/search/state/QuickSwitcher';
import type {Channel} from '@fluxer/schema/src/domains/channel/ChannelSchemas';

interface ChannelPayload {
	id: string;
	type: number;
}

export function handleChannelCreate(data: ChannelPayload, _context: GatewayHandlerContext): void {
	const channel = data as Channel;
	Channels.handleChannelCreate({channel});
	Permission.handleChannelUpdate(data.id);
	ReadStates.handleChannelCreate({channel});
	GuildReadState.handleGenericUpdate(data.id);
	QuickSwitcher.recomputeIfOpen();
}
