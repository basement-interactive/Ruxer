// SPDX-License-Identifier: AGPL-3.0-or-later

import {getFullscreenElement} from '@app/features/platform/utils/FullscreenMediaUtils';
import {useEffect, useState} from 'react';

function isRootDocumentFullscreenNow(): boolean {
	if (typeof document === 'undefined') return false;
	return getFullscreenElement() === document.documentElement;
}

export function useIsRootDocumentFullscreen(): boolean {
	const [isFullscreen, setIsFullscreen] = useState<boolean>(() => isRootDocumentFullscreenNow());
	useEffect(() => {
		const update = () => setIsFullscreen(isRootDocumentFullscreenNow());
		document.addEventListener('fullscreenchange', update);
		document.addEventListener('webkitfullscreenchange', update);
		document.addEventListener('mozfullscreenchange', update);
		document.addEventListener('MSFullscreenChange', update);
		update();
		return () => {
			document.removeEventListener('fullscreenchange', update);
			document.removeEventListener('webkitfullscreenchange', update);
			document.removeEventListener('mozfullscreenchange', update);
			document.removeEventListener('MSFullscreenChange', update);
		};
	}, []);
	return isFullscreen;
}
