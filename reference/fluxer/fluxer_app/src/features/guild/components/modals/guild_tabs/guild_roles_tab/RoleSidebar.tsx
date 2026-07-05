// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/guild/components/modals/guild_tabs/GuildRolesTab.module.css';
import {RoleItem} from '@app/features/guild/components/modals/guild_tabs/guild_roles_tab/RoleItem';
import {
	applyRoleUpdate,
	type RoleUpdate,
} from '@app/features/guild/components/modals/guild_tabs/guild_roles_tab/shared';
import type {RoleMovePreview} from '@app/features/guild/components/modals/guild_tabs/RoleMoveOperation';
import type {GuildRole} from '@app/features/guild/models/GuildRole';
import {ROLES_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import {Trans, useLingui} from '@lingui/react/macro';
import {ArrowsDownUpIcon, PlusIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {DndProvider} from 'react-dnd';
import {HTML5Backend} from 'react-dnd-html5-backend';

interface RoleSidebarProps {
	roles: Array<GuildRole>;
	hoistedRoles: Array<GuildRole>;
	selectedRoleId: string | null;
	isGuildOwner: boolean;
	canManageRoles: boolean;
	hoistOrderMode: boolean;
	hasCustomHoistOrder: boolean;
	roleUpdates: Map<string, RoleUpdate>;
	isRoleLocked: (role: GuildRole) => boolean;
	onSelectRole: (roleId: string) => void;
	onCreateRole: () => void;
	onEnterHoistOrderMode: () => void;
	onExitHoistOrderMode: () => void;
	onResetHoistOrder: () => void;
	onEvaluateRoleMove: (
		draggedRoleId: string,
		targetRoleId: string | null,
		position: 'before' | 'after',
	) => RoleMovePreview | null;
	onRoleDrop: (preview: RoleMovePreview) => void;
	onEvaluateHoistMove: (
		draggedRoleId: string,
		targetRoleId: string | null,
		position: 'before' | 'after',
	) => RoleMovePreview | null;
	onHoistDrop: (preview: RoleMovePreview) => void;
}

export const RoleSidebar: React.FC<RoleSidebarProps> = observer(
	({
		roles,
		hoistedRoles,
		selectedRoleId,
		isGuildOwner,
		canManageRoles,
		hoistOrderMode,
		hasCustomHoistOrder,
		roleUpdates,
		isRoleLocked,
		onSelectRole,
		onCreateRole,
		onEnterHoistOrderMode,
		onExitHoistOrderMode,
		onResetHoistOrder,
		onEvaluateRoleMove,
		onRoleDrop,
		onEvaluateHoistMove,
		onHoistDrop,
	}) => {
		const {i18n} = useLingui();
		if (hoistOrderMode) {
			return (
				<div data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.div">
					<div
						className={styles.leftTitle}
						style={{padding: '6px 8px'}}
						data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.left-title"
					>
						<Trans>Hoist order</Trans>
					</div>
					<div
						style={{padding: '0 8px 8px 8px', display: 'flex', gap: '8px', flexDirection: 'column'}}
						data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.div--2"
					>
						<Button
							variant="secondary"
							small={true}
							onClick={onExitHoistOrderMode}
							data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.button.set-hoist-order-mode"
						>
							<Trans>Back to roles</Trans>
						</Button>
						{hasCustomHoistOrder && (
							<Button
								variant="secondary"
								small={true}
								onClick={onResetHoistOrder}
								disabled={!canManageRoles}
								data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.button.reset-hoist-order"
							>
								<Trans>Reset to default</Trans>
							</Button>
						)}
					</div>
					<div style={{padding: '0 8px 8px 8px'}} data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.div--3">
						<p
							className={styles.subtleText}
							style={{marginBottom: '8px'}}
							data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.subtle-text"
						>
							<Trans>Drag roles to customize the order they appear in the member list.</Trans>
						</p>
						<DndProvider
							backend={HTML5Backend}
							data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.dnd-provider"
						>
							{hoistedRoles.map((role, index) => {
								const roleWithUpdates = applyRoleUpdate(role, roleUpdates.get(role.id));
								return (
									<RoleItem
										key={role.id}
										role={roleWithUpdates}
										isSelected={selectedRoleId === role.id}
										isLocked={isRoleLocked(role)}
										isGuildOwner={isGuildOwner}
										isTerminal={index === hoistedRoles.length - 1}
										canManageRoles={canManageRoles}
										onClick={() => onSelectRole(role.id)}
										onEvaluateMove={onEvaluateHoistMove}
										onCommitMove={onHoistDrop}
										data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.role-item.set-selected-role-id"
									/>
								);
							})}
							{hoistedRoles.length === 0 && (
								<p
									className={styles.subtleText}
									data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.subtle-text--2"
								>
									<Trans>No hoisted roles. Enable "Show this role separately" on a role to see it here.</Trans>
								</p>
							)}
						</DndProvider>
					</div>
				</div>
			);
		}
		return (
			<div data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.div--4">
				<div
					className={styles.leftTitle}
					style={{padding: '6px 8px'}}
					data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.left-title--2"
				>
					{i18n._(ROLES_DESCRIPTOR)}
				</div>
				<div
					style={{padding: '0 8px 8px 8px', display: 'flex', gap: '8px', flexDirection: 'column'}}
					data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.div--5"
				>
					<Button
						variant="secondary"
						small={true}
						leftIcon={
							<PlusIcon size={18} weight="bold" data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.plus-icon" />
						}
						onClick={onCreateRole}
						disabled={!canManageRoles}
						data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.button.create-role"
					>
						<Trans>Create role</Trans>
					</Button>
					{hoistedRoles.length > 0 && canManageRoles && (
						<Button
							variant="secondary"
							small={true}
							leftIcon={
								<ArrowsDownUpIcon
									size={18}
									weight="bold"
									data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.arrows-down-up-icon"
								/>
							}
							onClick={onEnterHoistOrderMode}
							data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.button.set-hoist-order-mode--2"
						>
							<Trans>Custom hoist order</Trans>
						</Button>
					)}
				</div>
				<div style={{padding: '0 8px 8px 8px'}} data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.div--6">
					<DndProvider
						backend={HTML5Backend}
						data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.dnd-provider--2"
					>
						{roles.map((role: GuildRole, index) => {
							const roleWithUpdates = applyRoleUpdate(role, roleUpdates.get(role.id));
							return (
								<RoleItem
									key={role.id}
									role={roleWithUpdates}
									isSelected={selectedRoleId === role.id}
									isLocked={isRoleLocked(role)}
									isGuildOwner={isGuildOwner}
									isTerminal={index === roles.length - 1}
									canManageRoles={canManageRoles}
									onClick={() => onSelectRole(role.id)}
									onEvaluateMove={onEvaluateRoleMove}
									onCommitMove={onRoleDrop}
									data-flx="guild.guild-tabs.guild-roles-tab.sidebar-content.role-item.set-selected-role-id--2"
								/>
							);
						})}
					</DndProvider>
				</div>
			</div>
		);
	},
);
