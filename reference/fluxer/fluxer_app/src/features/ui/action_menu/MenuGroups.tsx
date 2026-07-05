// SPDX-License-Identifier: AGPL-3.0-or-later

import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {observer} from 'mobx-react-lite';
import React from 'react';

interface MenuGroupsProps {
	children?: React.ReactNode;
}

export const MenuGroups: React.FC<MenuGroupsProps> = observer(({children}) => {
	const groups = React.Children.toArray(children).filter((child) => {
		if (!child) return false;
		if (!React.isValidElement(child)) return false;
		return child.type === MenuGroup;
	});
	if (groups.length === 0) {
		return null;
	}
	return (
		<>
			{groups.map((group, index) => (
				<React.Fragment key={index}>{group}</React.Fragment>
			))}
		</>
	);
});
