// SPDX-License-Identifier: AGPL-3.0-or-later

import DeveloperOptions from '@app/features/devtools/state/DeveloperOptions';
import * as ImageCacheUtils from '@app/features/messaging/utils/ImageCacheUtils';
import {decodeThumbHashDataURL} from '@app/features/messaging/utils/ThumbHashUtils';
import {type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState} from 'react';

type MediaLoadingElement = HTMLImageElement | HTMLVideoElement;
type MediaElementStatus = 'loaded' | 'error' | 'pending';

export interface MediaLoadingState {
	loaded: boolean;
	error: boolean;
	cached: boolean;
	cachedOnMount: boolean;
	thumbHashURL?: string;
	ref: (element: MediaLoadingElement | null) => void;
	onLoad: (event?: SyntheticEvent<MediaLoadingElement>) => void;
	onError: () => void;
}

interface UseMediaLoadingOptions {
	enabled?: boolean;
}

function isImageElement(element: MediaLoadingElement): element is HTMLImageElement {
	return element.tagName === 'IMG';
}

function getMediaElementStatus(element: MediaLoadingElement | null): MediaElementStatus {
	if (!element) return 'pending';
	if (isImageElement(element)) {
		if (!element.currentSrc && !element.src) return 'pending';
		if (element.complete && element.naturalWidth > 0) return 'loaded';
		if (element.complete) return 'error';
		return 'pending';
	}
	if (element.error) return 'error';
	return element.readyState >= 2 ? 'loaded' : 'pending';
}

export function useMediaLoading(
	src: string,
	placeholder?: string,
	options: UseMediaLoadingOptions = {},
): MediaLoadingState {
	const {enabled = true} = options;
	const shouldForcePlaceholder = DeveloperOptions.forceRenderPlaceholders || DeveloperOptions.forceMediaLoading;
	const mediaElementRef = useRef<MediaLoadingElement | null>(null);
	const [cachedOnMount] = useState(() => src.length > 0 && ImageCacheUtils.hasImage(src));
	const [cached, setCached] = useState(() => src.length > 0 && ImageCacheUtils.hasImage(src));
	const [loadingState, setLoadingState] = useState<Pick<MediaLoadingState, 'error' | 'loaded'>>({
		loaded: false,
		error: false,
	});
	const thumbHashURL = useMemo(() => {
		return decodeThumbHashDataURL(placeholder);
	}, [placeholder]);
	const rememberElementLoad = useCallback(
		(element: MediaLoadingElement | null) => {
			if (element && isImageElement(element)) {
				ImageCacheUtils.rememberImage(src, element);
			} else {
				ImageCacheUtils.rememberImage(src);
			}
			setCached(true);
			setLoadingState({loaded: true, error: false});
		},
		[src],
	);
	const applyElementStatus = useCallback(
		(element: MediaLoadingElement | null): boolean => {
			const status = getMediaElementStatus(element);
			if (status === 'loaded') {
				rememberElementLoad(element);
				return true;
			}
			if (status === 'error') {
				ImageCacheUtils.forgetImage(src);
				setCached(false);
				setLoadingState((prev) => (prev.loaded ? prev : {loaded: false, error: true}));
				return true;
			}
			return false;
		},
		[rememberElementLoad, src],
	);
	const ref = useCallback(
		(element: MediaLoadingElement | null) => {
			mediaElementRef.current = element;
			if (!enabled || src.length === 0 || shouldForcePlaceholder) return;
			applyElementStatus(element);
		},
		[applyElementStatus, enabled, shouldForcePlaceholder, src],
	);
	useEffect(() => {
		if (!enabled || src.length === 0) {
			setCached(false);
			setLoadingState((currentState) =>
				currentState.loaded || currentState.error ? {loaded: false, error: false} : currentState,
			);
			return;
		}
		const isCached = ImageCacheUtils.hasImage(src);
		setCached(isCached);
		if (shouldForcePlaceholder) {
			setLoadingState((currentState) =>
				currentState.loaded || currentState.error ? {loaded: false, error: false} : currentState,
			);
			return;
		}
		if (applyElementStatus(mediaElementRef.current)) return;
		setLoadingState((currentState) =>
			currentState.loaded || currentState.error ? {loaded: false, error: false} : currentState,
		);
	}, [applyElementStatus, enabled, shouldForcePlaceholder, src]);
	const onLoad = useCallback(
		(event?: SyntheticEvent<MediaLoadingElement>) => {
			const element = event?.currentTarget ?? mediaElementRef.current;
			mediaElementRef.current = element;
			rememberElementLoad(element);
		},
		[rememberElementLoad],
	);
	const onError = useCallback(() => {
		ImageCacheUtils.forgetImage(src);
		setCached(false);
		setLoadingState((prev) => (prev.loaded ? prev : {loaded: false, error: true}));
	}, [src]);
	return {...loadingState, cached, cachedOnMount, thumbHashURL, ref, onLoad, onError};
}
