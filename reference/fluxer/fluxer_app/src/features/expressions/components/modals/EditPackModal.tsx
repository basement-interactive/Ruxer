// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {useFormSubmit} from '@app/features/app/hooks/useFormSubmit';
import styles from '@app/features/expressions/components/modals/CreatePackModal.module.css';
import Packs from '@app/features/expressions/state/ExpressionsPacks';
import {DESCRIPTION_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Form} from '@app/features/ui/components/form/Form';
import {Input, Textarea} from '@app/features/ui/components/form/FormInput';
import type {PackType} from '@fluxer/schema/src/domains/pack/PackSchemas';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useCallback} from 'react';
import {useForm} from 'react-hook-form';

const EDIT_EMOJI_PACK_DESCRIPTOR = msg({
	message: 'Edit emoji pack',
	comment: 'Action that opens the edit-emoji-pack modal.',
});
const EDIT_STICKER_PACK_DESCRIPTOR = msg({
	message: 'Edit sticker pack',
	comment: 'Action that opens the edit-sticker-pack modal.',
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
const MAXIMUM_256_CHARACTERS_DESCRIPTOR = msg({
	message: 'Maximum 256 characters',
	comment: 'Form helper text describing the maximum length of a description field.',
});

interface FormInputs {
	name: string;
	description: string;
}

interface EditPackModalProps {
	packId: string;
	type: PackType;
	name: string;
	description: string | null;
	onSuccess?: () => void;
}

export const EditPackModal = observer(({packId, type, name, description, onSuccess}: EditPackModalProps) => {
	const {i18n} = useLingui();
	const form = useForm<FormInputs>({
		defaultValues: {
			name,
			description: description ?? '',
		},
	});
	const title = type === 'emoji' ? i18n._(EDIT_EMOJI_PACK_DESCRIPTOR) : i18n._(EDIT_STICKER_PACK_DESCRIPTOR);
	const submitHandler = useCallback(
		async (data: FormInputs) => {
			await Packs.updatePack(packId, {name: data.name.trim(), description: data.description.trim() || null});
			onSuccess?.();
			ModalCommands.pop();
		},
		[packId, onSuccess],
	);
	const {handleSubmit, isSubmitting} = useFormSubmit({
		form,
		onSubmit: submitHandler,
		defaultErrorField: 'name',
	});
	return (
		<Modal.Root size="small" onClose={() => ModalCommands.pop()} data-flx="expressions.edit-pack-modal.modal-root">
			<Modal.Header title={title} data-flx="expressions.edit-pack-modal.modal-header" />
			<Modal.Content data-flx="expressions.edit-pack-modal.modal-content">
				<Form
					className={styles.form}
					form={form}
					onSubmit={handleSubmit}
					data-flx="expressions.edit-pack-modal.form.submit"
				>
					<div className={styles.formFields} data-flx="expressions.edit-pack-modal.form-fields">
						<Input
							id="pack-name"
							label={i18n._(PACK_NAME_DESCRIPTOR)}
							error={form.formState.errors.name?.message}
							data-flx="expressions.edit-pack-modal.pack-name"
							{...form.register('name', {
								required: i18n._(PACK_NAME_IS_REQUIRED_DESCRIPTOR),
								minLength: {value: 2, message: i18n._(PACK_NAME_MUST_BE_AT_LEAST_2_CHARACTERS_DESCRIPTOR)},
								maxLength: {value: 64, message: i18n._(PACK_NAME_MUST_BE_AT_MOST_64_CHARACTERS_DESCRIPTOR)},
							})}
						/>
						<Textarea
							id="pack-description"
							label={i18n._(DESCRIPTION_DESCRIPTOR)}
							error={form.formState.errors.description?.message}
							data-flx="expressions.edit-pack-modal.pack-description"
							{...form.register('description', {
								maxLength: {value: 256, message: i18n._(MAXIMUM_256_CHARACTERS_DESCRIPTOR)},
							})}
							minRows={3}
						/>
					</div>
				</Form>
			</Modal.Content>
			<Modal.Footer data-flx="expressions.edit-pack-modal.modal-footer">
				<Button
					variant="secondary"
					onClick={() => ModalCommands.pop()}
					data-flx="expressions.edit-pack-modal.button.pop"
				>
					<Trans>Cancel</Trans>
				</Button>
				<Button onClick={handleSubmit} submitting={isSubmitting} data-flx="expressions.edit-pack-modal.button.submit">
					<Trans>Save</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
