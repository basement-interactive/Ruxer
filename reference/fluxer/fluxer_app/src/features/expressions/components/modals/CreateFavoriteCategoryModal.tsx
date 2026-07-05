// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {useFormSubmit} from '@app/features/app/hooks/useFormSubmit';
import {CANCEL_DESCRIPTOR, CREATE_CATEGORY_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import Favorites from '@app/features/messaging/state/Favorites';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Form} from '@app/features/ui/components/form/Form';
import {Input} from '@app/features/ui/components/form/FormInput';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useForm} from 'react-hook-form';

const CREATE_FAVORITE_CATEGORY_FORM_DESCRIPTOR = msg({
	message: 'Create favorite category form',
	comment: 'Accessible label for the create-favorite-category form.',
});
const CATEGORY_NAME_DESCRIPTOR = msg({
	message: 'Category name',
	comment: 'Form field label for the name of a favorites category.',
});
const NEW_CATEGORY_DESCRIPTOR = msg({
	message: 'New category',
	comment: 'Placeholder or default name for a newly created favorites category.',
});

interface FormInputs {
	name: string;
}

export const CreateFavoriteCategoryModal = observer(() => {
	const {i18n} = useLingui();
	const form = useForm<FormInputs>({
		defaultValues: {
			name: '',
		},
	});
	const onSubmit = async (data: FormInputs) => {
		Favorites.createCategory(data.name);
		ModalCommands.pop();
	};
	const {handleSubmit} = useFormSubmit({
		form,
		onSubmit,
		defaultErrorField: 'name',
	});
	return (
		<Modal.Root size="small" centered data-flx="expressions.create-favorite-category-modal.modal-root">
			<Form
				form={form}
				onSubmit={handleSubmit}
				aria-label={i18n._(CREATE_FAVORITE_CATEGORY_FORM_DESCRIPTOR)}
				data-flx="expressions.create-favorite-category-modal.form.submit"
			>
				<Modal.Header
					title={i18n._(CREATE_CATEGORY_DESCRIPTOR)}
					data-flx="expressions.create-favorite-category-modal.modal-header"
				/>
				<Modal.Content data-flx="expressions.create-favorite-category-modal.modal-content">
					<Modal.ContentLayout data-flx="expressions.create-favorite-category-modal.modal-content-layout">
						<Input
							data-flx="expressions.create-favorite-category-modal.input"
							{...form.register('name')}
							autoComplete="off"
							autoFocus={true}
							error={form.formState.errors.name?.message}
							label={i18n._(CATEGORY_NAME_DESCRIPTOR)}
							maxLength={100}
							minLength={1}
							placeholder={i18n._(NEW_CATEGORY_DESCRIPTOR)}
							required={true}
						/>
					</Modal.ContentLayout>
				</Modal.Content>
				<Modal.Footer data-flx="expressions.create-favorite-category-modal.modal-footer">
					<Button
						onClick={ModalCommands.pop}
						variant="secondary"
						data-flx="expressions.create-favorite-category-modal.button.pop"
					>
						{i18n._(CANCEL_DESCRIPTOR)}
					</Button>
					<Button
						type="submit"
						submitting={form.formState.isSubmitting}
						data-flx="expressions.create-favorite-category-modal.button.submit"
					>
						{i18n._(CREATE_CATEGORY_DESCRIPTOR)}
					</Button>
				</Modal.Footer>
			</Form>
		</Modal.Root>
	);
});
