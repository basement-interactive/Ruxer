// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {useCursorAtEnd} from '@app/features/app/hooks/useCursorAtEnd';
import styles from '@app/features/messaging/components/modals/AttachmentEditModal.module.css';
import {type CloudAttachment, CloudUpload} from '@app/features/messaging/upload/CloudUpload';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Form} from '@app/features/ui/components/form/Form';
import {Input, Textarea} from '@app/features/ui/components/form/FormInput';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {MessageAttachmentFlags} from '@fluxer/constants/src/ChannelConstants';
import {MAX_ATTACHMENT_ALT_TEXT_LENGTH} from '@fluxer/constants/src/LimitConstants';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useCallback, useMemo} from 'react';
import {useForm} from 'react-hook-form';

const EDIT_ATTACHMENT_DESCRIPTOR = msg({
	message: 'Edit attachment',
	comment: 'Button or menu action label in the attachment edit modal. Keep it concise.',
});
const FILENAME_DESCRIPTOR = msg({
	message: 'Filename',
	comment: 'Short label in the attachment edit modal. Keep it concise.',
});
const ALT_TEXT_DESCRIPTION_DESCRIPTOR = msg({
	message: 'Alt text description',
	comment: 'Accessible label in the attachment edit modal. Keep it concise.',
});
const DESCRIBE_THIS_MEDIA_FOR_SCREEN_READERS_DESCRIPTOR = msg({
	message: 'Describe this media for screen readers',
	comment: 'Label in the attachment edit modal.',
});
const MARK_AS_SPOILER_DESCRIPTOR = msg({
	message: 'Mark as spoiler',
	comment: 'Button or menu action label in the attachment edit modal. Keep it concise.',
});

interface FormInputs {
	filename: string;
	spoiler: boolean;
	description: string;
}

export const AttachmentEditModal = observer(
	({channelId, attachment}: {channelId: string; attachment: CloudAttachment}) => {
		const {i18n} = useLingui();
		const defaultSpoiler = (attachment.flags & MessageAttachmentFlags.IS_SPOILER) !== 0;
		const form = useForm<FormInputs>({
			defaultValues: {
				filename: attachment.filename,
				spoiler: defaultSpoiler,
				description: attachment.description ?? '',
			},
		});
		const filenameRef = useCursorAtEnd<HTMLInputElement>();
		const descriptionValue = form.watch('description');
		const isAltTextSupported = useMemo(() => {
			const mimeType = attachment.file.type.toLowerCase();
			return mimeType.startsWith('image/') || mimeType.startsWith('video/');
		}, [attachment.file.type]);
		const onSubmit = useCallback(
			async (data: FormInputs) => {
				const nextFlags = data.spoiler
					? attachment.flags | MessageAttachmentFlags.IS_SPOILER
					: attachment.flags & ~MessageAttachmentFlags.IS_SPOILER;
				const nextDescription = data.description.trim();
				const updates: Partial<CloudAttachment> = {
					filename: data.filename,
					flags: nextFlags,
					spoiler: data.spoiler,
				};
				if (isAltTextSupported) {
					updates.description = nextDescription.length > 0 ? nextDescription : undefined;
				}
				CloudUpload.updateAttachment(channelId, attachment.id, updates);
				ModalCommands.pop();
			},
			[attachment, channelId, isAltTextSupported],
		);
		return (
			<Modal.Root size="small" centered data-flx="messaging.attachment-edit-modal.modal-root">
				<Form form={form} onSubmit={onSubmit} data-flx="messaging.attachment-edit-modal.form.submit">
					<Modal.Header
						title={i18n._(EDIT_ATTACHMENT_DESCRIPTOR)}
						onClose={ModalCommands.pop}
						data-flx="messaging.attachment-edit-modal.modal-header"
					/>
					<Modal.Content contentClassName={styles.content} data-flx="messaging.attachment-edit-modal.modal-content">
						<Input
							data-flx="messaging.attachment-edit-modal.input.text"
							{...form.register('filename')}
							ref={(el) => {
								filenameRef(el);
								form.register('filename').ref(el);
							}}
							autoFocus={true}
							label={i18n._(FILENAME_DESCRIPTOR)}
							minLength={1}
							maxLength={512}
							required={true}
							type="text"
							spellCheck={false}
						/>
						{isAltTextSupported ? (
							<Textarea
								data-flx="messaging.attachment-edit-modal.textarea"
								{...form.register('description')}
								value={descriptionValue}
								label={i18n._(ALT_TEXT_DESCRIPTION_DESCRIPTOR)}
								placeholder={i18n._(DESCRIBE_THIS_MEDIA_FOR_SCREEN_READERS_DESCRIPTOR)}
								minRows={3}
								maxRows={8}
								showCharacterCount={true}
								maxLength={MAX_ATTACHMENT_ALT_TEXT_LENGTH}
							/>
						) : null}
						<Switch
							label={i18n._(MARK_AS_SPOILER_DESCRIPTOR)}
							value={form.watch('spoiler')}
							onChange={(value) => form.setValue('spoiler', value)}
							data-flx="messaging.attachment-edit-modal.switch.set-value"
						/>
					</Modal.Content>
					<Modal.Footer data-flx="messaging.attachment-edit-modal.modal-footer">
						<Button
							onClick={ModalCommands.pop}
							variant="secondary"
							data-flx="messaging.attachment-edit-modal.button.pop"
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit" data-flx="messaging.attachment-edit-modal.button.submit">
							<Trans>Save</Trans>
						</Button>
					</Modal.Footer>
				</Form>
			</Modal.Root>
		);
	},
);
