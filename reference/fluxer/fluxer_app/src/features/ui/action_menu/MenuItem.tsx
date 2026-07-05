// SPDX-License-Identifier: AGPL-3.0-or-later

import {type ContextMenuActionEvent, MenuItem as MenuItemPrimitive} from '@app/features/ui/action_menu/ContextMenu';
import React, {useCallback} from 'react';

type MenuItemSelectEvent = ContextMenuActionEvent;

interface MenuItemProps {
	children?: React.ReactNode;
	icon?: React.ReactNode;
	danger?: boolean;
	disabled?: boolean;
	onClick?: ((event: MenuItemSelectEvent) => void) | (() => void);
	hint?: React.ReactNode;
	shortcut?: React.ReactNode;
	className?: string;
	closeOnSelect?: boolean;
}

const stringFromChildren = (children: React.ReactNode): string => {
	if (typeof children === 'string') return children;
	if (typeof children === 'number') return String(children);
	if (Array.isArray(children)) return children.map(stringFromChildren).join('');
	if (React.isValidElement(children)) {
		return stringFromChildren((children.props as {children?: React.ReactNode}).children);
	}
	return '';
};
export const MenuItem = React.forwardRef<HTMLDivElement, MenuItemProps>(
	(
		{children, icon, danger = false, disabled = false, onClick, hint, shortcut, className, closeOnSelect = true},
		ref,
	) => {
		const handleSelect = useCallback(
			(event: MenuItemSelectEvent) => {
				if (!onClick) return;
				if (onClick.length === 0) {
					(onClick as () => void)();
					return;
				}
				(onClick as (event: MenuItemSelectEvent) => void)(event);
			},
			[onClick],
		);
		return (
			<MenuItemPrimitive
				ref={ref}
				label={stringFromChildren(children)}
				className={className}
				disabled={disabled}
				onSelect={handleSelect}
				danger={danger}
				icon={icon}
				closeOnSelect={closeOnSelect}
				hint={hint}
				shortcut={shortcut}
				data-flx="ui.action-menu.menu-item.menu-item-primitive.select"
			>
				{children}
			</MenuItemPrimitive>
		);
	},
);

MenuItem.displayName = 'MenuItem';
