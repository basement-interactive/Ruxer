// SPDX-License-Identifier: AGPL-3.0-or-later

import {observeIntersection} from '@app/features/platform/utils/SharedIntersectionObserver';
import {LRUCache} from 'lru-cache';
import {useCallback, useEffect, useState} from 'react';

const DEFAULT_ROOT_MARGIN = '900px 0px';
const REMEMBERED_VIEWPORT_KEY_LIMIT = 1000;
const rememberedViewportKeys = new LRUCache<string, true>({
	max: REMEMBERED_VIEWPORT_KEY_LIMIT,
});

interface UseNearViewportOptions {
	disabled?: boolean;
	rememberKey?: string | null;
	rootMargin?: string;
	threshold?: number | Array<number>;
}

export function useNearViewport<T extends Element>({
	disabled = false,
	rememberKey,
	rootMargin = DEFAULT_ROOT_MARGIN,
	threshold = 0,
}: UseNearViewportOptions = {}): {ref: (node: T | null) => void; isNearViewport: boolean} {
	const loadImmediately = disabled || typeof IntersectionObserver === 'undefined';
	const wasRemembered = rememberKey ? rememberedViewportKeys.has(rememberKey) : false;
	const [element, setElement] = useState<T | null>(null);
	const [isNearViewport, setIsNearViewport] = useState(loadImmediately || wasRemembered);
	const ref = useCallback((node: T | null) => {
		setElement(node);
	}, []);
	useEffect(() => {
		if (disabled || typeof IntersectionObserver === 'undefined') {
			setIsNearViewport(true);
		}
	}, [disabled]);
	useEffect(() => {
		if (isNearViewport && rememberKey) {
			rememberedViewportKeys.set(rememberKey, true);
		}
	}, [isNearViewport, rememberKey]);
	useEffect(() => {
		if (disabled || isNearViewport || !element) return undefined;
		return observeIntersection(
			element,
			(entry) => {
				if (entry.isIntersecting || entry.intersectionRatio > 0) {
					if (rememberKey) {
						rememberedViewportKeys.set(rememberKey, true);
					}
					setIsNearViewport(true);
				}
			},
			{rootMargin, threshold},
		);
	}, [disabled, element, isNearViewport, rememberKey, rootMargin, threshold]);
	return {ref, isNearViewport};
}
