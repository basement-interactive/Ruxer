// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/voice/components/modals/ScreenSharePickerModal.module.css';
import {VideoCameraIcon} from '@phosphor-icons/react';
import type React from 'react';

interface PickerEmptyStateProps {
	title: string;
	description: string;
}

export const PickerEmptyState: React.FC<PickerEmptyStateProps> = ({title, description}) => {
	return (
		<div className={styles.state} data-flx="voice.screen-share-picker-modal.state--3">
			<VideoCameraIcon
				className={styles.stateIcon}
				weight="fill"
				aria-hidden={true}
				data-flx="voice.screen-share-picker-modal.state-icon--2"
			/>
			<div className={styles.stateHeading} data-flx="voice.screen-share-picker-modal.state-heading--2">
				{title}
			</div>
			<div className={styles.stateTitle} data-flx="voice.screen-share-picker-modal.state-title--3">
				{description}
			</div>
		</div>
	);
};
