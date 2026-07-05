// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import Webhooks from '@app/features/webhook/state/Webhooks';

interface WebhooksUpdatePayload {
	channel_id: string;
	guild_id: string;
}

export function handleWebhooksUpdate(data: WebhooksUpdatePayload, _context: GatewayHandlerContext): void {
	Webhooks.handleWebhooksUpdate(data.guild_id, data.channel_id);
}
