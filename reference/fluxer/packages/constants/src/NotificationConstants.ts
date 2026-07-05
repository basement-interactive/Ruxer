// SPDX-License-Identifier: AGPL-3.0-or-later

export const MessageNotifications = {
	NULL: -1,
	ALL_MESSAGES: 0,
	ONLY_MENTIONS: 1,
	NO_MESSAGES: 2,
	INHERIT: 3,
} as const;
export type GuildDefaultMessageNotifications = 0 | 1;
export type ChannelMessageNotifications = 0 | 1 | 2 | 3;
