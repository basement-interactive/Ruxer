// SPDX-License-Identifier: AGPL-3.0-or-later

import {DEFAULT_ROLE_COLOR_HEX, getRoleColor} from '@app/features/app/components/dialogs/shared/PermissionComponents';
import styles from '@app/features/channel/components/modals/channel_tabs/ChannelPermissionsTab.module.css';
import type {PermissionOverwrite} from '@app/features/channel/components/modals/channel_tabs/channel_permissions_tab/shared';
import {openRoleContextMenu} from '@app/features/ui/action_menu/RoleContextMenu';
import {Avatar} from '@app/features/ui/components/Avatar';
import type {User} from '@app/features/user/models/User';
import {UsersIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

interface OverwriteItemProps {
	overwrite: PermissionOverwrite;
	name: string;
	color?: number;
	user?: User | null;
	roleId?: string | null;
	isSelected: boolean;
	isEveryone: boolean;
	onClick: () => void;
	guildId: string;
}

export const OverwriteItem: React.FC<OverwriteItemProps> = observer(
	({overwrite, name, color, user, roleId, isSelected, isEveryone, onClick, guildId}) => {
		const handleContextMenu = useCallback(
			(event: React.MouseEvent<HTMLButtonElement>) => {
				if (!roleId) return;
				openRoleContextMenu(event, roleId);
			},
			[roleId],
		);
		return (
			<button
				type="button"
				aria-pressed={isSelected}
				className={clsx(styles.overwriteItem, {[styles.overwriteItemSelected]: isSelected})}
				onClick={onClick}
				onContextMenu={roleId ? handleContextMenu : undefined}
				data-flx="channel.channel-tabs.channel-permissions-tab.overwrite-item.overwrite-item.click.button"
			>
				{overwrite.type === 0 && !isEveryone ? (
					<div
						className={styles.roleDot}
						style={{backgroundColor: color === 0 ? DEFAULT_ROLE_COLOR_HEX : getRoleColor(color || 0)}}
						data-flx="channel.channel-tabs.channel-permissions-tab.overwrite-item.role-dot"
					/>
				) : overwrite.type === 1 && user ? (
					<Avatar
						user={user}
						size={12}
						className={styles.overwriteIcon}
						guildId={guildId}
						data-flx="channel.channel-tabs.channel-permissions-tab.overwrite-item.overwrite-icon"
					/>
				) : (
					<UsersIcon
						className={styles.overwriteIcon}
						data-flx="channel.channel-tabs.channel-permissions-tab.overwrite-item.overwrite-icon--2"
					/>
				)}
				<span
					className={styles.overwriteName}
					data-flx="channel.channel-tabs.channel-permissions-tab.overwrite-item.overwrite-name"
				>
					{name}
				</span>
			</button>
		);
	},
);
