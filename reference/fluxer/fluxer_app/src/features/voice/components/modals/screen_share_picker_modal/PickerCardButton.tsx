// SPDX-License-Identifier: AGPL-3.0-or-later

import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import styles from '@app/features/voice/components/modals/ScreenSharePickerModal.module.css';
import type {PickerCard} from '@app/features/voice/components/modals/screen_share_picker_modal/shared';
import {getDeterministicPlaceholderGradient} from '@app/lib/placeholder-gradient';
import {clsx} from 'clsx';
import type React from 'react';

interface PickerCardButtonProps {
	card: PickerCard;
	isDeviceCard: boolean;
	isPending: boolean;
	isAnyPending: boolean;
	ariaLabel: string;
	onSelect: () => void;
	onPreviewImageError: () => void;
}

export const PickerCardButton: React.FC<PickerCardButtonProps> = ({
	card,
	isDeviceCard,
	isPending,
	isAnyPending,
	ariaLabel,
	onSelect,
	onPreviewImageError,
}) => {
	const PlaceholderIcon = card.placeholderIcon;
	return (
		<FocusRing key={card.id} offset={-2} data-flx="voice.screen-share-picker-modal.focus-ring">
			<button
				type="button"
				className={clsx(styles.card, isPending && styles.cardPending)}
				onClick={onSelect}
				disabled={isAnyPending}
				aria-label={ariaLabel}
				data-flx="voice.screen-share-picker-modal.card.button"
			>
				<div
					className={clsx(styles.preview, isDeviceCard && styles.previewDevice)}
					data-flx="voice.screen-share-picker-modal.preview"
				>
					{card.thumbnailSrc ? (
						<img
							src={card.thumbnailSrc}
							alt={card.title}
							className={styles.previewImage}
							draggable={false}
							onError={onPreviewImageError}
							data-flx="voice.screen-share-picker-modal.preview-image"
						/>
					) : (
						<div
							className={clsx(styles.previewPlaceholder, isDeviceCard && styles.devicePreviewPlaceholder)}
							style={isDeviceCard ? getDeterministicPlaceholderGradient(card.id) : undefined}
							data-flx="voice.screen-share-picker-modal.preview-placeholder"
						>
							<PlaceholderIcon
								className={styles.previewIcon}
								weight="fill"
								data-flx="voice.screen-share-picker-modal.preview-icon"
							/>
						</div>
					)}
					{card.badgeSrc && (
						<div className={styles.previewBadge} data-flx="voice.screen-share-picker-modal.preview-badge">
							<img
								src={card.badgeSrc}
								alt=""
								draggable={false}
								className={styles.previewBadgeImage}
								data-flx="voice.screen-share-picker-modal.preview-badge-image"
							/>
						</div>
					)}
				</div>
				<div className={styles.cardBody} data-flx="voice.screen-share-picker-modal.card-body">
					<div className={styles.cardTitle} data-flx="voice.screen-share-picker-modal.card-title">
						{card.title}
					</div>
				</div>
			</button>
		</FocusRing>
	);
};
