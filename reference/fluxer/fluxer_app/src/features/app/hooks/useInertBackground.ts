// SPDX-License-Identifier: AGPL-3.0-or-later

import {type RefObject, useEffect} from 'react';

export function useInertBackground(containerRef: RefObject<HTMLElement | null>, inert: boolean): void {
	useEffect(() => {
		const node = containerRef.current;
		if (!node) return;
		node.toggleAttribute('inert', inert);
		return () => {
			node.removeAttribute('inert');
		};
	}, [containerRef, inert]);
}
