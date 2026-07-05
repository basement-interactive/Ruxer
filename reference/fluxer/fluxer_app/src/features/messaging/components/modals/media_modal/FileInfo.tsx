// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility from '@app/features/accessibility/state/Accessibility';
import {ExpiryFootnote} from '@app/features/app/components/shared/ExpiryFootnote';
import styles from '@app/features/messaging/components/modals/MediaModal.module.css';
import {ControlButton} from '@app/features/messaging/components/modals/media_modal/MediaControls';
import {
	MESSAGE_DESCRIPTOR,
	NEXT_ATTACHMENT_DESCRIPTOR,
	PREVIOUS_ATTACHMENT_DESCRIPTOR,
} from '@app/features/messaging/components/modals/media_modal/shared';
import {useLingui} from '@lingui/react/macro';
import {CaretLeftIcon, CaretRightIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type {FC} from 'react';

interface FileInfoProps {
	fileName?: string;
	fileSize?: string;
	dimensions?: string;
	expiryInfo?: {expiresAt: Date | null; isExpired: boolean};
	currentIndex?: number;
	totalAttachments?: number;
	onPrevious?: () => void;
	onNext?: () => void;
}

export const FileInfo: FC<FileInfoProps> = observer(
	({fileName, fileSize, dimensions, expiryInfo, currentIndex, totalAttachments, onPrevious, onNext}: FileInfoProps) => {
		const {i18n} = useLingui();
		const hasNavigation = currentIndex !== undefined && totalAttachments !== undefined && totalAttachments > 1;
		if (!fileName && !hasNavigation) {
			return null;
		}
		return (
			<div className={styles.fileInfoInline} data-flx="messaging.media-modal.file-info.file-info-inline">
				{fileName && (
					<div className={styles.fileInfoContent} data-flx="messaging.media-modal.file-info.file-info-content">
						<p className={styles.fileInfoName} data-flx="messaging.media-modal.file-info.file-info-name">
							{fileName}
						</p>
						<p className={styles.fileInfoMeta} data-flx="messaging.media-modal.file-info.file-info-meta">
							{[fileSize, dimensions].filter(Boolean).join(' • ')}
							{expiryInfo?.expiresAt && Accessibility.showAttachmentExpiryIndicator && (
								<>
									{(fileSize || dimensions) && ' • '}
									<ExpiryFootnote
										expiresAt={expiryInfo.expiresAt}
										isExpired={expiryInfo.isExpired}
										inline
										data-flx="messaging.media-modal.file-info.expiry-footnote"
									/>
								</>
							)}
						</p>
					</div>
				)}
				{hasNavigation && (
					<div className={styles.fileInfoNavigation} data-flx="messaging.media-modal.file-info.file-info-navigation">
						<ControlButton
							icon={
								<CaretLeftIcon size={16} weight="bold" data-flx="messaging.media-modal.file-info.caret-left-icon" />
							}
							label={i18n._(PREVIOUS_ATTACHMENT_DESCRIPTOR)}
							onClick={onPrevious ?? (() => {})}
							disabled={currentIndex === 0}
							data-flx="messaging.media-modal.file-info.control-button"
						/>
						<span
							className={styles.fileInfoNavigationText}
							data-flx="messaging.media-modal.file-info.file-info-navigation-text"
						>
							{i18n._(MESSAGE_DESCRIPTOR, {currentAttachmentNumber: currentIndex + 1, totalAttachments})}
						</span>
						<ControlButton
							icon={
								<CaretRightIcon size={16} weight="bold" data-flx="messaging.media-modal.file-info.caret-right-icon" />
							}
							label={i18n._(NEXT_ATTACHMENT_DESCRIPTOR)}
							onClick={onNext ?? (() => {})}
							disabled={currentIndex === totalAttachments - 1}
							data-flx="messaging.media-modal.file-info.control-button--2"
						/>
					</div>
				)}
			</div>
		);
	},
);
