// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {Endpoints} from '@app/features/app/constants/Endpoints';
import {useCursorAtEnd} from '@app/features/app/hooks/useCursorAtEnd';
import {AltTextUpdateFailedModal} from '@app/features/messaging/components/alerts/AltTextUpdateFailedModal';
import styles from '@app/features/messaging/components/modals/AttachmentEditModal.module.css';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Form} from '@app/features/ui/components/form/Form';
import {Textarea} from '@app/features/ui/components/form/FormInput';
import {MAX_ATTACHMENT_ALT_TEXT_LENGTH} from '@fluxer/constants/src/LimitConstants';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {useForm} from 'react-hook-form';

const ALT_TEXT_UPDATED_DESCRIPTOR = msg({
	message: 'Alt text updated',
	comment: 'Accessible label in the edit alt text modal. Keep it concise.',
});
const EDIT_ALT_TEXT_FORM_DESCRIPTOR = msg({
	message: 'Edit alt text form',
	comment: 'Accessible label in the edit alt text modal. Keep it concise.',
});
const EDIT_ALT_TEXT_DESCRIPTOR = msg({
	message: 'Edit alt text',
	comment: 'Accessible label in the edit alt text modal. Keep it concise.',
});
const ALT_TEXT_DESCRIPTION_DESCRIPTOR = msg({
	message: 'Alt text description',
	comment: 'Accessible label in the edit alt text modal. Keep it concise.',
});
const DESCRIBE_THIS_MEDIA_FOR_SCREEN_READERS_DESCRIPTOR = msg({
	message: 'Describe this media for screen readers',
	comment: 'Label in the edit alt text modal.',
});
const logger = new Logger('EditAltTextModal');

interface FormInputs {
	description: string;
}

interface EditAltTextModalProps {
	message: Message;
	attachmentId: string;
	currentDescription?: string | null;
	snapshotIndex?: number;
	onClose: () => void;
}

export const EditAltTextModal = observer(
	({message, attachmentId, currentDescription, snapshotIndex, onClose}: EditAltTextModalProps) => {
		const {i18n} = useLingui();
		const [isSubmitting, setIsSubmitting] = useState(false);
		const textareaRef = useCursorAtEnd<HTMLTextAreaElement>();
		const form = useForm<FormInputs>({
			defaultValues: {
				description: currentDescription ?? '',
			},
		});
		const currentDescriptionValue = form.watch('description');
		const currentLength = useMemo(() => currentDescriptionValue.length, [currentDescriptionValue]);
		const isOverLimit = currentLength > MAX_ATTACHMENT_ALT_TEXT_LENGTH;
		const canSubmit = !isOverLimit && !isSubmitting;
		const onSubmit = useCallback(
			async (data: FormInputs) => {
				if (!canSubmit) return;
				setIsSubmitting(true);
				logger.debug(`Updating alt text for attachment ${attachmentId} in message ${message.id}`);
				try {
					if (snapshotIndex !== undefined) {
						const snapshots = message.messageSnapshots ?? [];
						const snapshotEdits = snapshots.map((snapshot, idx) => {
							if (idx !== snapshotIndex) return {};
							const attachments = (snapshot.attachments ?? []).map((att) => {
								if (att.id === attachmentId) {
									return {id: att.id, description: data.description || null};
								}
								return {id: att.id};
							});
							return {attachments};
						});
						await http.patch<Message>(Endpoints.CHANNEL_MESSAGE(message.channelId, message.id), {
							body: {
								message_snapshots: snapshotEdits,
							},
						});
					} else {
						const attachmentUpdates = message.attachments.map((att) => {
							if (att.id === attachmentId) {
								return {
									id: att.id,
									description: data.description || null,
								};
							}
							return {id: att.id};
						});
						await http.patch<Message>(Endpoints.CHANNEL_MESSAGE(message.channelId, message.id), {
							body: {
								content: message.content,
								attachments: attachmentUpdates,
							},
						});
					}
					logger.debug(`Successfully updated alt text for attachment ${attachmentId}`);
					ToastCommands.success(i18n._(ALT_TEXT_UPDATED_DESCRIPTOR));
					onClose();
				} catch (error) {
					logger.error('Failed to update alt text:', error);
					ModalCommands.push(
						modal(() => (
							<AltTextUpdateFailedModal
								error={error}
								data-flx="messaging.edit-alt-text-modal.on-submit.alt-text-update-failed-modal"
							/>
						)),
					);
				} finally {
					setIsSubmitting(false);
				}
			},
			[canSubmit, attachmentId, message, onClose, snapshotIndex, i18n],
		);
		useEffect(() => {
			function handleKeyDown(event: KeyboardEvent) {
				if (event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					onClose();
				} else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
					event.preventDefault();
					event.stopPropagation();
					if (canSubmit) {
						void form.handleSubmit(onSubmit)();
					}
				}
			}
			document.addEventListener('keydown', handleKeyDown);
			return () => document.removeEventListener('keydown', handleKeyDown);
		}, [onClose, canSubmit, form, onSubmit]);
		const handleCancel = useCallback(() => {
			onClose();
		}, [onClose]);
		return (
			<Modal.Root size="small" centered onClose={onClose} data-flx="messaging.edit-alt-text-modal.modal-root">
				<Form
					form={form}
					onSubmit={onSubmit}
					aria-label={i18n._(EDIT_ALT_TEXT_FORM_DESCRIPTOR)}
					data-flx="messaging.edit-alt-text-modal.form.submit"
				>
					<Modal.Header
						title={i18n._(EDIT_ALT_TEXT_DESCRIPTOR)}
						onClose={onClose}
						data-flx="messaging.edit-alt-text-modal.modal-header"
					/>
					<Modal.Content className={styles.content} data-flx="messaging.edit-alt-text-modal.content">
						<Textarea
							data-flx="messaging.edit-alt-text-modal.textarea"
							{...form.register('description')}
							ref={(el) => {
								textareaRef(el);
								form.register('description').ref(el);
							}}
							autoFocus={true}
							value={currentDescriptionValue}
							label={i18n._(ALT_TEXT_DESCRIPTION_DESCRIPTOR)}
							placeholder={i18n._(DESCRIBE_THIS_MEDIA_FOR_SCREEN_READERS_DESCRIPTOR)}
							minRows={3}
							maxRows={8}
							showCharacterCount={true}
							maxLength={MAX_ATTACHMENT_ALT_TEXT_LENGTH}
							disabled={isSubmitting}
						/>
					</Modal.Content>
					<Modal.Footer data-flx="messaging.edit-alt-text-modal.modal-footer">
						<Button
							onClick={handleCancel}
							variant="secondary"
							disabled={isSubmitting}
							data-flx="messaging.edit-alt-text-modal.button.cancel"
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit" disabled={!canSubmit} data-flx="messaging.edit-alt-text-modal.button.submit">
							<Trans>Save</Trans>
						</Button>
					</Modal.Footer>
				</Form>
			</Modal.Root>
		);
	},
);
