// SPDX-License-Identifier: AGPL-3.0-or-later

import {SystemMessage} from '@app/features/channel/components/SystemMessage';
import {SystemMessageUsername} from '@app/features/channel/components/SystemMessageUsername';
import {useSystemMessageData} from '@app/features/messaging/hooks/useSystemMessageData';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import styles from '@app/features/theme/styles/Message.module.css';
import {Trans} from '@lingui/react/macro';
import {PencilSimpleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';

interface ChannelNameChangeMessageProps {
	message: Message;
}

export const ChannelNameChangeMessage = observer(({message}: ChannelNameChangeMessageProps) => {
	const {author, channel, guild} = useSystemMessageData(message);
	if (!channel) {
		return null;
	}
	const newName = message.content;
	const nameComponent = channel.isGroupDM() ? (
		<span
			className={styles.systemMessageLink}
			style={{cursor: 'text', textDecoration: 'none'}}
			data-flx="channel.channel-name-change-message.system-message-link"
		>
			{newName}
		</span>
	) : (
		<span className={styles.systemMessageLink} data-flx="channel.channel-name-change-message.system-message-link--2">
			{newName}
		</span>
	);
	const messageContent = newName ? (
		<Trans>
			<SystemMessageUsername
				key={author.id}
				author={author}
				guild={guild}
				message={message}
				data-flx="channel.channel-name-change-message.system-message-username"
			/>{' '}
			changed the channel name to {nameComponent}.
		</Trans>
	) : (
		<Trans>
			<SystemMessageUsername
				key={author.id}
				author={author}
				guild={guild}
				message={message}
				data-flx="channel.channel-name-change-message.system-message-username--2"
			/>{' '}
			changed the channel name.
		</Trans>
	);
	return (
		<SystemMessage
			icon={PencilSimpleIcon}
			iconWeight="bold"
			message={message}
			messageContent={messageContent}
			data-flx="channel.channel-name-change-message.system-message"
		/>
	);
});
