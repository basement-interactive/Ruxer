// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelPinsContent} from '@app/features/app/components/shared/ChannelPinsContent';
import styles from '@app/features/channel/components/popouts/ChannelPinsPopout.module.css';
import type {Channel} from '@app/features/channel/models/Channel';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {PushPinIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';

const PINNED_MESSAGES_DESCRIPTOR = msg({
	message: 'Pinned messages',
	comment: 'Button or menu action label in the channel pins popout. Keep it concise.',
});
export const ChannelPinsPopout = observer(({channel, onClose}: {channel: Channel; onClose?: () => void}) => {
	const {i18n} = useLingui();
	return (
		<div className={styles.container} data-flx="channel.channel-pins-popout.container">
			<div className={styles.header} data-flx="channel.channel-pins-popout.header">
				<PushPinIcon className={styles.iconLarge} data-flx="channel.channel-pins-popout.icon-large" />
				<h1 className={styles.title} data-flx="channel.channel-pins-popout.title">
					{i18n._(PINNED_MESSAGES_DESCRIPTOR)}
				</h1>
			</div>
			<div className={styles.body} data-flx="channel.channel-pins-popout.body">
				<ChannelPinsContent
					channel={channel}
					onJump={onClose}
					data-flx="channel.channel-pins-popout.channel-pins-content"
				/>
			</div>
		</div>
	);
});
