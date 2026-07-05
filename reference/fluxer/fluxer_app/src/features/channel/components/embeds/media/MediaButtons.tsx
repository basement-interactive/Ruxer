// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/embeds/media/MediaButtons.module.css';
import {observer} from 'mobx-react-lite';
import type {FC, ReactNode} from 'react';

interface OverlayPlayButtonProps {
	onClick: (event: React.MouseEvent) => void;
	icon: ReactNode;
	ariaLabel?: string;
}

export const OverlayPlayButton: FC<OverlayPlayButtonProps> = observer(({onClick, icon, ariaLabel}) => (
	<button
		type="button"
		onClick={onClick}
		className={styles.overlayButtonGroup}
		aria-label={ariaLabel}
		data-flx="channel.embeds.media.media-buttons.overlay-play-button.overlay-button-group.click"
	>
		<div
			className={`${styles.overlayButton} ${styles.overlayButtonHover}`}
			data-flx="channel.embeds.media.media-buttons.overlay-play-button.overlay-button"
		>
			{icon}
		</div>
	</button>
));

interface OverlayActionButtonProps {
	onClick: (event: React.MouseEvent) => void;
	icon: ReactNode;
	ariaLabel?: string;
}

export const OverlayActionButton: FC<OverlayActionButtonProps> = observer(({onClick, icon, ariaLabel}) => (
	<button
		type="button"
		onClick={onClick}
		className={styles.overlayButtonGroup}
		aria-label={ariaLabel}
		data-flx="channel.embeds.media.media-buttons.overlay-action-button.overlay-button-group.click"
	>
		<div
			className={`${styles.overlayButton} ${styles.overlayButtonHover}`}
			data-flx="channel.embeds.media.media-buttons.overlay-action-button.overlay-button"
		>
			{icon}
		</div>
	</button>
));
