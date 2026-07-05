// SPDX-License-Identifier: AGPL-3.0-or-later

import {type LegacyRef, type MutableRefObject, type RefCallback, useCallback, useRef} from 'react';

export function useMergeRefs<T>(
	refs: Array<MutableRefObject<T | null> | LegacyRef<T> | undefined | null>,
): RefCallback<T> {
	const latestRefs = useRef(refs);
	latestRefs.current = refs;
	return useCallback((value: T | null) => {
		for (const ref of latestRefs.current) {
			if (typeof ref === 'function') {
				ref(value);
			} else if (ref != null) {
				(ref as MutableRefObject<T | null>).current = value;
			}
		}
	}, []);
}
