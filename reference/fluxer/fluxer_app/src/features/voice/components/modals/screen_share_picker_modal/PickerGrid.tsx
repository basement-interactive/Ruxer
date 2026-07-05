// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/voice/components/modals/ScreenSharePickerModal.module.css';
import {PickerCardButton} from '@app/features/voice/components/modals/screen_share_picker_modal/PickerCardButton';
import type {
	PickerCard,
	ScreenSharePickerTab,
} from '@app/features/voice/components/modals/screen_share_picker_modal/shared';
import type React from 'react';

interface PickerGridProps {
	cards: ReadonlyArray<PickerCard>;
	activeTab: ScreenSharePickerTab;
	activeShareLabel: string;
	pendingSelectionId: string | null;
	onSelect: (cardId: string) => void;
	onPreviewImageError: (cardId: string) => void;
}

export const PickerGrid: React.FC<PickerGridProps> = ({
	cards,
	activeTab,
	activeShareLabel,
	pendingSelectionId,
	onSelect,
	onPreviewImageError,
}) => {
	return (
		<div className={styles.grid} data-flx="voice.screen-share-picker-modal.grid">
			{cards.map((card) => {
				const isDeviceCard = activeTab === 'devices';
				return (
					<PickerCardButton
						key={card.id}
						card={card}
						isDeviceCard={isDeviceCard}
						isPending={pendingSelectionId === card.id}
						isAnyPending={pendingSelectionId != null}
						ariaLabel={`${activeShareLabel}: ${card.title}`}
						onSelect={() => onSelect(card.id)}
						onPreviewImageError={() => onPreviewImageError(card.id)}
						data-flx="voice.screen-share-picker-modal.picker-grid.picker-card-button.select"
					/>
				);
			})}
		</div>
	);
};
