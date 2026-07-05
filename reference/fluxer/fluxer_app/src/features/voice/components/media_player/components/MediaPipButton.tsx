// SPDX-License-Identifier: AGPL-3.0-or-later

import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import styles from '@app/features/voice/components/media_player/MediaPlayButton.module.css';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {PictureInPictureIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import type React from 'react';
import {useCallback} from 'react';

const EXIT_PICTURE_IN_PICTURE_DESCRIPTOR = msg({
	message: 'Exit picture-in-picture',
	comment: 'Tooltip / aria label on the picture-in-picture toggle in the media player (currently in PiP).',
});
const ENTER_PICTURE_IN_PICTURE_DESCRIPTOR = msg({
	message: 'Enter picture-in-picture',
	comment: 'Tooltip / aria label on the picture-in-picture toggle in the media player (not in PiP).',
});

interface MediaPipButtonProps {
	isPiP: boolean;
	supportsPiP?: boolean;
	onToggle: () => void;
	iconSize?: number;
	size?: 'small' | 'medium' | 'large';
	showTooltip?: boolean;
	className?: string;
}

export function MediaPipButton({
	isPiP,
	supportsPiP = true,
	onToggle,
	iconSize = 20,
	size = 'medium',
	showTooltip = true,
	className,
}: MediaPipButtonProps) {
	const {i18n} = useLingui();
	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			onToggle();
		},
		[onToggle],
	);
	if (!supportsPiP) {
		return null;
	}
	const label = isPiP ? i18n._(EXIT_PICTURE_IN_PICTURE_DESCRIPTOR) : i18n._(ENTER_PICTURE_IN_PICTURE_DESCRIPTOR);
	const button = (
		<FocusRing offset={-2} data-flx="voice.media-player.media-pip-button.focus-ring">
			<button
				type="button"
				onClick={handleClick}
				className={clsx(styles.button, styles[size], className)}
				aria-label={label}
				data-flx="voice.media-player.media-pip-button.button.click"
			>
				<PictureInPictureIcon
					size={iconSize}
					weight={isPiP ? 'fill' : 'bold'}
					data-flx="voice.media-player.media-pip-button.picture-in-picture-icon"
				/>
			</button>
		</FocusRing>
	);
	if (showTooltip) {
		return (
			<Tooltip
				text={label}
				position="top"
				openOnMountHover={false}
				data-flx="voice.media-player.media-pip-button.tooltip"
			>
				{button}
			</Tooltip>
		);
	}
	return button;
}
