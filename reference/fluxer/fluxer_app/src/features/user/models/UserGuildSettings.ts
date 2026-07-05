// SPDX-License-Identifier: AGPL-3.0-or-later

export interface MuteWindow {
	end_time?: string | null;
	selected_time_window?: number;
}

export type MuteConfig = Readonly<MuteWindow> | null;

export interface ChannelOverrideShape {
	collapsed: boolean;
	message_notifications: number;
	muted: boolean;
	mute_config?: MuteConfig;
	unread_badges?: number | null;
}

export type ChannelOverride = Readonly<ChannelOverrideShape>;

export interface UserGuildSettingsShape {
	guild_id: string | null;
	message_notifications: number;
	muted: boolean;
	mute_config?: MuteConfig;
	mobile_push: boolean;
	suppress_everyone: boolean;
	suppress_roles: boolean;
	hide_muted_channels: boolean;
	channel_overrides?: Record<string, ChannelOverride> | null;
	unread_badges?: number | null;
	version: number;
}

export type UserGuildSettings = Readonly<UserGuildSettingsShape>;
export type UserGuildSettingsPartial = Partial<Omit<UserGuildSettingsShape, 'guild_id' | 'version'>>;
