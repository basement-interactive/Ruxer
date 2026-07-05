// SPDX-License-Identifier: AGPL-3.0-or-later

import {routeMediaElementForSoundCapture} from '@app/features/voice/utils/InAppMediaSoundCapture';
import {type RefObject, useEffect} from 'react';

export function useInAppMediaSoundCapture(ref: RefObject<HTMLMediaElement | null>): void {
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		element.crossOrigin = element.crossOrigin ?? 'anonymous';
		const detach = routeMediaElementForSoundCapture(element);
		return () => {
			detach();
		};
	}, [ref]);
}
