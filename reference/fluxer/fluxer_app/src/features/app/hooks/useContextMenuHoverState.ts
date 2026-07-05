// SPDX-License-Identifier: AGPL-3.0-or-later

import ContextMenu, {isContextMenuNodeTarget} from '@app/features/ui/state/ContextMenu';
import {autorun} from 'mobx';
import {type RefObject, useEffect, useState} from 'react';

export function useContextMenuHoverState(elementRef: RefObject<HTMLElement | null>, enabled: boolean = true): boolean {
	const [contextMenuOpen, setContextMenuOpen] = useState(false);
	useEffect(() => {
		if (!enabled) {
			setContextMenuOpen(false);
			return;
		}
		const disposer = autorun(() => {
			const contextMenu = ContextMenu.contextMenu;
			const target = contextMenu?.target?.target ?? null;
			const element = elementRef.current;
			const isOpen = Boolean(contextMenu) && isContextMenuNodeTarget(target) && Boolean(element?.contains(target));
			setContextMenuOpen(isOpen);
		});
		return () => disposer();
	}, [elementRef, enabled]);
	return contextMenuOpen;
}
