// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createMediaControlsVisibilitySnapshot,
	getMediaControlsVisibilityValue,
	type MediaControlsVisibilityEvent,
	type MediaControlsVisibilitySignals,
	selectMediaControlsVisible,
	transitionMediaControlsVisibilitySnapshot,
} from '@app/features/voice/components/media_player/MediaControlsVisibilityStateMachine';
import {useCallback, useMemo, useState} from 'react';

interface UseControlsVisibilityOptions {
	autohideDelay?: number;
	disabled?: boolean;
	isPlaying?: boolean;
	isInteracting?: boolean;
}

export interface UseControlsVisibilityReturn {
	controlsVisible: boolean;
	showControls: () => void;
	hideControls: () => void;
	containerProps: {
		onMouseMove: () => void;
		onMouseEnter: () => void;
		onMouseLeave: () => void;
		onTouchStart: () => void;
	};
}

export function useControlsVisibility(options: UseControlsVisibilityOptions = {}): UseControlsVisibilityReturn {
	const {disabled = false, isPlaying = false, isInteracting = false} = options;
	const signals = useMemo<MediaControlsVisibilitySignals>(
		() => ({disabled, isPlaying, isInteracting}),
		[disabled, isPlaying, isInteracting],
	);
	const [snapshot, setSnapshot] = useState(createMediaControlsVisibilitySnapshot);
	const send = useCallback((event: MediaControlsVisibilityEvent) => {
		setSnapshot((currentSnapshot) => transitionMediaControlsVisibilitySnapshot(currentSnapshot, event));
	}, []);
	const showControls = useCallback(() => {
		send({type: 'controls.show'});
	}, [send]);
	const hideControls = useCallback(() => {
		send({type: 'controls.hide'});
	}, [send]);
	const visibilityValue = getMediaControlsVisibilityValue(snapshot);
	const handleMouseMove = useCallback(() => {
		if (visibilityValue === 'hidden') {
			send({type: 'controls.mouseMove'});
		}
	}, [send, visibilityValue]);
	const handleMouseEnter = useCallback(() => {
		send({type: 'controls.mouseEnter'});
	}, [send]);
	const handleMouseLeave = useCallback(() => {
		send({type: 'controls.mouseLeave', signals});
	}, [send, signals]);
	const handleTouchStart = useCallback(() => {
		send({type: 'controls.touchStart', signals});
	}, [send, signals]);
	const controlsVisible = selectMediaControlsVisible(snapshot, signals);
	return {
		controlsVisible,
		showControls,
		hideControls,
		containerProps: {
			onMouseMove: handleMouseMove,
			onMouseEnter: handleMouseEnter,
			onMouseLeave: handleMouseLeave,
			onTouchStart: handleTouchStart,
		},
	};
}
