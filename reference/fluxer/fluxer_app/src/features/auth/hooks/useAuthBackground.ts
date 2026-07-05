// SPDX-License-Identifier: AGPL-3.0-or-later

import {useEffect, useState} from 'react';

interface ImageDimensions {
	width: number;
	height: number;
}

interface PatternImageLoaderResult {
	patternReady: boolean;
}

interface SplashImageLoaderResult {
	loaded: boolean;
	dimensions: ImageDimensions | null;
}

interface AuthBackgroundResult {
	patternReady: boolean;
	splashLoaded: boolean;
	splashDimensions: ImageDimensions | null;
}

export function usePatternImageLoader(patternUrl: string): PatternImageLoaderResult {
	const [patternReady, setPatternReady] = useState(false);
	useEffect(() => {
		const img = new Image();
		const handleLoad = () => setPatternReady(true);
		img.addEventListener('load', handleLoad, {once: true});
		img.src = patternUrl;
		return () => img.removeEventListener('load', handleLoad);
	}, [patternUrl]);
	return {patternReady};
}

export function useSplashImageLoader(imageUrl: string | null): SplashImageLoaderResult {
	const [loaded, setLoaded] = useState(false);
	const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
	useEffect(() => {
		if (!imageUrl) {
			setLoaded(false);
			setDimensions(null);
			return;
		}
		let isMounted = true;
		const img = new Image();
		const handleLoad = () => {
			if (!isMounted) return;
			setLoaded(true);
			setDimensions({
				width: img.naturalWidth,
				height: img.naturalHeight,
			});
		};
		img.addEventListener('load', handleLoad, {once: true});
		img.src = imageUrl;
		return () => {
			isMounted = false;
		};
	}, [imageUrl]);
	return {loaded, dimensions};
}

export function useAuthBackground(splashUrl: string | null, patternUrl: string): AuthBackgroundResult {
	const {patternReady} = usePatternImageLoader(patternUrl);
	const {loaded: splashLoaded, dimensions: splashDimensions} = useSplashImageLoader(splashUrl);
	return {
		patternReady,
		splashLoaded,
		splashDimensions,
	};
}
