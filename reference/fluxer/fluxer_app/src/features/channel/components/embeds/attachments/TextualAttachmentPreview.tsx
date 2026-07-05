// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	type CsvRows,
	isCsvAttachment,
	parseCsvRows,
} from '@app/features/channel/components/embeds/attachments/CsvAttachmentPreviewUtils';
import {CsvAttachmentTablePanel} from '@app/features/channel/components/embeds/attachments/CsvAttachmentTablePanel';
import {TextualAttachmentCodePanel} from '@app/features/channel/components/embeds/attachments/TextualAttachmentCodePanel';
import styles from '@app/features/channel/components/embeds/attachments/TextualAttachmentPreview.module.css';
import {TextualAttachmentPreviewBottomSheet} from '@app/features/channel/components/embeds/attachments/TextualAttachmentPreviewBottomSheet';
import {TextualAttachmentPreviewFooter} from '@app/features/channel/components/embeds/attachments/TextualAttachmentPreviewFooter';
import {TextualAttachmentPreviewModal} from '@app/features/channel/components/embeds/attachments/TextualAttachmentPreviewModal';
import {
	DEFAULT_PREVIEW_LINES,
	getAttachmentFileName,
	getInitialSelectedLanguage,
	getLineCount,
	getVisibleLineCount,
	inferLanguageCodeFromAttachment,
	MAX_EXPANDED_PREVIEW_LINES,
	type PreviewError,
	type PreviewStatus,
	previewExpansionState,
	type TextualAttachmentPreviewProps,
} from '@app/features/channel/components/embeds/attachments/TextualAttachmentPreviewUtils';
import {TextualPreviewContextMenu} from '@app/features/channel/components/embeds/attachments/TextualPreviewContextMenu';
import {useArboriumHighlightedHtml} from '@app/features/code_highlighting/utils/ArboriumHighlighting';
import TextualPreview from '@app/features/messaging/state/TextualPreview';
import {shouldPreviewAttachment, TEXT_PREVIEW_MAX_BYTES} from '@app/features/messaging/utils/AttachmentPreviewUtils';
import {downloadFile} from '@app/features/messaging/utils/FileDownloadUtils';
import * as ContextMenuCommands from '@app/features/ui/commands/ContextMenuCommands';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import {plural} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {type MouseEvent, useCallback, useEffect, useMemo, useState} from 'react';

export const TextualAttachmentPreview = observer(function TextualAttachmentPreview({
	attachment,
}: TextualAttachmentPreviewProps) {
	const {i18n} = useLingui();
	const shouldShowPreview = shouldPreviewAttachment(attachment);
	const isCsvPreview = useMemo(
		() => isCsvAttachment(attachment),
		[attachment.content_type, attachment.filename, attachment.title],
	);
	const inferredLanguageCode = useMemo(
		() => inferLanguageCodeFromAttachment(attachment),
		[attachment.content_type, attachment.filename, attachment.title],
	);
	const initialSelectedLanguage = useMemo(
		() => getInitialSelectedLanguage(attachment, inferredLanguageCode),
		[attachment, inferredLanguageCode],
	);
	const [selectedLanguage, setSelectedLanguage] = useState(initialSelectedLanguage);
	const [isExpanded, setIsExpanded] = useState(() => previewExpansionState.get(attachment.id) ?? false);
	const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
	const [status, setStatus] = useState<PreviewStatus>('idle');
	const [previewError, setPreviewError] = useState<PreviewError | null>(null);
	const [textContent, setTextContent] = useState<string | null>(null);
	useEffect(() => {
		setSelectedLanguage(getInitialSelectedLanguage(attachment, inferLanguageCodeFromAttachment(attachment)));
		setTextContent(null);
		setStatus('idle');
		setPreviewError(null);
		setIsExpanded(previewExpansionState.get(attachment.id) ?? false);
		setIsFullscreenOpen(false);
	}, [attachment.id]);
	useEffect(() => {
		if (!attachment.url) {
			setStatus('error');
			setPreviewError({type: 'network'});
			return;
		}
		if (attachment.size && attachment.size > TEXT_PREVIEW_MAX_BYTES) {
			setStatus('error');
			setPreviewError({type: 'size'});
			return;
		}
		setStatus('loading');
		setPreviewError(null);
		const controller = new AbortController();
		fetch(attachment.url, {signal: controller.signal})
			.then((response) => {
				if (!response.ok) {
					throw new Error(response.statusText || 'Failed to load preview');
				}
				return response.text();
			})
			.then((value) => {
				if (controller.signal.aborted) {
					return;
				}
				setTextContent(value);
				setStatus('loaded');
			})
			.catch((error) => {
				if (controller.signal.aborted) {
					return;
				}
				setStatus('error');
				setPreviewError({type: 'network', message: error?.message ?? 'Failed to load preview'});
			});
		return () => controller.abort();
	}, [attachment.id, attachment.size, attachment.url]);
	const lineCount = useMemo(() => getLineCount(textContent), [textContent]);
	const csvRows = useMemo(() => (isCsvPreview ? parseCsvRows(textContent) : null), [isCsvPreview, textContent]);
	const csvRowCount = csvRows?.length ?? 0;
	const itemCount = isCsvPreview ? csvRowCount : lineCount;
	const canExpand = itemCount > DEFAULT_PREVIEW_LINES;
	const inlinePreviewTextContent = useMemo(() => {
		if (!isExpanded || textContent == null) {
			return textContent;
		}
		const lines = textContent.split(/\r\n|\r|\n/);
		if (lines.length <= MAX_EXPANDED_PREVIEW_LINES) {
			return textContent;
		}
		const remainingLineCount = lines.length - MAX_EXPANDED_PREVIEW_LINES;
		const remainingLinesLabel = plural(
			{count: remainingLineCount},
			{
				one: '... (# line left)',
				other: '... (# lines left)',
			},
		);
		return [...lines.slice(0, MAX_EXPANDED_PREVIEW_LINES), remainingLinesLabel].join('\n');
	}, [i18n, isExpanded, textContent]);
	const inlineCsvRows = useMemo<CsvRows | null>(() => {
		if (!isCsvPreview || csvRows === null) {
			return null;
		}
		if (!isExpanded || csvRows.length <= MAX_EXPANDED_PREVIEW_LINES) {
			return csvRows;
		}
		const remainingRowCount = csvRows.length - MAX_EXPANDED_PREVIEW_LINES;
		const remainingRowsLabel = plural(
			{count: remainingRowCount},
			{
				one: '... (# row left)',
				other: '... (# rows left)',
			},
		);
		return [...csvRows.slice(0, MAX_EXPANDED_PREVIEW_LINES), [remainingRowsLabel]];
	}, [csvRows, i18n, isCsvPreview, isExpanded]);
	const inlinePreviewLineCount = useMemo(() => getLineCount(inlinePreviewTextContent), [inlinePreviewTextContent]);
	const visibleLineCount = useMemo(() => {
		if (status !== 'loaded' || !isExpanded) {
			return getVisibleLineCount(itemCount, false);
		}
		if (isCsvPreview) {
			return Math.max(inlineCsvRows?.length ?? 1, 1);
		}
		return Math.max(inlinePreviewLineCount, 1);
	}, [inlineCsvRows, inlinePreviewLineCount, isCsvPreview, isExpanded, itemCount, status]);
	useEffect(() => {
		if (!canExpand && isExpanded) {
			setIsExpanded(false);
		}
	}, [canExpand, isExpanded]);
	useEffect(() => {
		previewExpansionState.set(attachment.id, canExpand ? isExpanded : false);
	}, [attachment.id, canExpand, isExpanded]);
	const highlightedHtml = useArboriumHighlightedHtml(selectedLanguage, inlinePreviewTextContent);
	const fullscreenHighlightedHtml = useArboriumHighlightedHtml(selectedLanguage, textContent);
	const toggleExpanded = useCallback(() => {
		setIsExpanded((current) => !current);
	}, []);
	const handleDownload = useCallback(async () => {
		const downloadUrl = attachment.proxy_url ?? attachment.url;
		if (!downloadUrl) {
			return;
		}
		await downloadFile(downloadUrl, 'file', getAttachmentFileName(attachment) || 'file');
	}, [attachment]);
	const handleContextMenu = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			ContextMenuCommands.openFromEvent(event, () => (
				<TextualPreviewContextMenu
					onDownload={handleDownload}
					onToggleWrapText={TextualPreview.toggleWrapText}
					showWrapText={!isCsvPreview}
					wrapText={TextualPreview.wrapText}
					data-flx="channel.embeds.attachments.textual-attachment-preview.handle-context-menu.textual-preview-context-menu"
				/>
			));
		},
		[handleDownload, isCsvPreview],
	);
	const handleOpenFullscreen = useCallback(() => {
		setIsFullscreenOpen(true);
	}, []);
	const handleCloseFullscreen = useCallback(() => {
		setIsFullscreenOpen(false);
	}, []);
	const handleSelectLanguage = useCallback((languageCode: string) => {
		setSelectedLanguage(languageCode);
	}, []);
	if (!shouldShowPreview) {
		return null;
	}
	const isMobile = MobileLayout.isMobileLayout();
	const FullscreenComponent = isMobile ? TextualAttachmentPreviewBottomSheet : TextualAttachmentPreviewModal;
	return (
		<>
			<div
				className={styles.textualPreview}
				data-flx="channel.embeds.attachments.textual-attachment-preview.textual-preview"
			>
				{isCsvPreview ? (
					<CsvAttachmentTablePanel
						canExpand={canExpand}
						copyTextContent={textContent}
						isExpanded={isExpanded}
						previewError={previewError}
						rows={inlineCsvRows}
						status={status}
						visibleLineCount={visibleLineCount}
						wrapperClassName={styles.inlinePreviewSurface}
						data-flx="channel.embeds.attachments.textual-attachment-preview.csv-attachment-table-panel"
					/>
				) : (
					<TextualAttachmentCodePanel
						canExpand={canExpand}
						copyTextContent={textContent}
						highlightedHtml={highlightedHtml}
						isExpanded={isExpanded}
						previewError={previewError}
						status={status}
						textContent={inlinePreviewTextContent}
						visibleLineCount={visibleLineCount}
						wrapText={TextualPreview.wrapText}
						wrapperClassName={styles.inlinePreviewSurface}
						data-flx="channel.embeds.attachments.textual-attachment-preview.textual-attachment-code-panel"
					/>
				)}
				<TextualAttachmentPreviewFooter
					attachment={attachment}
					canExpand={canExpand}
					countKind={isCsvPreview ? 'row' : 'line'}
					inferredLanguageCode={inferredLanguageCode}
					isExpanded={isExpanded}
					lineCount={itemCount}
					onMoreOptions={handleContextMenu}
					onOpenFullscreen={handleOpenFullscreen}
					onSelectLanguage={handleSelectLanguage}
					onToggleExpanded={toggleExpanded}
					selectedLanguage={selectedLanguage}
					showLanguageButton={!isCsvPreview}
					data-flx="channel.embeds.attachments.textual-attachment-preview.textual-attachment-preview-footer"
				/>
			</div>
			{isFullscreenOpen && (
				<FullscreenComponent
					attachment={attachment}
					csvRows={csvRows}
					highlightedHtml={fullscreenHighlightedHtml}
					inferredLanguageCode={inferredLanguageCode}
					onClose={handleCloseFullscreen}
					onMoreOptions={handleContextMenu}
					onSelectLanguage={handleSelectLanguage}
					previewError={previewError}
					renderMode={isCsvPreview ? 'csv' : 'code'}
					selectedLanguage={selectedLanguage}
					status={status}
					textContent={textContent}
					wrapText={TextualPreview.wrapText}
					data-flx="channel.embeds.attachments.textual-attachment-preview.fullscreen-component"
				/>
			)}
		</>
	);
});
