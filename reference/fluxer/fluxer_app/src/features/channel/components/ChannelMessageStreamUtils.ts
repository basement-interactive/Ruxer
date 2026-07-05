// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import type {ChannelStreamItem} from '@app/features/messaging/utils/MessageGroupingUtils';

export function getUnreadDividerBeforeMessageId(
	pendingStreamItems: ReadonlyArray<ChannelStreamItem>,
	suppressUnreadIndicator?: boolean,
): string | null {
	if (suppressUnreadIndicator) {
		return null;
	}
	for (const item of pendingStreamItems) {
		if (item.showUnreadDividerBefore) {
			return (item.content as Message).id;
		}
	}
	return null;
}
