// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import MentionFeed from '@app/features/notification/state/MentionFeed';

interface RecentMentionDeletePayload {
	message_id: string;
}

export function handleRecentMentionDelete(data: RecentMentionDeletePayload, _context: GatewayHandlerContext): void {
	MentionFeed.handleMessageDelete(data.message_id);
}
