// SPDX-License-Identifier: AGPL-3.0-or-later

import guildStyles from '@app/features/app/components/layout/GuildsLayout.module.css';
import {MonitorPlayIcon, SpeakerHighIcon, VideoCameraIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import type React from 'react';

interface VoiceBadgeProps {
	className?: string;
	activity?: VoiceBadgeActivity;
}

export type VoiceBadgeActivity = 'voice' | 'screenshare' | 'video';

function getVoiceBadgeIcon(activity: VoiceBadgeActivity): React.JSX.Element {
	switch (activity) {
		case 'screenshare':
			return (
				<MonitorPlayIcon
					weight="fill"
					className={guildStyles.guildVoiceBadgeIcon}
					data-flx="app.sidebar-nav.voice-badge.get-voice-badge-icon.monitor-play-icon"
				/>
			);
		case 'video':
			return (
				<VideoCameraIcon
					weight="fill"
					className={guildStyles.guildVoiceBadgeIcon}
					data-flx="app.sidebar-nav.voice-badge.get-voice-badge-icon.video-camera-icon"
				/>
			);
		default:
			return (
				<SpeakerHighIcon
					weight="fill"
					className={guildStyles.guildVoiceBadgeIcon}
					data-flx="app.sidebar-nav.voice-badge.get-voice-badge-icon.speaker-high-icon"
				/>
			);
	}
}

export function VoiceBadge({className, activity = 'voice'}: VoiceBadgeProps): React.JSX.Element {
	return (
		<div className={clsx(guildStyles.guildVoiceBadge, className)} data-flx="app.sidebar-nav.voice-badge.div">
			<div className={guildStyles.guildVoiceBadgeInner} data-flx="app.sidebar-nav.voice-badge.div--2">
				{getVoiceBadgeIcon(activity)}
			</div>
		</div>
	);
}
