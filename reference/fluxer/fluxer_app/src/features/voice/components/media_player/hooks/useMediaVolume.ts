// SPDX-License-Identifier: AGPL-3.0-or-later

import AppStorage from '@app/features/platform/state/PersistentStorage';
import {
	DEFAULT_VOLUME,
	MUTE_STORAGE_KEY,
	VOLUME_STORAGE_KEY,
} from '@app/features/voice/components/media_player/utils/MediaConstants';
import {useCallback, useEffect, useRef, useState} from 'react';

interface UseMediaVolumeOptions {
	mediaRef: React.RefObject<HTMLMediaElement | null>;
	initialVolume?: number;
	initialMuted?: boolean;
	persist?: boolean;
	onVolumeChange?: (volume: number) => void;
	onMuteChange?: (muted: boolean) => void;
}

export interface UseMediaVolumeReturn {
	volume: number;
	isMuted: boolean;
	previousVolume: number;
	setVolume: (volume: number) => void;
	toggleMute: () => void;
	setMuted: (muted: boolean) => void;
	increaseVolume: (step?: number) => void;
	decreaseVolume: (step?: number) => void;
}

function getStoredVolume(): number {
	try {
		const stored = AppStorage.getItem(VOLUME_STORAGE_KEY);
		if (stored !== null) {
			const value = parseFloat(stored);
			if (Number.isFinite(value) && value >= 0 && value <= 1) {
				return value;
			}
		}
	} catch {}
	return DEFAULT_VOLUME;
}

function getStoredMuted(): boolean {
	try {
		return AppStorage.getItem(MUTE_STORAGE_KEY) === 'true';
	} catch {
		return false;
	}
}

function storeVolume(volume: number): void {
	try {
		AppStorage.setItem(VOLUME_STORAGE_KEY, volume.toString());
	} catch {}
}

function storeMuted(muted: boolean): void {
	try {
		AppStorage.setItem(MUTE_STORAGE_KEY, muted.toString());
	} catch {}
}

export function useMediaVolume(options: UseMediaVolumeOptions): UseMediaVolumeReturn {
	const {mediaRef, initialVolume, initialMuted, persist = true, onVolumeChange, onMuteChange} = options;
	const [volume, setVolumeState] = useState(() => initialVolume ?? (persist ? getStoredVolume() : DEFAULT_VOLUME));
	const [isMuted, setIsMutedState] = useState(() => initialMuted ?? (persist ? getStoredMuted() : false));
	const previousVolumeRef = useRef(volume > 0 ? volume : DEFAULT_VOLUME);
	useEffect(() => {
		const media = mediaRef.current;
		if (!media) return;
		media.volume = volume;
		media.muted = isMuted;
		const handleVolumeChange = () => {
			const newVolume = media.volume;
			const newMuted = media.muted;
			setVolumeState(newVolume);
			setIsMutedState(newMuted);
			if (newVolume > 0) {
				previousVolumeRef.current = newVolume;
			}
		};
		media.addEventListener('volumechange', handleVolumeChange);
		return () => {
			media.removeEventListener('volumechange', handleVolumeChange);
		};
	}, [mediaRef, volume, isMuted]);
	const setVolume = useCallback(
		(newVolume: number) => {
			const media = mediaRef.current;
			const clampedVolume = Math.max(0, Math.min(1, newVolume));
			if (media) {
				media.volume = clampedVolume;
			}
			setVolumeState(clampedVolume);
			if (clampedVolume > 0) {
				previousVolumeRef.current = clampedVolume;
			}
			if (persist) {
				storeVolume(clampedVolume);
			}
			onVolumeChange?.(clampedVolume);
		},
		[mediaRef, persist, onVolumeChange],
	);
	const setMuted = useCallback(
		(muted: boolean) => {
			const media = mediaRef.current;
			if (media) {
				media.muted = muted;
				if (!muted && media.volume === 0) {
					media.volume = previousVolumeRef.current;
					setVolumeState(previousVolumeRef.current);
				}
			}
			setIsMutedState(muted);
			if (persist) {
				storeMuted(muted);
			}
			onMuteChange?.(muted);
		},
		[mediaRef, persist, onMuteChange],
	);
	const toggleMute = useCallback(() => {
		setMuted(!isMuted);
	}, [isMuted, setMuted]);
	const increaseVolume = useCallback(
		(step = 0.1) => {
			setVolume(Math.min(1, volume + step));
		},
		[volume, setVolume],
	);
	const decreaseVolume = useCallback(
		(step = 0.1) => {
			setVolume(Math.max(0, volume - step));
		},
		[volume, setVolume],
	);
	return {
		volume,
		isMuted,
		previousVolume: previousVolumeRef.current,
		setVolume,
		toggleMute,
		setMuted,
		increaseVolume,
		decreaseVolume,
	};
}
