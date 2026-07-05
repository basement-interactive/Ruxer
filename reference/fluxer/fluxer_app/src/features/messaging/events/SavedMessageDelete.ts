// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import SavedMessages from '@app/features/messaging/state/SavedMessages';

interface SavedMessageDeletePayload {
	message_id: string;
}

export function handleSavedMessageDelete(data: SavedMessageDeletePayload, _context: GatewayHandlerContext): void {
	SavedMessages.handleMessageDelete(data.message_id);
}
