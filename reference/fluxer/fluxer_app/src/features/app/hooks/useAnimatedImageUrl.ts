// SPDX-License-Identifier: AGPL-3.0-or-later

import {useHover} from '@app/features/app/hooks/useHover';
import {type ShouldAnimateKind, useShouldAnimate} from '@app/features/app/hooks/useShouldAnimate';
import * as ImageCacheUtils from '@app/features/messaging/utils/ImageCacheUtils';
import UserSettings from '@app/features/user/state/UserSettings';
import type React from 'react';
import {useEffect, useState} from 'react';

interface UseAnimatedImageUrlOptions {
	staticUrl: string | null;
	animatedUrl?: string | null;
	kind: ShouldAnimateKind;
	isFocused?: boolean;
}

interface AnimatedImageUrlState {
	hoverRef: React.RefCallback<HTMLElement>;
	imageUrl: string | null;
	shouldAnimate: boolean;
	showGifIndicator: boolean;
}

export function useAnimatedImageUrl({
	staticUrl,
	animatedUrl,
	kind,
	isFocused,
}: UseAnimatedImageUrlOptions): AnimatedImageUrlState {
	const [hoverRef, isHovering] = useHover();
	const shouldAnimate = useShouldAnimate({kind, isHovering, isFocused});
	const gifAutoPlayEnabled = kind === 'gif' && UserSettings.getGifAutoPlay();
	const hasAnimatedUrl = Boolean(animatedUrl && animatedUrl !== staticUrl);
	const [isAnimatedLoaded, setIsAnimatedLoaded] = useState(() => ImageCacheUtils.hasImage(animatedUrl ?? null));
	useEffect(() => {
		setIsAnimatedLoaded(ImageCacheUtils.hasImage(animatedUrl ?? null));
	}, [animatedUrl]);
	useEffect(() => {
		if (!shouldAnimate || !animatedUrl || isAnimatedLoaded) {
			return;
		}
		let cancelled = false;
		ImageCacheUtils.loadImage(animatedUrl, () => {
			if (!cancelled) {
				setIsAnimatedLoaded(true);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [animatedUrl, isAnimatedLoaded, shouldAnimate]);
	const imageUrl = shouldAnimate && animatedUrl && isAnimatedLoaded ? animatedUrl : staticUrl;
	const showGifIndicator = kind === 'gif' && hasAnimatedUrl && !gifAutoPlayEnabled && !shouldAnimate;
	return {hoverRef, imageUrl, shouldAnimate, showGifIndicator};
}
