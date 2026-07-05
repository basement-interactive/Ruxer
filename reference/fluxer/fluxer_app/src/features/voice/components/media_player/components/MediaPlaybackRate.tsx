// SPDX-License-Identifier: AGPL-3.0-or-later

import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import styles from '@app/features/voice/components/media_player/MediaPlaybackRate.module.css';
import {
	AUDIO_PLAYBACK_RATES,
	VIDEO_PLAYBACK_RATES,
} from '@app/features/voice/components/media_player/utils/MediaConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import type React from 'react';
import {useCallback, useMemo} from 'react';

const PLAYBACK_SPEED_DESCRIPTOR = msg({
	message: 'Playback speed: {formattedRate}',
	comment:
		'Tooltip / aria label on the playback rate button in the media player. {formattedRate} is the current rate, e.g. 1.5x.',
});
const PLAYBACK_SPEED_2_DESCRIPTOR = msg({
	message: 'Playback speed',
	comment: 'Section / menu header above the playback rate options in the media player.',
});

interface MediaPlaybackRateProps {
	rate: number;
	onRateChange: (rate: number) => void;
	rates?: ReadonlyArray<number>;
	isAudio?: boolean;
	size?: 'small' | 'medium' | 'large';
	showTooltip?: boolean;
	className?: string;
}

function formatRate(rate: number): string {
	if (rate === 1) return '1x';
	if (Number.isInteger(rate)) return `${rate}x`;
	return `${rate}x`;
}

export function MediaPlaybackRate({
	rate,
	onRateChange,
	rates,
	isAudio = false,
	size = 'medium',
	showTooltip = true,
	className,
}: MediaPlaybackRateProps) {
	const {i18n} = useLingui();
	const availableRates = useMemo(() => {
		if (rates) return rates;
		return isAudio ? AUDIO_PLAYBACK_RATES : VIDEO_PLAYBACK_RATES;
	}, [rates, isAudio]);
	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const currentIndex = availableRates.indexOf(rate);
			const nextIndex = (currentIndex + 1) % availableRates.length;
			onRateChange(availableRates[nextIndex]);
		},
		[rate, availableRates, onRateChange],
	);
	const isActive = rate !== 1;
	const formattedRate = formatRate(rate);
	const label = i18n._(PLAYBACK_SPEED_DESCRIPTOR, {formattedRate});
	const button = (
		<FocusRing offset={-2} data-flx="voice.media-player.media-playback-rate.focus-ring">
			<button
				type="button"
				onClick={handleClick}
				className={clsx(styles.button, styles[size], isActive && styles.active, className)}
				aria-label={label}
				data-rate-length={formattedRate.length}
				data-flx="voice.media-player.media-playback-rate.button.click"
			>
				<span className={styles.label} data-flx="voice.media-player.media-playback-rate.label">
					{formattedRate}
				</span>
			</button>
		</FocusRing>
	);
	if (showTooltip) {
		return (
			<Tooltip
				text={i18n._(PLAYBACK_SPEED_2_DESCRIPTOR)}
				position="top"
				openOnMountHover={false}
				data-flx="voice.media-player.media-playback-rate.tooltip"
			>
				{button}
			</Tooltip>
		);
	}
	return button;
}
