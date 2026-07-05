// SPDX-License-Identifier: AGPL-3.0-or-later

export interface FluxerButtonBadgeCountInput {
	incomingFriendRequestCount: number;
	inlineDmsCollapsed: boolean;
	showCollapsedUnreadDmsBadge: boolean;
	showIncomingFriendRequestBadge: boolean;
	unreadDmCount: number;
}

export function getFluxerButtonBadgeCount({
	incomingFriendRequestCount,
	inlineDmsCollapsed,
	showCollapsedUnreadDmsBadge,
	showIncomingFriendRequestBadge,
	unreadDmCount,
}: FluxerButtonBadgeCountInput): number {
	let count = 0;
	if (inlineDmsCollapsed && showCollapsedUnreadDmsBadge) {
		count += unreadDmCount;
	}
	if (showIncomingFriendRequestBadge) {
		count += incomingFriendRequestCount;
	}
	return count;
}
