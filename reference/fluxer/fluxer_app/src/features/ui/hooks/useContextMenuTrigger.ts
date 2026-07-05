// SPDX-License-Identifier: AGPL-3.0-or-later

import type {ContextMenuConfig} from '@app/features/ui/state/ContextMenu';
import {useCallback, useRef, useState} from 'react';

export interface ContextMenuTrigger {
	isOpen: boolean;
	withTracking: (config?: ContextMenuConfig) => ContextMenuConfig;
}

export function useContextMenuTrigger(): ContextMenuTrigger {
	const [isOpen, setIsOpen] = useState(false);
	const tokenRef = useRef(0);
	const withTracking = useCallback((config?: ContextMenuConfig): ContextMenuConfig => {
		tokenRef.current += 1;
		const token = tokenRef.current;
		setIsOpen(true);
		return {
			...config,
			onClose: () => {
				if (tokenRef.current === token) {
					setIsOpen(false);
				}
				config?.onClose?.();
			},
		};
	}, []);
	return {isOpen, withTracking};
}
