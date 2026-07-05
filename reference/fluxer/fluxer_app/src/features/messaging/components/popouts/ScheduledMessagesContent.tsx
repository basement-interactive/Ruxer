// SPDX-License-Identifier: AGPL-3.0-or-later

import previewStyles from '@app/features/app/components/shared/MessagePreview.module.css';
import * as ScheduledMessageCommands from '@app/features/messaging/commands/ScheduledMessageCommands';
import styles from '@app/features/messaging/components/popouts/ScheduledMessagesContent.module.css';
import {useMessageSelectionCopy} from '@app/features/messaging/hooks/useMessageSelectionCopy';
import ScheduledMessages from '@app/features/messaging/state/ScheduledMessages';
import {Scroller} from '@app/features/ui/components/Scroller';
import {Spinner} from '@app/features/ui/components/Spinner';
import {getCurrentLocale} from '@app/features/user/utils/LocaleUtils';
import {formatScheduledMessage} from '@fluxer/date_utils/src/DateFormatting';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {FlagCheckeredIcon, WarningCircleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useState} from 'react';

const NO_SCHEDULED_MESSAGES_DESCRIPTOR = msg({
	message: 'No scheduled messages',
	comment: 'Empty state title in the scheduled messages popout when the user has none scheduled.',
});
const RIGHT_CLICK_THE_SEND_BUTTON_TO_SCHEDULE_A_DESCRIPTOR = msg({
	message: 'Right-click the send button to schedule a message.',
	comment: 'Empty state hint in the scheduled messages popout explaining how to schedule a new message.',
});
const INVALID_DESCRIPTOR = msg({
	message: 'Invalid',
	comment: 'Status pill on a scheduled message row when the schedule is in the past or otherwise invalid.',
});
const SCHEDULED_DESCRIPTOR = msg({
	message: 'Scheduled',
	comment: 'Status pill on a scheduled message row indicating it will send at the chosen time.',
});
const ATTACHMENT_ONLY_MESSAGE_DESCRIPTOR = msg({
	message: 'Attachment only message',
	comment: 'Placeholder content text shown for scheduled messages that have attachments but no text content.',
});
const NO_CONTENT_DESCRIPTOR = msg({
	message: '(no content)',
	comment:
		'Placeholder content text shown for scheduled messages with neither text nor attachments. Keep the parentheses.',
});
const ATTACHMENTS_DESCRIPTOR = msg({
	message: 'Attachments',
	comment: 'Label in the scheduled message row preview indicating that attachments are included.',
});
const CANCEL_DESCRIPTOR = msg({
	message: 'Cancel',
	comment: 'Button label on a scheduled message row that cancels (deletes) the scheduled send.',
});
const YOU_RE_CAUGHT_UP_DESCRIPTOR = msg({
	message: "You're caught up",
	comment:
		'End-of-list title in the scheduled messages popout when all scheduled messages are visible. Tone can be friendly.',
});
const NO_MORE_SCHEDULED_MESSAGES_DESCRIPTOR = msg({
	message: "That's everything in the queue.",
	comment: 'End-of-list body text in the scheduled messages popout when all scheduled messages are visible.',
});
export const ScheduledMessagesContent = observer(() => {
	const {i18n} = useLingui();
	const {scheduledMessages, fetched, fetching} = ScheduledMessages;
	const [cancellingId, setCancellingId] = useState<string | null>(null);
	const getScheduledMessagePlaintext = useCallback(
		(messageId: string) => {
			const message = scheduledMessages.find((entry) => entry.id === messageId);
			if (!message) {
				return null;
			}
			const blocks: Array<string> = [];
			const content = message.payload.content?.trim();
			const attachmentCount = message.payload.attachments?.length ?? 0;
			if (content) {
				blocks.push(content);
			}
			if (attachmentCount > 0) {
				blocks.push(`${i18n._(ATTACHMENTS_DESCRIPTOR)}: ${attachmentCount}`);
			}
			if (message.status === 'invalid' && message.statusReason) {
				blocks.push(message.statusReason);
			}
			return blocks.length > 0 ? blocks.join('\n') : i18n._(NO_CONTENT_DESCRIPTOR);
		},
		[i18n, scheduledMessages],
	);
	const onCopySelectedMessages = useMessageSelectionCopy<HTMLDivElement>({
		getMessagePlaintext: getScheduledMessagePlaintext,
	});
	useEffect(() => {
		if (!fetched && !fetching) {
			ScheduledMessageCommands.fetchScheduledMessages();
		}
	}, [fetched, fetching]);
	const handleCancel = useCallback(
		async (messageId: string) => {
			setCancellingId(messageId);
			try {
				await ScheduledMessageCommands.cancelScheduledMessage(i18n, messageId);
			} finally {
				setCancellingId(null);
			}
		},
		[i18n],
	);
	if (fetching) {
		return (
			<div className={previewStyles.emptyState} data-flx="messaging.scheduled-messages-content.loading-state">
				<Spinner data-flx="messaging.scheduled-messages-content.spinner" />
			</div>
		);
	}
	if (scheduledMessages.length === 0) {
		return (
			<div className={previewStyles.emptyState} data-flx="messaging.scheduled-messages-content.div">
				<div className={previewStyles.emptyStateContent} data-flx="messaging.scheduled-messages-content.div--2">
					<FlagCheckeredIcon
						className={previewStyles.emptyStateIcon}
						data-flx="messaging.scheduled-messages-content.flag-checkered-icon"
					/>
					<div className={previewStyles.emptyStateTextContainer} data-flx="messaging.scheduled-messages-content.div--3">
						<h3 className={previewStyles.emptyStateTitle} data-flx="messaging.scheduled-messages-content.h3">
							{i18n._(NO_SCHEDULED_MESSAGES_DESCRIPTOR)}
						</h3>
						<p className={previewStyles.emptyStateDescription} data-flx="messaging.scheduled-messages-content.p">
							{i18n._(RIGHT_CLICK_THE_SEND_BUTTON_TO_SCHEDULE_A_DESCRIPTOR)}
						</p>
					</div>
				</div>
			</div>
		);
	}
	const formatScheduledAt = (message: (typeof scheduledMessages)[number]) => {
		try {
			return formatScheduledMessage(message.scheduledAt, getCurrentLocale(), message.timezone);
		} catch {
			return `${message.scheduledLocalAt} (${message.timezone})`;
		}
	};
	return (
		<Scroller
			className={previewStyles.scroller}
			key="scheduled-messages-scroller"
			onCopy={onCopySelectedMessages}
			data-message-selection-root="true"
			data-flx="messaging.scheduled-messages-content.scroller"
		>
			{scheduledMessages.map((message) => (
				<div
					key={message.id}
					className={previewStyles.previewCard}
					data-message-id={message.id}
					data-is-group-start="true"
					data-flx="messaging.scheduled-messages-content.div--4"
				>
					<div className={styles.cardHeader} data-flx="messaging.scheduled-messages-content.card-header">
						<span
							className={`${styles.statusBadge} ${message.status === 'invalid' ? styles.statusInvalid : ''}`}
							data-flx="messaging.scheduled-messages-content.status-badge"
						>
							{message.status === 'invalid' ? i18n._(INVALID_DESCRIPTOR) : i18n._(SCHEDULED_DESCRIPTOR)}
						</span>
						<span className={styles.timestamp} data-flx="messaging.scheduled-messages-content.timestamp">
							{formatScheduledAt(message)}
						</span>
					</div>
					<p className={styles.messageText} data-flx="messaging.scheduled-messages-content.message-text">
						{message.payload.content ??
							(message.payload.attachments?.length
								? i18n._(ATTACHMENT_ONLY_MESSAGE_DESCRIPTOR)
								: i18n._(NO_CONTENT_DESCRIPTOR))}
					</p>
					{message.payload.attachments?.length ? (
						<div className={styles.attachmentsInfo} data-flx="messaging.scheduled-messages-content.attachments-info">
							{i18n._(ATTACHMENTS_DESCRIPTOR)}: {message.payload.attachments.length}
						</div>
					) : null}
					{message.status === 'invalid' && message.statusReason ? (
						<div className={styles.statusReason} data-flx="messaging.scheduled-messages-content.status-reason">
							<WarningCircleIcon
								className={styles.warningIcon}
								weight="fill"
								data-flx="messaging.scheduled-messages-content.warning-icon"
							/>
							<span data-flx="messaging.scheduled-messages-content.span">{message.statusReason}</span>
						</div>
					) : null}
					<div className={previewStyles.actionButtons} data-flx="messaging.scheduled-messages-content.div--5">
						<button
							type="button"
							className={previewStyles.actionButton}
							onClick={() => handleCancel(message.id)}
							disabled={cancellingId === message.id}
							data-flx="messaging.scheduled-messages-content.button.cancel"
						>
							{i18n._(CANCEL_DESCRIPTOR)}
						</button>
					</div>
				</div>
			))}
			<div className={previewStyles.endState} data-flx="messaging.scheduled-messages-content.div--6">
				<div className={previewStyles.endStateContent} data-flx="messaging.scheduled-messages-content.div--7">
					<FlagCheckeredIcon
						className={previewStyles.endStateIcon}
						data-flx="messaging.scheduled-messages-content.flag-checkered-icon--2"
					/>
					<div className={previewStyles.endStateTextContainer} data-flx="messaging.scheduled-messages-content.div--8">
						<h3 className={previewStyles.endStateTitle} data-flx="messaging.scheduled-messages-content.h3--2">
							{i18n._(YOU_RE_CAUGHT_UP_DESCRIPTOR)}
						</h3>
						<p className={previewStyles.endStateDescription} data-flx="messaging.scheduled-messages-content.p--2">
							{i18n._(NO_MORE_SCHEDULED_MESSAGES_DESCRIPTOR)}
						</p>
					</div>
				</div>
			</div>
		</Scroller>
	);
});
