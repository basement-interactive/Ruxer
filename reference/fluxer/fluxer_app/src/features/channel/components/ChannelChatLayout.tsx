// SPDX-License-Identifier: AGPL-3.0-or-later

import {fetchSlowmodeState} from '@app/features/channel/commands/ChannelCommands';
import styles from '@app/features/channel/components/ChannelChatLayout.module.css';
import {SlowmodeIndicator} from '@app/features/channel/components/SlowmodeIndicator';
import {TypingUsers} from '@app/features/channel/components/TypingUsers';
import type {Channel} from '@app/features/channel/models/Channel';
import Messages from '@app/features/messaging/state/MessagingMessages';
import {useSlowmode} from '@app/features/slowmode/hooks/useSlowmode';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect} from 'react';

const MESSAGES_DESCRIPTOR = msg({
	message: 'Messages',
	comment: 'Short label in the channel chat layout. Keep it concise.',
});
const MESSAGE_COMPOSER_DESCRIPTOR = msg({
	message: 'Message composer',
	comment: 'Short label in the channel chat layout. Keep it concise.',
});

interface ChannelChatLayoutProps {
	channel: Channel;
	messages: React.ReactNode;
	textarea: React.ReactNode;
	hideBottomBar?: boolean;
}

export function getChannelChatStatusVisibility({
	hideBottomBar = false,
	isSlowmodeEnabled,
	messagesReady,
}: {
	hideBottomBar?: boolean;
	isSlowmodeEnabled: boolean;
	messagesReady: boolean;
}) {
	const showFloatingStatus = !hideBottomBar;
	const showTypingUsers = messagesReady && showFloatingStatus;
	const showSlowmodeIndicator = isSlowmodeEnabled && showFloatingStatus;
	return {
		showTypingUsers,
		showSlowmodeIndicator,
		showRow: showTypingUsers || showSlowmodeIndicator,
	};
}

export const ChannelChatLayout = observer(({channel, messages, textarea, hideBottomBar}: ChannelChatLayoutProps) => {
	const {i18n} = useLingui();
	const {slowmodeRemaining, isSlowmodeEnabled, isSlowmodeImmune} = useSlowmode(channel);
	void Messages.version;
	const messagesReady = Messages.getMessages(channel.id).ready;
	const shouldFetchSlowmode = Boolean(channel.guildId) && (channel.rateLimitPerUser ?? 0) > 0;
	useEffect(() => {
		if (!shouldFetchSlowmode) return;
		void fetchSlowmodeState(channel.id);
	}, [channel.id, shouldFetchSlowmode]);
	const {showTypingUsers, showSlowmodeIndicator} = getChannelChatStatusVisibility({
		hideBottomBar,
		isSlowmodeEnabled,
		messagesReady,
	});
	return (
		<div className={styles.container} data-flx="channel.channel-chat-layout.container">
			<section
				className={styles.messagesArea}
				aria-label={i18n._(MESSAGES_DESCRIPTOR)}
				data-flx="channel.channel-chat-layout.messages-area"
			>
				{messages}
			</section>
			<div className={styles.typingArea} data-flx="channel.channel-chat-layout.typing-area">
				{showTypingUsers && (
					<div className={styles.typingContent} data-flx="channel.channel-chat-layout.typing-content">
						<div className={styles.typingLeft} data-flx="channel.channel-chat-layout.typing-left">
							<TypingUsers channel={channel} data-flx="channel.channel-chat-layout.typing-users" />
						</div>
					</div>
				)}
				{showSlowmodeIndicator && (
					<div className={styles.slowmodePin} data-flx="channel.channel-chat-layout.slowmode-target">
						<SlowmodeIndicator
							slowmodeRemaining={slowmodeRemaining}
							slowmodeDuration={channel.rateLimitPerUser * 1000}
							isImmune={isSlowmodeImmune}
							data-flx="channel.channel-chat-layout.slowmode-indicator"
						/>
					</div>
				)}
			</div>
			<section
				className={styles.textareaArea}
				aria-label={i18n._(MESSAGE_COMPOSER_DESCRIPTOR)}
				data-flx="channel.channel-chat-layout.textarea-area"
			>
				{textarea}
			</section>
		</div>
	);
});
