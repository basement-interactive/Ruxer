// SPDX-License-Identifier: AGPL-3.0-or-later

import {useEffect} from 'react';

export function useDocumentClassToggle(className: string, enabled: boolean): void {
	useEffect(() => {
		const root = document.documentElement;
		root.classList.toggle(className, enabled);
		return () => {
			root.classList.remove(className);
		};
	}, [className, enabled]);
}
