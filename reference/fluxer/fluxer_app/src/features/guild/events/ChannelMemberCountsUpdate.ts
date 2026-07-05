// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import ChannelMemberCount from '@app/features/guild/state/ChannelMemberCount';

interface ChannelMemberCountsUpdatePayload {
	counts?: ReadonlyArray<{
		guild_id: string;
		channel_id: string;
		member_count: number;
		online_count: number;
	}>;
}

export function handleChannelMemberCountsUpdate(
	data: ChannelMemberCountsUpdatePayload,
	_context: GatewayHandlerContext,
): void {
	const counts = Array.isArray(data?.counts) ? data.counts : [];
	ChannelMemberCount.handleCountsResponse(counts);
}
