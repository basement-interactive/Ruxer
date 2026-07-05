// SPDX-License-Identifier: AGPL-3.0-or-later

import {GuildIcon} from '@app/features/guild/components/popouts/GuildIcon';
import type {Guild} from '@app/features/guild/models/Guild';
import {isKeyboardActivationKey} from '@app/features/input/utils/KeyboardUtils';
import userProfileModalStyles from '@app/features/user/components/modals/UserProfileModal.module.css';
import {Trans} from '@lingui/react/macro';
import {clsx} from 'clsx';
import type React from 'react';
import {useRef} from 'react';

interface MutualGuildItemProps {
	guild: Guild;
	nick: string | null;
	onClick: () => void;
	onContextMenu: (event: React.MouseEvent) => void;
	isContextMenuOpen: (target: EventTarget | null) => boolean;
}

export const MutualGuildItem: React.FC<MutualGuildItemProps> = ({
	guild,
	nick,
	onClick,
	onContextMenu,
	isContextMenuOpen,
}) => {
	const itemRef = useRef<HTMLDivElement>(null);
	const isActive = isContextMenuOpen(itemRef.current);
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
			data-flx="user.user-profile-modal.mutual-guild-item.button.click"
		>
			<div
				className={userProfileModalStyles.mutualItemIconFrame}
				data-flx="user.user-profile-modal.mutual-guild-item.icon-frame"
			>
				<GuildIcon
					id={guild.id}
					name={guild.name}
					icon={guild.icon}
					className={userProfileModalStyles.mutualGuildIcon}
					sizePx={40}
					data-flx="user.user-profile-modal.mutual-guild-item.guild-icon"
				/>
			</div>
			<div className={userProfileModalStyles.mutualFriendInfo} data-flx="user.user-profile-modal.mutual-guild-item.div">
				<span
					className={userProfileModalStyles.mutualFriendName}
					data-flx="user.user-profile-modal.mutual-guild-item.span"
				>
					{guild.name}
				</span>
				{nick && (
					<span
						className={userProfileModalStyles.mutualFriendUsername}
						data-flx="user.user-profile-modal.mutual-guild-item.span--2"
					>
						<span
							className={userProfileModalStyles.srOnly}
							data-flx="user.user-profile-modal.mutual-guild-item.span--3"
						>
							<Trans>Nickname: </Trans>
						</span>
						{nick}
					</span>
				)}
			</div>
		</div>
	);
};
