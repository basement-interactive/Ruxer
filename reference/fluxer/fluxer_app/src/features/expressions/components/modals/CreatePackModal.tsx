// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {useFormSubmit} from '@app/features/app/hooks/useFormSubmit';
import styles from '@app/features/expressions/components/modals/CreatePackModal.module.css';
import Packs from '@app/features/expressions/state/ExpressionsPacks';
import {CREATE_DESCRIPTOR, DESCRIPTION_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Form} from '@app/features/ui/components/form/Form';
import {Input, Textarea} from '@app/features/ui/components/form/FormInput';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useCallback} from 'react';
import {useForm} from 'react-hook-form';

const CREATE_EMOJI_PACK_DESCRIPTOR = msg({
	message: 'Create emoji pack',
	comment: 'Action that opens the create-emoji-pack modal.',
});
const CREATE_STICKER_PACK_DESCRIPTOR = msg({
	message: 'Create sticker pack',
	comment: 'Action that opens the create-sticker-pack modal.',
});
const PACK_NAME_DESCRIPTOR = msg({
	message: 'Pack name',
	comment: 'Form field label for the name of an expression pack.',
});
const PACK_NAME_IS_REQUIRED_DESCRIPTOR = msg({
	message: 'Pack name is required',
	comment: 'Form validation error shown when the pack name field is empty.',
});
const PACK_NAME_MUST_BE_AT_LEAST_2_CHARACTERS_DESCRIPTOR = msg({
	message: 'Pack name must be at least 2 characters',
	comment: 'Form validation error for a pack name that is too short.',
});
const PACK_NAME_MUST_BE_AT_MOST_64_CHARACTERS_DESCRIPTOR = msg({
	message: 'Pack name must be at most 64 characters',
	comment: 'Form validation error for a pack name that is too long.',
});
const MY_SUPER_PACK_DESCRIPTOR = msg({
	message: 'My super pack',
	comment: 'Form placeholder example for a pack name input.',
});
const MAXIMUM_256_CHARACTERS_DESCRIPTOR = msg({
	message: 'Maximum 256 characters',
	comment: 'Form helper text describing the maximum length of a description field.',
});
const DESCRIBE_WHAT_EXPRESSIONS_ARE_INSIDE_THIS_PACK_DESCRIPTOR = msg({
	message: "What's in this pack?",
	comment: 'Form helper text for an expression pack description input.',
});

interface FormInputs {
	name: string;
	description: string;
}

interface CreatePackModalProps {
	type: 'emoji' | 'sticker';
	onSuccess?: () => void;
}

export const CreatePackModal = observer(({type, onSuccess}: CreatePackModalProps) => {
	const {i18n} = useLingui();
	const form = useForm<FormInputs>({
		defaultValues: {
			name: '',
			description: '',
		},
	});
	const title = type === 'emoji' ? i18n._(CREATE_EMOJI_PACK_DESCRIPTOR) : i18n._(CREATE_STICKER_PACK_DESCRIPTOR);
	const submitHandler = useCallback(
		async (data: FormInputs) => {
			await Packs.createPack(type, data.name.trim(), data.description.trim() || null);
			onSuccess?.();
			ModalCommands.pop();
		},
		[type, onSuccess],
	);
	const {handleSubmit, isSubmitting} = useFormSubmit({
		form,
		onSubmit: submitHandler,
		defaultErrorField: 'name',
	});
	return (
		<Modal.Root size="small" onClose={() => ModalCommands.pop()} data-flx="expressions.create-pack-modal.modal-root">
			<Modal.Header title={title} data-flx="expressions.create-pack-modal.modal-header" />
			<Modal.Content data-flx="expressions.create-pack-modal.modal-content">
				<p className={styles.description} data-flx="expressions.create-pack-modal.description">
					{type === 'emoji' ? (
						<Trans>Start curating a custom emoji pack that you can share and install.</Trans>
					) : (
						<Trans>Bundle your favorite stickers into a pack you can distribute.</Trans>
					)}
				</p>
				<Form
					className={styles.form}
					form={form}
					onSubmit={handleSubmit}
					data-flx="expressions.create-pack-modal.form.submit"
				>
					<div className={styles.formFields} data-flx="expressions.create-pack-modal.form-fields">
						<Input
							id="pack-name"
							label={i18n._(PACK_NAME_DESCRIPTOR)}
							error={form.formState.errors.name?.message}
							data-flx="expressions.create-pack-modal.pack-name"
							{...form.register('name', {
								required: i18n._(PACK_NAME_IS_REQUIRED_DESCRIPTOR),
								minLength: {value: 2, message: i18n._(PACK_NAME_MUST_BE_AT_LEAST_2_CHARACTERS_DESCRIPTOR)},
								maxLength: {value: 64, message: i18n._(PACK_NAME_MUST_BE_AT_MOST_64_CHARACTERS_DESCRIPTOR)},
							})}
							placeholder={i18n._(MY_SUPER_PACK_DESCRIPTOR)}
						/>
						<Textarea
							id="pack-description"
							label={i18n._(DESCRIPTION_DESCRIPTOR)}
							error={form.formState.errors.description?.message}
							data-flx="expressions.create-pack-modal.pack-description"
							{...form.register('description', {
								maxLength: {value: 256, message: i18n._(MAXIMUM_256_CHARACTERS_DESCRIPTOR)},
							})}
							placeholder={i18n._(DESCRIBE_WHAT_EXPRESSIONS_ARE_INSIDE_THIS_PACK_DESCRIPTOR)}
							minRows={3}
						/>
					</div>
				</Form>
			</Modal.Content>
			<Modal.Footer data-flx="expressions.create-pack-modal.modal-footer">
				<Button
					variant="secondary"
					onClick={() => ModalCommands.pop()}
					data-flx="expressions.create-pack-modal.button.pop"
				>
					<Trans>Cancel</Trans>
				</Button>
				<Button onClick={handleSubmit} submitting={isSubmitting} data-flx="expressions.create-pack-modal.button.submit">
					{i18n._(CREATE_DESCRIPTOR)}
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
