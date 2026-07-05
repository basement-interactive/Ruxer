// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	clampMediaTime,
	clampPercentage,
	getBufferedPercentage,
	getEffectiveMediaDuration,
} from '@app/features/voice/components/media_player/utils/MediaSeekUtils';
import {useCallback, useEffect, useRef, useState} from 'react';

interface UseMediaProgressOptions {
	mediaRef: React.RefObject<HTMLMediaElement | null>;
	initialDuration?: number;
	updateInterval?: number;
	useRAF?: boolean;
}

export interface UseMediaProgressReturn {
	currentTime: number;
	duration: number;
	progress: number;
	buffered: number;
	isSeeking: boolean;
	previewSeekToPercentage: (percentage: number) => void;
	seekToPercentage: (percentage: number) => void;
	seekToTime: (time: number) => void;
	startSeeking: () => void;
	endSeeking: () => void;
}

export function useMediaProgress(options: UseMediaProgressOptions): UseMediaProgressReturn {
	const {mediaRef, initialDuration, updateInterval = 100, useRAF = true} = options;
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(initialDuration ?? 0);
	const [buffered, setBuffered] = useState(0);
	const [isSeeking, setIsSeeking] = useState(false);
	const [pendingProgress, setPendingProgress] = useState<number | null>(null);
	const rafRef = useRef<number | null>(null);
	const intervalRef = useRef<number | null>(null);
	const isSeekingRef = useRef(false);
	const fallbackDurationRef = useRef(initialDuration ?? 0);
	const pendingSeekPercentageRef = useRef<number | null>(null);
	const lastRafUpdateAtRef = useRef(0);
	useEffect(() => {
		fallbackDurationRef.current = initialDuration ?? 0;
	}, [initialDuration]);
	const setCurrentTimeIfChanged = useCallback((nextCurrentTime: number) => {
		setCurrentTime((previousCurrentTime) =>
			previousCurrentTime === nextCurrentTime ? previousCurrentTime : nextCurrentTime,
		);
	}, []);
	const setDurationFromMedia = useCallback((rawDuration: number) => {
		const hasRealDuration = Number.isFinite(rawDuration) && rawDuration > 0;
		setDuration((previousDuration) => {
			const nextDuration = hasRealDuration
				? rawDuration
				: previousDuration > 0
					? previousDuration
					: fallbackDurationRef.current;
			return previousDuration === nextDuration ? previousDuration : nextDuration;
		});
	}, []);
	const setBufferedIfChanged = useCallback((nextBuffered: number) => {
		setBuffered((previousBuffered) => (previousBuffered === nextBuffered ? previousBuffered : nextBuffered));
	}, []);
	const setPendingProgressIfChanged = useCallback((nextProgress: number | null) => {
		setPendingProgress((previousProgress) => (previousProgress === nextProgress ? previousProgress : nextProgress));
	}, []);
	const updateProgress = useCallback(() => {
		const media = mediaRef.current;
		if (!media || isSeekingRef.current) return;
		if (pendingSeekPercentageRef.current !== null) return;
		const newCurrentTime = media.currentTime;
		const rawDuration = media.duration;
		const newBuffered = getBufferedPercentage(media);
		setCurrentTimeIfChanged(newCurrentTime);
		setDurationFromMedia(rawDuration);
		setBufferedIfChanged(newBuffered);
	}, [mediaRef, setBufferedIfChanged, setCurrentTimeIfChanged, setDurationFromMedia]);
	useEffect(() => {
		const media = mediaRef.current;
		if (!media) return;
		updateProgress();
		const cancelRaf = () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};
		const cancelInterval = () => {
			if (intervalRef.current !== null) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
		const startRaf = () => {
			if (rafRef.current !== null) return;
			const tick = (timestamp: number) => {
				if (timestamp - lastRafUpdateAtRef.current >= updateInterval) {
					lastRafUpdateAtRef.current = timestamp;
					updateProgress();
				}
				if (!media.paused && !media.ended) {
					rafRef.current = requestAnimationFrame(tick);
				} else {
					rafRef.current = null;
				}
			};
			rafRef.current = requestAnimationFrame(tick);
		};
		const startInterval = () => {
			if (intervalRef.current !== null) return;
			intervalRef.current = window.setInterval(updateProgress, updateInterval);
		};
		const startProgressUpdates = () => {
			updateProgress();
			if (useRAF) {
				startRaf();
			} else {
				startInterval();
			}
		};
		const stopProgressUpdates = () => {
			updateProgress();
			cancelRaf();
			cancelInterval();
		};
		const handleLoadedMetadata = () => {
			const rawDuration = media.duration;
			if (Number.isFinite(rawDuration) && rawDuration > 0) {
				setDuration((previousDuration) => (previousDuration === rawDuration ? previousDuration : rawDuration));
				if (pendingSeekPercentageRef.current !== null) {
					const time = (pendingSeekPercentageRef.current / 100) * rawDuration;
					media.currentTime = time;
					setCurrentTimeIfChanged(time);
					pendingSeekPercentageRef.current = null;
					setPendingProgressIfChanged(null);
				}
				return;
			}
			setDuration((previousDuration) => (previousDuration > 0 ? previousDuration : fallbackDurationRef.current));
		};
		const handleProgress = () => {
			setBufferedIfChanged(getBufferedPercentage(media));
		};
		const handleTimeUpdate = () => {
			if (!isSeekingRef.current && pendingSeekPercentageRef.current === null) {
				setCurrentTimeIfChanged(media.currentTime);
			}
		};
		const handleSeeking = () => {
			if (!isSeekingRef.current) {
				setIsSeeking(true);
			}
		};
		const handleSeeked = () => {
			if (!isSeekingRef.current) {
				setIsSeeking(false);
			}
			setCurrentTimeIfChanged(media.currentTime);
		};
		media.addEventListener('loadedmetadata', handleLoadedMetadata);
		media.addEventListener('progress', handleProgress);
		media.addEventListener('timeupdate', handleTimeUpdate);
		media.addEventListener('seeking', handleSeeking);
		media.addEventListener('seeked', handleSeeked);
		media.addEventListener('play', startProgressUpdates);
		media.addEventListener('playing', startProgressUpdates);
		media.addEventListener('pause', stopProgressUpdates);
		media.addEventListener('ended', stopProgressUpdates);
		if (!media.paused && !media.ended) {
			startProgressUpdates();
		}
		return () => {
			media.removeEventListener('loadedmetadata', handleLoadedMetadata);
			media.removeEventListener('progress', handleProgress);
			media.removeEventListener('timeupdate', handleTimeUpdate);
			media.removeEventListener('seeking', handleSeeking);
			media.removeEventListener('seeked', handleSeeked);
			media.removeEventListener('play', startProgressUpdates);
			media.removeEventListener('playing', startProgressUpdates);
			media.removeEventListener('pause', stopProgressUpdates);
			media.removeEventListener('ended', stopProgressUpdates);
			cancelRaf();
			cancelInterval();
		};
	}, [
		mediaRef,
		setBufferedIfChanged,
		setCurrentTimeIfChanged,
		setPendingProgressIfChanged,
		updateProgress,
		updateInterval,
		useRAF,
	]);
	const previewSeekToPercentage = useCallback(
		(percentage: number) => {
			const clampedPercentage = clampPercentage(percentage);
			setPendingProgressIfChanged(clampedPercentage);
			const effectiveDuration = getEffectiveMediaDuration(mediaRef.current, fallbackDurationRef.current);
			if (effectiveDuration > 0) {
				setCurrentTimeIfChanged((clampedPercentage / 100) * effectiveDuration);
			}
		},
		[mediaRef, setCurrentTimeIfChanged, setPendingProgressIfChanged],
	);
	const seekToPercentage = useCallback(
		(percentage: number) => {
			const media = mediaRef.current;
			const clampedPercentage = clampPercentage(percentage);
			const effectiveDuration = getEffectiveMediaDuration(media, 0);
			if (media && effectiveDuration > 0) {
				const time = (clampedPercentage / 100) * effectiveDuration;
				media.currentTime = time;
				setCurrentTimeIfChanged(time);
				pendingSeekPercentageRef.current = null;
				setPendingProgressIfChanged(null);
				return;
			}
			pendingSeekPercentageRef.current = clampedPercentage;
			setPendingProgressIfChanged(clampedPercentage);
			const fallbackDuration = fallbackDurationRef.current;
			if (fallbackDuration > 0) {
				setCurrentTimeIfChanged((clampedPercentage / 100) * fallbackDuration);
			}
		},
		[mediaRef, setCurrentTimeIfChanged, setPendingProgressIfChanged],
	);
	const seekToTime = useCallback(
		(time: number) => {
			const media = mediaRef.current;
			if (!media) return;
			const clampedTime = clampMediaTime(time, media.duration);
			media.currentTime = clampedTime;
			setCurrentTimeIfChanged(clampedTime);
		},
		[mediaRef, setCurrentTimeIfChanged],
	);
	const startSeeking = useCallback(() => {
		isSeekingRef.current = true;
		setIsSeeking(true);
	}, []);
	const endSeeking = useCallback(() => {
		isSeekingRef.current = false;
		setIsSeeking(false);
	}, []);
	const progress = pendingProgress !== null ? pendingProgress : duration > 0 ? (currentTime / duration) * 100 : 0;
	return {
		currentTime,
		duration,
		progress,
		buffered,
		isSeeking,
		previewSeekToPercentage,
		seekToPercentage,
		seekToTime,
		startSeeking,
		endSeeking,
	};
}
