// SPDX-License-Identifier: AGPL-3.0-or-later

import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import styles from '@app/features/voice/components/VoiceConnectionStatus.module.css';
import {WaveformIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';

interface AudioProcessingButtonProps {
	active: boolean;
	label: string;
	onClick: () => void;
	pressed?: boolean;
}

export function AudioProcessingButton({active, label, onClick, pressed}: AudioProcessingButtonProps) {
	return (
		<Tooltip text={label} data-flx="voice.voice-connection-status.audio-processing-button.tooltip">
			<FocusRing offset={-2} data-flx="voice.voice-connection-status.audio-processing-button.focus-ring">
				<button
					type="button"
					className={clsx(styles.controlButton, active && styles.selected)}
					onClick={onClick}
					aria-label={label}
					aria-pressed={pressed}
					data-flx="voice.voice-connection-status.audio-processing-button.control-button.click"
				>
					<WaveformIcon
						weight="fill"
						className={styles.icon}
						data-flx="voice.voice-connection-status.audio-processing-button.icon"
					/>
				</button>
			</FocusRing>
		</Tooltip>
	);
}
