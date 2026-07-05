// SPDX-License-Identifier: AGPL-3.0-or-later

import {LiveBadge} from '@app/features/ui/components/LiveBadge';
import type {TooltipPosition} from '@app/features/ui/tooltip/Tooltip';
import styles from '@app/features/voice/components/StreamInfoPill.module.css';
import type {StreamTrackInfo} from '@app/features/voice/components/useStreamTrackInfo';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {useMemo} from 'react';

const FPS_DESCRIPTOR = msg({
	message: '{fps} FPS',
	comment:
		'Compact frame-rate badge on the stream info pill. {fps} is the integer frame rate; FPS is a technical token.',
});

type ResolutionHeight = 240 | 480 | 720 | 1080 | 1440 | 2160;

const RESOLUTION_HEIGHTS: Array<ResolutionHeight> = [480, 240, 720, 1080, 1440, 2160];

type StreamInfoPillTone = 'default' | 'voice_tile';

function getClosestResolutionHeight(height: number) {
	let closest: ResolutionHeight = RESOLUTION_HEIGHTS[0];
	let smallestDiff = Math.abs(height - closest);
	for (const value of RESOLUTION_HEIGHTS) {
		const diff = Math.abs(height - value);
		if (diff < smallestDiff) {
			closest = value;
			smallestDiff = diff;
		}
	}
	return closest;
}

interface StreamInfoPillProps {
	info: StreamTrackInfo;
	className?: string;
	showLiveBadge?: boolean;
	tone?: StreamInfoPillTone;
	liveBadgeTooltipPosition?: TooltipPosition;
}

export function StreamInfoPill({
	info,
	className,
	showLiveBadge = true,
	tone = 'default',
	liveBadgeTooltipPosition,
}: StreamInfoPillProps) {
	const {i18n} = useLingui();
	const resolutionText = useMemo(() => {
		const targetHeight = getClosestResolutionHeight(info.height);
		switch (targetHeight) {
			case 240:
				return '240p';
			case 480:
				return '480p';
			case 720:
				return '720p';
			case 1080:
				return '1080p';
			case 1440:
				return '1440p';
			case 2160:
				return '4K';
			default:
				return '720p';
		}
	}, [info.height]);
	const fpsText = useMemo(
		() => (Number.isFinite(info.fps) && info.fps > 0 ? i18n._(FPS_DESCRIPTOR, {fps: info.fps}) : ''),
		[info.fps, i18n.locale],
	);
	const labelText = useMemo(
		() => (fpsText ? `${resolutionText} ${fpsText}` : resolutionText),
		[fpsText, resolutionText],
	);
	return (
		<div
			className={clsx(styles.container, tone === 'voice_tile' && styles.containerOnTile, className)}
			data-flx="voice.stream-info-pill.container"
		>
			<span
				className={clsx(styles.pill, tone === 'voice_tile' && styles.pillOnTile)}
				data-flx="voice.stream-info-pill.pill"
			>
				{labelText}
			</span>
			{showLiveBadge && (
				<LiveBadge
					tone={tone}
					tooltipPosition={liveBadgeTooltipPosition}
					data-flx="voice.stream-info-pill.live-badge"
				/>
			)}
		</div>
	);
}
