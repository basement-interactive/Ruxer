// SPDX-License-Identifier: AGPL-3.0-or-later

import {MenuGroup as MenuGroupPrimitive, MenuSeparator} from '@app/features/ui/action_menu/ContextMenu';
import {observer} from 'mobx-react-lite';
import React from 'react';

interface MenuGroupProps {
	children?: React.ReactNode;
}

export const MenuGroup: React.FC<MenuGroupProps> = observer(({children}) => {
	const validChildren = React.Children.toArray(children).filter((child): child is React.ReactElement => {
		if (!React.isValidElement(child)) return false;
		if (child.type === React.Fragment && !(child.props as {children?: React.ReactNode}).children) return false;
		return true;
	});
	if (validChildren.length === 0) {
		return null;
	}
	return (
		<>
			<MenuGroupPrimitive data-flx="ui.action-menu.menu-group.menu-group-primitive">{validChildren}</MenuGroupPrimitive>
			<MenuSeparator data-flx="ui.action-menu.menu-group.menu-separator" />
		</>
	);
});
