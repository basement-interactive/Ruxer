// SPDX-License-Identifier: AGPL-3.0-or-later

import {createKeyedActionGuard} from '@app/lib/overlay/KeyedActionGuard';

const inviteToCommunityGuard = createKeyedActionGuard();

export function getInviteToCommunityGuardKey(userId: string, guildId: string, channelId: string): string {
	return `${userId}:${guildId}:${channelId}`;
}

export function beginInviteToCommunityGuard(key: string): boolean {
	return inviteToCommunityGuard.begin(key);
}

export function scheduleInviteToCommunityGuardRelease(key: string): void {
	inviteToCommunityGuard.scheduleRelease(key);
}
