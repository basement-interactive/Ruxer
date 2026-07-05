// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import SavedMessages from '@app/features/messaging/state/SavedMessages';
import type {Message} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';

export function handleSavedMessageCreate(data: Message, _context: GatewayHandlerContext): void {
	SavedMessages.handleMessageCreate(data);
}
