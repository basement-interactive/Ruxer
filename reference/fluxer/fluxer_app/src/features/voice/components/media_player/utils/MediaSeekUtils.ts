// SPDX-License-Identifier: AGPL-3.0-or-later

export type SeekDirection = 'backward' | 'forward';

export interface SeekTapPoint {
	x: number;
	width: number;
	time: number;
}

export function clampPercentage(percentage: number): number {
	if (!Number.isFinite(percentage)) return 0;
	return Math.max(0, Math.min(100, percentage));
}

export function clampMediaTime(time: number, duration: number): number {
	if (!Number.isFinite(time)) return 0;
	if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, time);
	return Math.max(0, Math.min(duration, time));
}

export function getFiniteMediaDuration(media: HTMLMediaElement | null | undefined): number {
	if (!media || !Number.isFinite(media.duration) || media.duration <= 0) return 0;
	return media.duration;
}

export function getEffectiveMediaDuration(media: HTMLMediaElement | null | undefined, fallbackDuration = 0): number {
	return (
		getFiniteMediaDuration(media) || (Number.isFinite(fallbackDuration) && fallbackDuration > 0 ? fallbackDuration : 0)
	);
}

export function getSeekPercentageFromClientX(clientX: number, rect: Pick<DOMRect, 'left' | 'width'>): number {
	if (!Number.isFinite(rect.width) || rect.width <= 0) return 0;
	return clampPercentage(((clientX - rect.left) / rect.width) * 100);
}

export function getBufferedPercentage(media: HTMLMediaElement): number {
	const duration = getFiniteMediaDuration(media);
	if (!duration || !media.buffered.length) return 0;

	const currentTime = media.currentTime;
	let bufferedEnd = 0;
	for (let i = 0; i < media.buffered.length; i++) {
		const start = media.buffered.start(i);
		const end = media.buffered.end(i);
		if (currentTime >= start && currentTime <= end) {
			bufferedEnd = end;
			break;
		}
		if (end > bufferedEnd) {
			bufferedEnd = end;
		}
	}
	return clampPercentage((bufferedEnd / duration) * 100);
}

export function resolveDoubleTapSeekDirection(
	previousTap: SeekTapPoint | null,
	currentTap: SeekTapPoint,
	options: {
		maxIntervalMs?: number;
		sideZoneRatio?: number;
	} = {},
): SeekDirection | null {
	const {maxIntervalMs = 360, sideZoneRatio = 0.42} = options;
	if (!previousTap) return null;
	if (currentTap.time - previousTap.time > maxIntervalMs) return null;
	if (currentTap.width <= 0 || previousTap.width <= 0) return null;

	const currentRatio = currentTap.x / currentTap.width;
	const previousRatio = previousTap.x / previousTap.width;
	if (currentRatio <= sideZoneRatio && previousRatio <= sideZoneRatio) return 'backward';
	if (currentRatio >= 1 - sideZoneRatio && previousRatio >= 1 - sideZoneRatio) return 'forward';
	return null;
}
