// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import {GUILD_TEXT_BASED_CHANNEL_TYPES} from '@fluxer/constants/src/ChannelConstants';

type MinimalChannel = Pick<Channel, 'id' | 'type' | 'position' | 'guildId'>;

export function compareChannelPosition(a: MinimalChannel, b: MinimalChannel): number {
	if (a.position !== b.position) {
		return (a.position ?? 0) - (b.position ?? 0);
	}
	return a.id.localeCompare(b.id);
}

export function filterViewableChannels<T extends MinimalChannel>(channels: ReadonlyArray<T>): Array<T> {
	return channels.filter((channel) => GUILD_TEXT_BASED_CHANNEL_TYPES.has(channel.type));
}

export function pickDefaultGuildChannelId({
	guildId,
	channels,
	selectedChannelId,
	systemChannelId,
	rulesChannelId,
}: {
	guildId: string;
	channels: ReadonlyArray<MinimalChannel>;
	selectedChannelId?: string | null;
	systemChannelId?: string | null;
	rulesChannelId?: string | null;
}): string | null {
	if (!channels.length) return null;
	const channelById = new Map(channels.map((channel) => [channel.id, channel]));
	const isChannelInGuild = (channelId?: string | null) =>
		channelId ? channelById.get(channelId)?.guildId === guildId : false;
	if (isChannelInGuild(selectedChannelId)) {
		return selectedChannelId!;
	}
	if (isChannelInGuild(systemChannelId)) {
		return systemChannelId!;
	}
	if (isChannelInGuild(rulesChannelId)) {
		return rulesChannelId!;
	}
	const viewable = [...filterViewableChannels(channels)].sort(compareChannelPosition);
	return viewable[0]?.id ?? null;
}
