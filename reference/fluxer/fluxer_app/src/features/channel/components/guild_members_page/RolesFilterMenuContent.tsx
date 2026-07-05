// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/GuildMembersPage.module.css';
import type {GuildRole} from '@app/features/guild/models/GuildRole';
import * as ColorUtils from '@app/features/theme/utils/ColorUtils';
import {CheckboxItem, ContextMenuCloseProvider, MenuItem} from '@app/features/ui/action_menu/ContextMenu';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {openRoleContextMenu} from '@app/features/ui/action_menu/RoleContextMenu';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import type React from 'react';
import {useCallback, useState} from 'react';

const CLEAR_ALL_DESCRIPTOR = msg({
	message: 'Clear all',
	comment: 'Button that removes all active filters on the community members page.',
});

export interface RolesFilterMenuContentProps {
	roles: ReadonlyArray<GuildRole>;
	initialRoleFilter: ReadonlyArray<string>;
	setRoleFilter: React.Dispatch<React.SetStateAction<Array<string>>>;
	onClose: () => void;
}

export function RolesFilterMenuContent({
	roles,
	initialRoleFilter,
	setRoleFilter,
	onClose,
}: RolesFilterMenuContentProps) {
	const {i18n} = useLingui();
	const [localFilter, setLocalFilter] = useState<Array<string>>(() => [...initialRoleFilter]);
	const handleClear = useCallback(() => {
		setLocalFilter([]);
		setRoleFilter([]);
	}, [setRoleFilter]);
	const handleToggle = useCallback(
		(roleId: string) => {
			const updater = (prev: Array<string>) =>
				prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId];
			setLocalFilter(updater);
			setRoleFilter(updater);
		},
		[setRoleFilter],
	);
	return (
		<ContextMenuCloseProvider
			value={onClose}
			data-flx="channel.guild-members-page.roles-filter-menu-content.context-menu-close-provider"
		>
			<MenuGroup data-flx="channel.guild-members-page.roles-filter-menu-content.menu-group">
				<MenuItem
					label={i18n._(CLEAR_ALL_DESCRIPTOR)}
					closeOnSelect={false}
					disabled={localFilter.length === 0}
					onSelect={handleClear}
					data-flx="channel.guild-members-page.roles-filter-menu-content.menu-item.clear"
				/>
			</MenuGroup>
			<MenuGroup data-flx="channel.guild-members-page.roles-filter-menu-content.menu-group--2">
				{roles.map((role) => (
					<CheckboxItem
						key={role.id}
						checked={localFilter.includes(role.id)}
						onCheckedChange={() => handleToggle(role.id)}
						data-flx="channel.guild-members-page.roles-filter-menu-content.checkbox-item"
					>
						{/* biome-ignore lint/a11y/noStaticElementInteractions: context-menu affordance inside a CheckboxItem. */}
						<div
							className={styles.roleFilterItem}
							onContextMenu={(event) => openRoleContextMenu(event, role.id)}
							data-flx="channel.guild-members-page.roles-filter-menu-content.role-filter-item.open-role-context-menu"
						>
							<span
								className={styles.roleFilterDot}
								style={{backgroundColor: role.color ? ColorUtils.int2rgb(role.color) : 'var(--text-tertiary)'}}
								data-flx="channel.guild-members-page.roles-filter-menu-content.role-filter-dot"
							/>
							{role.name}
						</div>
					</CheckboxItem>
				))}
			</MenuGroup>
		</ContextMenuCloseProvider>
	);
}
