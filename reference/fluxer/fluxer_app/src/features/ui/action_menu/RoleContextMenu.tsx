// SPDX-License-Identifier: AGPL-3.0-or-later

import {CopyRoleIdMenuItem} from '@app/features/ui/action_menu/items/CopyMenuItems';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import * as ContextMenuCommands from '@app/features/ui/commands/ContextMenuCommands';
import type React from 'react';

interface RoleContextMenuProps {
	roleId: string;
	onClose: () => void;
}

export const RoleContextMenu: React.FC<RoleContextMenuProps> = ({roleId, onClose}) => {
	return (
		<MenuGroup data-flx="ui.action-menu.role-context-menu.menu-group">
			<CopyRoleIdMenuItem
				roleId={roleId}
				onClose={onClose}
				data-flx="ui.action-menu.role-context-menu.copy-role-id-menu-item"
			/>
		</MenuGroup>
	);
};

export function openRoleContextMenu(event: React.MouseEvent | MouseEvent, roleId: string): void {
	ContextMenuCommands.openFromEvent(event, ({onClose}) => (
		<RoleContextMenu
			roleId={roleId}
			onClose={onClose}
			data-flx="ui.action-menu.role-context-menu.open-role-context-menu.role-context-menu"
		/>
	));
}

export function openRoleContextMenuForElement(element: HTMLElement, roleId: string): void {
	ContextMenuCommands.openForElement(element, ({onClose}) => (
		<RoleContextMenu
			roleId={roleId}
			onClose={onClose}
			data-flx="ui.action-menu.role-context-menu.open-role-context-menu-for-element.role-context-menu"
		/>
	));
}
