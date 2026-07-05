// SPDX-License-Identifier: AGPL-3.0-or-later

import {SubMenu} from '@app/features/ui/action_menu/ContextMenu';
import {observer} from 'mobx-react-lite';
// biome-ignore lint/style/useImportType: this file's JSX transform still needs the runtime React binding.
import React from 'react';

interface MenuItemSubmenuProps {
	label: string;
	disabled?: boolean;
	hint?: string;
	danger?: boolean;
	render: () => React.ReactNode;
	onTriggerSelect?: () => void;
}

export const MenuItemSubmenu: React.FC<MenuItemSubmenuProps> = observer(
	({label, disabled = false, hint, danger = false, render, onTriggerSelect}) => {
		return (
			<SubMenu
				label={label}
				disabled={disabled}
				hint={hint}
				danger={danger}
				onTriggerSelect={onTriggerSelect}
				render={render}
				data-flx="ui.action-menu.menu-item-submenu.sub-menu"
			/>
		);
	},
);
