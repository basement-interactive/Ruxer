// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {useCursorAtEnd} from '@app/features/app/hooks/useCursorAtEnd';
import {useFormSubmit} from '@app/features/app/hooks/useFormSubmit';
import {CANCEL_DESCRIPTOR, CHANGE_NICKNAME_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Form} from '@app/features/ui/components/form/Form';
import {Input} from '@app/features/ui/components/form/FormInput';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useForm} from 'react-hook-form';

const RENAME_CHANNEL_FORM_DESCRIPTOR = msg({
	message: 'Rename channel form',
	comment: 'Short label in the rename channel modal. Keep it concise.',
});
const NICKNAME_DESCRIPTOR = msg({
	message: 'Nickname',
	comment: 'Short label in the rename channel modal. Keep it concise.',
});
const CHANNEL_NICKNAME_DESCRIPTOR = msg({
	message: 'Channel nickname',
	comment: 'Short label in the rename channel modal. Keep it concise.',
});
const SAVE_DESCRIPTOR = msg({
	message: 'Save',
	comment: 'Button or menu action label in the rename channel modal. Keep it concise.',
});

interface FormInputs {
	name: string;
}

export const RenameChannelModal = observer(
	({currentName, onSave}: {currentName: string; onSave: (name: string) => void}) => {
		const {i18n} = useLingui();
		const form = useForm<FormInputs>({
			defaultValues: {
				name: currentName,
			},
		});
		const nameRef = useCursorAtEnd<HTMLInputElement>();
		const onSubmit = async (data: FormInputs) => {
			onSave(data.name);
			ModalCommands.pop();
		};
		const {handleSubmit} = useFormSubmit({
			form,
			onSubmit,
			defaultErrorField: 'name',
		});
		return (
			<Modal.Root size="small" centered data-flx="channel.rename-channel-modal.modal-root">
				<Form
					form={form}
					onSubmit={handleSubmit}
					aria-label={i18n._(RENAME_CHANNEL_FORM_DESCRIPTOR)}
					data-flx="channel.rename-channel-modal.form.submit"
				>
					<Modal.Header
						title={i18n._(CHANGE_NICKNAME_DESCRIPTOR)}
						data-flx="channel.rename-channel-modal.modal-header"
					/>
					<Modal.Content data-flx="channel.rename-channel-modal.modal-content">
						<Modal.ContentLayout data-flx="channel.rename-channel-modal.modal-content-layout">
							<Input
								data-flx="channel.rename-channel-modal.input"
								{...form.register('name')}
								ref={(el) => {
									nameRef(el);
									form.register('name').ref(el);
								}}
								autoFocus={true}
								autoComplete="off"
								error={form.formState.errors.name?.message}
								label={i18n._(NICKNAME_DESCRIPTOR)}
								maxLength={100}
								placeholder={i18n._(CHANNEL_NICKNAME_DESCRIPTOR)}
							/>
						</Modal.ContentLayout>
					</Modal.Content>
					<Modal.Footer data-flx="channel.rename-channel-modal.modal-footer">
						<Button onClick={ModalCommands.pop} variant="secondary" data-flx="channel.rename-channel-modal.button.pop">
							{i18n._(CANCEL_DESCRIPTOR)}
						</Button>
						<Button
							type="submit"
							submitting={form.formState.isSubmitting}
							data-flx="channel.rename-channel-modal.button.submit"
						>
							{i18n._(SAVE_DESCRIPTOR)}
						</Button>
					</Modal.Footer>
				</Form>
			</Modal.Root>
		);
	},
);
