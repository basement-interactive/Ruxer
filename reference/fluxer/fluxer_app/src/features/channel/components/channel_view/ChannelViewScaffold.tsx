// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/ChannelIndexPage.module.css';
import {clsx} from 'clsx';
import type React from 'react';

interface ChannelViewScaffoldProps {
	header: React.ReactNode;
	chatArea: React.ReactNode;
	sidePanel?: React.ReactNode | null;
	showMemberListDivider?: boolean;
	className?: string;
	voiceTextSplitView?: boolean;
	chatAreaInert?: boolean;
}

export const ChannelViewScaffold: React.FC<ChannelViewScaffoldProps> = ({
	header,
	chatArea,
	sidePanel = null,
	showMemberListDivider = false,
	className,
	voiceTextSplitView = false,
	chatAreaInert = false,
}) => {
	return (
		<div
			className={clsx(styles.channelGrid, className)}
			data-voice-text-split-view={voiceTextSplitView ? 'true' : undefined}
			data-flx="channel.channel-view.channel-view-scaffold.channel-grid"
		>
			<div data-flx="channel.channel-view.channel-view-scaffold.div">{header}</div>
			<div className={styles.contentGrid} data-flx="channel.channel-view.channel-view-scaffold.content-grid">
				{showMemberListDivider && (
					<div
						className={styles.memberListDivider}
						data-flx="channel.channel-view.channel-view-scaffold.member-list-divider"
					/>
				)}
				<div
					className={styles.chatAreaSlot}
					aria-hidden={chatAreaInert ? true : undefined}
					inert={chatAreaInert ? true : undefined}
					data-flx="channel.channel-view.channel-view-scaffold.chat-area-slot"
				>
					{chatArea}
				</div>
				{sidePanel}
			</div>
		</div>
	);
};
