// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {useFormSubmit} from '@app/features/app/hooks/useFormSubmit';
import * as FavoriteMemeCommands from '@app/features/expressions/commands/FavoriteMemeCommands';
import {MemeFormFields} from '@app/features/expressions/components/modals/meme_form/MemeFormFields';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Form} from '@app/features/ui/components/form/Form';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useCallback, useMemo} from 'react';
import {useForm} from 'react-hook-form';

const ADD_TO_SAVED_MEDIA_DESCRIPTOR = msg({
	message: 'Add to saved media',
	comment: 'Action that adds the selected media to saved media.',
});

interface AddFavoriteMemeModalProps {
	channelId: string;
	messageId: string;
	attachmentId?: string;
	embedIndex?: number;
	defaultName?: string;
	defaultAltText?: string;
}

interface FormInputs {
	name: string;
	altText?: string;
	tags: Array<string>;
}

export const AddFavoriteMemeModal = observer(function AddFavoriteMemeModalContent({
	channelId,
	messageId,
	attachmentId,
	embedIndex,
	defaultName = '',
	defaultAltText = '',
}: AddFavoriteMemeModalProps) {
	const {i18n} = useLingui();
	const form = useForm<FormInputs>({
		defaultValues: {
			name: defaultName,
			altText: defaultAltText,
			tags: [],
		},
	});
	const onSubmit = useCallback(
		async (data: FormInputs) => {
			await FavoriteMemeCommands.createFavoriteMeme(i18n, {
				channelId,
				messageId,
				attachmentId,
				embedIndex,
				name: data.name.trim(),
				altText: data.altText?.trim() || undefined,
				tags: data.tags.length > 0 ? data.tags : undefined,
			});
			ModalCommands.popByType(AddFavoriteMemeModal);
		},
		[channelId, messageId, attachmentId, embedIndex],
	);
	const pathMap = useMemo(
		() => ({
			media: 'name' as const,
			attachment_id: 'name' as const,
			embed_index: 'name' as const,
		}),
		[],
	);
	const {handleSubmit: handleSave} = useFormSubmit({
		form,
		onSubmit,
		defaultErrorField: 'name',
		pathMap,
	});
	return (
		<Modal.Root
			size="small"
			centered
			data-flx="expressions.add-favorite-meme-modal.add-favorite-meme-modal-content.modal-root"
		>
			<Modal.Header
				title={i18n._(ADD_TO_SAVED_MEDIA_DESCRIPTOR)}
				data-flx="expressions.add-favorite-meme-modal.add-favorite-meme-modal-content.modal-header"
			/>
			<Modal.Content data-flx="expressions.add-favorite-meme-modal.add-favorite-meme-modal-content.modal-content">
				<Form
					form={form}
					onSubmit={handleSave}
					data-flx="expressions.add-favorite-meme-modal.add-favorite-meme-modal-content.form.save"
				>
					<Modal.ContentLayout data-flx="expressions.add-favorite-meme-modal.add-favorite-meme-modal-content.modal-content-layout">
						<MemeFormFields
							form={form}
							data-flx="expressions.add-favorite-meme-modal.add-favorite-meme-modal-content.meme-form-fields"
						/>
					</Modal.ContentLayout>
				</Form>
			</Modal.Content>
			<Modal.Footer data-flx="expressions.add-favorite-meme-modal.add-favorite-meme-modal-content.modal-footer">
				<Button
					variant="secondary"
					onClick={() => ModalCommands.pop()}
					data-flx="expressions.add-favorite-meme-modal.add-favorite-meme-modal-content.button.pop"
				>
					<Trans>Cancel</Trans>
				</Button>
				<Button
					onClick={handleSave}
					disabled={!form.watch('name')?.trim() || form.formState.isSubmitting}
					data-flx="expressions.add-favorite-meme-modal.add-favorite-meme-modal-content.button.save"
				>
					<Trans>Save</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
