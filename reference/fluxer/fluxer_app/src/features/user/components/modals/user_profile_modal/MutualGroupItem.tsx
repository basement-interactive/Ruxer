// SPDX-License-Identifier: AGPL-3.0-or-later

import {GroupDMAvatar} from '@app/features/app/components/shared/GroupDMAvatar';
import type {Channel} from '@app/features/channel/models/Channel';
import * as ChannelUtils from '@app/features/channel/utils/ChannelUtils';
import {isKeyboardActivationKey} from '@app/features/input/utils/KeyboardUtils';
import userProfileModalStyles from '@app/features/user/components/modals/UserProfileModal.module.css';
import {plural} from '@lingui/core/macro';
import {useLingui} from '@lingui/react';
import {clsx} from 'clsx';
import type React from 'react';
import {useRef} from 'react';

interface MutualGroupItemProps {
	group: Channel;
	onClick: () => void;
	onContextMenu: (event: React.MouseEvent) => void;
	isContextMenuOpen: (target: EventTarget | null) => boolean;
}

export const MutualGroupItem: React.FC<MutualGroupItemProps> = ({group, onClick, onContextMenu, isContextMenuOpen}) => {
	useLingui();
	const itemRef = useRef<HTMLDivElement>(null);
	const isActive = isContextMenuOpen(itemRef.current);
	const memberCount = group.recipientIds.length + 1;
	const memberLabel = plural(
		{count: memberCount},
		{
			one: '# member',
			other: '# members',
		},
	);
	return (
		<div
			ref={itemRef}
			className={clsx(userProfileModalStyles.mutualFriendItem, isActive && userProfileModalStyles.active)}
			onClick={onClick}
			onKeyDown={(event) => {
				if (!isKeyboardActivationKey(event.key)) return;
				event.preventDefault();
				onClick();
			}}
			onContextMenu={onContextMenu}
			role="button"
			tabIndex={0}
			data-flx="user.user-profile-modal.mutual-group-item.button.click"
		>
			<div
				className={userProfileModalStyles.mutualItemIconFrame}
				data-flx="user.user-profile-modal.mutual-group-item.icon-frame"
			>
				<GroupDMAvatar channel={group} size={40} data-flx="user.user-profile-modal.mutual-group-item.group-dm-avatar" />
			</div>
			<div className={userProfileModalStyles.mutualFriendInfo} data-flx="user.user-profile-modal.mutual-group-item.div">
				<span
					className={userProfileModalStyles.mutualFriendName}
					data-flx="user.user-profile-modal.mutual-group-item.span"
				>
					{ChannelUtils.getDMDisplayName(group)}
				</span>
				<span
					className={userProfileModalStyles.mutualFriendUsername}
					data-flx="user.user-profile-modal.mutual-group-item.span--2"
				>
					{memberLabel}
				</span>
			</div>
		</div>
	);
};
