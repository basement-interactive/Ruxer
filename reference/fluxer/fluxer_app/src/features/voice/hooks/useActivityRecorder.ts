// SPDX-License-Identifier: AGPL-3.0-or-later

import Idle from '@app/features/ui/state/Idle';
import {useCallback, useRef} from 'react';

const DEFAULT_THROTTLE_INTERVAL = 2000;

interface UseActivityRecorderOptions {
	throttleInterval?: number;
}

export const useActivityRecorder = (options?: UseActivityRecorderOptions) => {
	const throttleInterval = options?.throttleInterval ?? DEFAULT_THROTTLE_INTERVAL;
	const lastActivityRef = useRef(0);
	return useCallback(
		(force = false) => {
			const now = Date.now();
			if (force || now - lastActivityRef.current > throttleInterval) {
				lastActivityRef.current = now;
				Idle.recordActivity();
			}
		},
		[throttleInterval],
	);
};
