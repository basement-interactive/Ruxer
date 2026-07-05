// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import Channels from '@app/features/channel/state/Channels';
import type {Guild} from '@app/features/guild/models/Guild';
import Guilds from '@app/features/guild/state/Guilds';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import type {User} from '@app/features/user/models/User';
import Users from '@app/features/user/state/Users';

interface SystemMessageData {
	author: User;
	channel: Channel | null;
	guild: Guild | undefined;
}

export function useSystemMessageData(message: Message): SystemMessageData {
	const authorFromState = Users.getUser(message.author.id);
	const author = authorFromState ?? message.author;
	const channel = Channels.getChannel(message.channelId);
	const guild = Guilds.getGuild(channel?.guildId ?? '');
	return {
		author,
		channel: channel ?? null,
		guild,
	};
}
