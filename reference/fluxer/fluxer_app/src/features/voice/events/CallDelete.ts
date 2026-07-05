// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import CallState from '@app/features/voice/state/CallState';

interface CallDeletePayload {
	channel_id: string;
}

export function handleCallDelete(data: CallDeletePayload, _context: GatewayHandlerContext): void {
	CallState.handleCallDelete({channelId: data.channel_id});
}
