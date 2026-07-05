// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelSourcePreview} from '@app/features/channel/components/ChannelSourcePreview';
import type {Channel} from '@app/features/channel/models/Channel';
import styles from '@app/features/messaging/components/popouts/InboxMessageHeader.module.css';
import type {MediaProxyImageSize} from '@fluxer/constants/src/MediaProxyImageSizes';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface InboxMessageHeaderProps {
	channel: Channel;
	onClick?: () => void;
	leftAdornment?: React.ReactNode;
	rightActions?: React.ReactNode;
	mentionCount?: number;
	avatarSize?: MediaProxyImageSize;
	className?: string;
}

export const InboxMessageHeader = observer(function InboxMessageHeader({
	channel,
	onClick,
	leftAdornment,
	rightActions,
	mentionCount,
	avatarSize = 32,
	className,
}: InboxMessageHeaderProps) {
	return (
		<div className={clsx(styles.header, className)} data-flx="messaging.inbox-message-header.header">
			<div className={styles.headerLeft} data-flx="messaging.inbox-message-header.header-left">
				{leftAdornment}
				<ChannelSourcePreview
					channel={channel}
					onClick={onClick}
					mentionCount={mentionCount}
					avatarSize={avatarSize}
					data-flx="messaging.inbox-message-header.channel-source-preview.click"
				/>
			</div>
			{rightActions && (
				<div className={styles.headerActions} data-flx="messaging.inbox-message-header.header-actions">
					{rightActions}
				</div>
			)}
		</div>
	);
});
