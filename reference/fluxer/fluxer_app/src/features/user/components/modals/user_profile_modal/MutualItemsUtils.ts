// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import Channels from '@app/features/channel/state/Channels';
import type {Guild} from '@app/features/guild/models/Guild';
import Guilds from '@app/features/guild/state/Guilds';
import type {ProfileMutualGuild} from '@app/features/user/models/Profile';

export type MutualCommunityDisplayItem = {
	guild: Guild;
	nick: string | null;
};

export function getMutualGroupChannels(userId: string): Array<Channel> {
	return Channels.dmChannels.filter((channel) => channel.isGroupDM() && channel.recipientIds.includes(userId));
}

export function getMutualCommunityDisplayItems(
	mutualGuilds: ReadonlyArray<ProfileMutualGuild>,
): Array<MutualCommunityDisplayItem> {
	return mutualGuilds
		.map((mutualGuild) => {
			const guild = Guilds.getGuild(mutualGuild.id);
			if (!guild) {
				return null;
			}
			return {guild, nick: mutualGuild.nick};
		})
		.filter((item): item is MutualCommunityDisplayItem => item !== null);
}
