// SPDX-License-Identifier: AGPL-3.0-or-later

import {SystemMessage} from '@app/features/channel/components/SystemMessage';
import {SystemMessageUsername} from '@app/features/channel/components/SystemMessageUsername';
import {useSystemMessageData} from '@app/features/messaging/hooks/useSystemMessageData';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {Trans} from '@lingui/react/macro';
import {ImageSquareIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';

interface ChannelIconChangeMessageProps {
	message: Message;
}

export const ChannelIconChangeMessage = observer(({message}: ChannelIconChangeMessageProps) => {
	const {author, channel, guild} = useSystemMessageData(message);
	if (!channel) {
		return null;
	}
	const messageContent = (
		<Trans>
			<SystemMessageUsername
				key={author.id}
				author={author}
				guild={guild}
				message={message}
				data-flx="channel.channel-icon-change-message.system-message-username"
			/>{' '}
			changed the channel icon.
		</Trans>
	);
	return (
		<SystemMessage
			icon={ImageSquareIcon}
			iconWeight="bold"
			message={message}
			messageContent={messageContent}
			data-flx="channel.channel-icon-change-message.system-message"
		/>
	);
});
