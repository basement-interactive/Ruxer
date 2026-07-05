// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {useFormSubmit} from '@app/features/app/hooks/useFormSubmit';
import * as FavoriteMemeCommands from '@app/features/expressions/commands/FavoriteMemeCommands';
import styles from '@app/features/expressions/components/modals/EditFavoriteMemeModal.module.css';
import {MemeFormFields} from '@app/features/expressions/components/modals/meme_form/MemeFormFields';
import type {FavoriteMeme} from '@app/features/expressions/models/FavoriteMeme';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Form} from '@app/features/ui/components/form/Form';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useCallback} from 'react';
import {useForm} from 'react-hook-form';

const EDIT_SAVED_MEDIA_DESCRIPTOR = msg({
	message: 'Edit saved media',
	comment: 'Action that opens the editor for a saved media (favorite meme) entry.',
});
const EDIT_SAVED_MEDIA_FORM_DESCRIPTOR = msg({
	message: 'Edit saved media form',
	comment: 'Accessible label for the edit saved media form.',
});

interface EditFavoriteMemeModalProps {
	meme: FavoriteMeme;
}

interface FormInputs {
	name: string;
	altText?: string;
	tags: Array<string>;
}

export const EditFavoriteMemeModal = observer(function EditFavoriteMemeModal({meme}: EditFavoriteMemeModalProps) {
	const {i18n} = useLingui();
	const form = useForm<FormInputs>({
		defaultValues: {
			name: meme.name,
			altText: meme.altText || '',
			tags: meme.tags,
		},
	});
	const onSubmit = useCallback(
		async (data: FormInputs) => {
			await FavoriteMemeCommands.updateFavoriteMeme(i18n, {
				memeId: meme.id,
				name: data.name !== meme.name ? data.name.trim() : undefined,
				altText: data.altText !== (meme.altText || '') ? data.altText?.trim() || null : undefined,
				tags: JSON.stringify(data.tags) !== JSON.stringify(meme.tags) ? data.tags : undefined,
			});
			ModalCommands.pop();
		},
		[meme],
	);
	const {handleSubmit: handleSave} = useFormSubmit({
		form,
		onSubmit,
		defaultErrorField: 'name',
	});
	return (
		<Modal.Root size="small" centered data-flx="expressions.edit-favorite-meme-modal.modal-root">
			<Modal.Header
				title={i18n._(EDIT_SAVED_MEDIA_DESCRIPTOR)}
				data-flx="expressions.edit-favorite-meme-modal.modal-header"
			/>
			<Modal.Content data-flx="expressions.edit-favorite-meme-modal.modal-content">
				<Form
					form={form}
					onSubmit={handleSave}
					aria-label={i18n._(EDIT_SAVED_MEDIA_FORM_DESCRIPTOR)}
					data-flx="expressions.edit-favorite-meme-modal.form.save"
				>
					<div className={styles.formContainer} data-flx="expressions.edit-favorite-meme-modal.form-container">
						<MemeFormFields form={form} data-flx="expressions.edit-favorite-meme-modal.meme-form-fields" />
					</div>
				</Form>
			</Modal.Content>
			<Modal.Footer data-flx="expressions.edit-favorite-meme-modal.modal-footer">
				<Button
					variant="secondary"
					onClick={() => ModalCommands.pop()}
					data-flx="expressions.edit-favorite-meme-modal.button.pop"
				>
					<Trans>Cancel</Trans>
				</Button>
				<Button
					onClick={handleSave}
					disabled={!form.watch('name')?.trim() || form.formState.isSubmitting}
					data-flx="expressions.edit-favorite-meme-modal.button.save"
				>
					<Trans>Save</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
