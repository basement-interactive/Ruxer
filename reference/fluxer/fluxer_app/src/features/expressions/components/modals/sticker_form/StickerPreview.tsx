// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/expressions/components/modals/sticker_form/StickerPreview.module.css';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

interface StickerPreviewProps {
	imageUrl: string;
	altText: string;
}

export const StickerPreview = observer(function StickerPreview({imageUrl, altText}: StickerPreviewProps) {
	return (
		<div className={styles.container} data-flx="expressions.sticker-form.sticker-preview.container">
			<div className={styles.title} data-flx="expressions.sticker-form.sticker-preview.title">
				<Trans>Preview</Trans>
			</div>
			<div className={styles.previewContainer} data-flx="expressions.sticker-form.sticker-preview.preview-container">
				<div className={styles.previewItem} data-flx="expressions.sticker-form.sticker-preview.preview-item">
					<div
						className={`${styles.previewBox} ${styles.darkBackground}`}
						data-flx="expressions.sticker-form.sticker-preview.preview-box"
					>
						<img
							src={imageUrl}
							alt={`${altText} - Dark theme preview`}
							className={styles.previewImage}
							data-flx="expressions.sticker-form.sticker-preview.preview-image"
						/>
					</div>
					<span className={styles.label} data-flx="expressions.sticker-form.sticker-preview.label">
						<Trans>Dark</Trans>
					</span>
				</div>
				<div className={styles.previewItem} data-flx="expressions.sticker-form.sticker-preview.preview-item--2">
					<div
						className={`${styles.previewBox} ${styles.lightBackground}`}
						data-flx="expressions.sticker-form.sticker-preview.preview-box--2"
					>
						<img
							src={imageUrl}
							alt={`${altText} - Light theme preview`}
							className={styles.previewImage}
							data-flx="expressions.sticker-form.sticker-preview.preview-image--2"
						/>
					</div>
					<span className={styles.label} data-flx="expressions.sticker-form.sticker-preview.label--2">
						<Trans>Light</Trans>
					</span>
				</div>
			</div>
		</div>
	);
});
