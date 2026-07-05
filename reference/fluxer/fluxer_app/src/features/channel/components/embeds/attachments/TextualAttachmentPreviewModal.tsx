// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {CsvAttachmentTablePanel} from '@app/features/channel/components/embeds/attachments/CsvAttachmentTablePanel';
import {TextualAttachmentCodePanel} from '@app/features/channel/components/embeds/attachments/TextualAttachmentCodePanel';
import styles from '@app/features/channel/components/embeds/attachments/TextualAttachmentPreview.module.css';
import {TextualAttachmentPreviewFooter} from '@app/features/channel/components/embeds/attachments/TextualAttachmentPreviewFooter';
import {
	getLineCount,
	type TextualAttachmentPreviewModalProps,
} from '@app/features/channel/components/embeds/attachments/TextualAttachmentPreviewUtils';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useMemo} from 'react';

const ATTACHMENT_PREVIEW_DESCRIPTOR = msg({
	message: 'Attachment preview',
	comment: 'Short label in the channel and chat textual attachment preview modal. Keep it concise.',
});
export const TextualAttachmentPreviewModal = observer(function TextualAttachmentPreviewModal({
	attachment,
	csvRows,
	highlightedHtml,
	inferredLanguageCode,
	onClose,
	onMoreOptions,
	onSelectLanguage,
	previewError,
	renderMode = 'code',
	selectedLanguage,
	status,
	textContent,
	wrapText,
}: TextualAttachmentPreviewModalProps) {
	const {i18n} = useLingui();
	const lineCount = useMemo(
		() => (renderMode === 'csv' ? (csvRows?.length ?? 0) : getLineCount(textContent)),
		[csvRows, renderMode, textContent],
	);
	const visibleLineCount = useMemo(() => Math.max(lineCount, 1), [lineCount]);
	return (
		<Modal.Root
			size="fullscreen"
			onClose={onClose}
			className={styles.modalRoot}
			data-flx="channel.embeds.attachments.textual-attachment-preview-modal.modal-root"
		>
			<Modal.ScreenReaderLabel
				text={i18n._(ATTACHMENT_PREVIEW_DESCRIPTOR)}
				data-flx="channel.embeds.attachments.textual-attachment-preview-modal.modal-screen-reader-label"
			/>
			<div
				className={styles.modalLayout}
				data-flx="channel.embeds.attachments.textual-attachment-preview-modal.modal-layout"
			>
				<div
					className={styles.modalBody}
					data-flx="channel.embeds.attachments.textual-attachment-preview-modal.modal-body"
				>
					{renderMode === 'csv' ? (
						<CsvAttachmentTablePanel
							canExpand
							copyTextContent={textContent}
							fillAvailableSpace
							isExpanded
							previewError={previewError}
							rows={csvRows ?? null}
							status={status}
							visibleLineCount={visibleLineCount}
							wrapperClassName={styles.modalPreviewSurface}
							data-flx="channel.embeds.attachments.textual-attachment-preview-modal.csv-attachment-table-panel"
						/>
					) : (
						<TextualAttachmentCodePanel
							canExpand
							fillAvailableSpace
							highlightedHtml={highlightedHtml}
							isExpanded
							previewError={previewError}
							status={status}
							textContent={textContent}
							visibleLineCount={visibleLineCount}
							wrapText={wrapText}
							wrapperClassName={styles.modalPreviewSurface}
							data-flx="channel.embeds.attachments.textual-attachment-preview-modal.textual-attachment-code-panel"
						/>
					)}
				</div>
				<TextualAttachmentPreviewFooter
					attachment={attachment}
					canExpand={false}
					countKind={renderMode === 'csv' ? 'row' : 'line'}
					inferredLanguageCode={inferredLanguageCode}
					isExpanded
					lineCount={lineCount}
					onMoreOptions={onMoreOptions}
					onSelectLanguage={onSelectLanguage}
					selectedLanguage={selectedLanguage}
					showExpandButton={false}
					showLanguageButton={renderMode !== 'csv'}
					data-flx="channel.embeds.attachments.textual-attachment-preview-modal.textual-attachment-preview-footer"
				/>
			</div>
		</Modal.Root>
	);
});
