// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/modals/channel_tabs/ChannelPermissionsTab.module.css';
import type {Channel} from '@app/features/channel/models/Channel';
import {Button} from '@app/features/ui/button/Button';
import {Trans} from '@lingui/react/macro';
import {clsx} from 'clsx';
import type React from 'react';

interface SyncWithParentBannerProps {
	isSyncedWithParent: boolean;
	parentChannel: Channel | null | undefined;
	canManageChannels: boolean;
	canManageRoles: boolean;
	onSync: () => void;
	variant: 'mobile' | 'desktop';
}

export const SyncWithParentBanner: React.FC<SyncWithParentBannerProps> = ({
	isSyncedWithParent,
	parentChannel,
	canManageChannels,
	canManageRoles,
	onSync,
	variant,
}) => {
	const bannerSuffix = variant === 'mobile' ? '' : '--2';
	const innerDivSuffix = variant === 'mobile' ? '' : '--3';
	const strongSyncedSuffix = variant === 'mobile' ? '' : '--3';
	const strongUnsyncedSuffix = variant === 'mobile' ? '--2' : '--4';
	const buttonSuffix = variant === 'mobile' ? '' : '--2';
	return (
		<div
			className={clsx(styles.syncBanner, isSyncedWithParent ? styles.syncBannerSynced : styles.syncBannerUnsynced)}
			data-flx={`channel.channel-tabs.channel-permissions-tab.sync-banner${bannerSuffix}`}
		>
			<div data-flx={`channel.channel-tabs.channel-permissions-tab.div${innerDivSuffix}`}>
				{isSyncedWithParent ? (
					<Trans>
						This channel is synced with the parent category{' '}
						<strong data-flx={`channel.channel-tabs.channel-permissions-tab.strong${strongSyncedSuffix}`}>
							{parentChannel?.name}
						</strong>
						.
					</Trans>
				) : (
					<Trans>
						This channel is not synced with the parent category{' '}
						<strong data-flx={`channel.channel-tabs.channel-permissions-tab.strong${strongUnsyncedSuffix}`}>
							{parentChannel?.name}
						</strong>
						.
					</Trans>
				)}
			</div>
			{!isSyncedWithParent && (
				<Button
					small={true}
					onClick={onSync}
					disabled={!canManageChannels || !canManageRoles}
					data-flx={`channel.channel-tabs.channel-permissions-tab.button.sync-with-parent${buttonSuffix}`}
				>
					<Trans>Sync with category</Trans>
				</Button>
			)}
		</div>
	);
};
