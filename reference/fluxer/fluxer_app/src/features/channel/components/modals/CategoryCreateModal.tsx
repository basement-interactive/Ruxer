// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {useFormSubmit} from '@app/features/app/hooks/useFormSubmit';
import * as ChannelCommands from '@app/features/channel/commands/ChannelCommands';
import {CANCEL_DESCRIPTOR, CREATE_CATEGORY_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Form} from '@app/features/ui/components/form/Form';
import {Input} from '@app/features/ui/components/form/FormInput';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useForm} from 'react-hook-form';

const NAME_DESCRIPTOR = msg({
	message: 'Name',
	comment: 'Short label in the category create modal. Keep it concise.',
});
const NEW_CATEGORY_DESCRIPTOR = msg({
	message: 'New category',
	comment: 'Short label in the category create modal. Keep it concise.',
});

interface FormInputs {
	name: string;
}

export const CategoryCreateModal = observer(({guildId}: {guildId: string}) => {
	const {i18n} = useLingui();
	const form = useForm<FormInputs>();
	const onSubmit = async (data: FormInputs) => {
		await ChannelCommands.create(guildId, {
			name: data.name,
			url: null,
			type: ChannelTypes.GUILD_CATEGORY,
			parent_id: null,
			bitrate: null,
			user_limit: null,
		});
		ModalCommands.pop();
	};
	const {handleSubmit} = useFormSubmit({
		form,
		onSubmit,
		defaultErrorField: 'name',
	});
	return (
		<Modal.Root size="small" centered data-flx="channel.category-create-modal.modal-root">
			<Form form={form} onSubmit={handleSubmit} data-flx="channel.category-create-modal.form.submit">
				<Modal.Header
					title={i18n._(CREATE_CATEGORY_DESCRIPTOR)}
					data-flx="channel.category-create-modal.modal-header"
				/>
				<Modal.Content data-flx="channel.category-create-modal.modal-content">
					<Modal.ContentLayout data-flx="channel.category-create-modal.modal-content-layout">
						<Input
							data-flx="channel.category-create-modal.input"
							{...form.register('name')}
							autoComplete="off"
							autoFocus={true}
							error={form.formState.errors.name?.message}
							label={i18n._(NAME_DESCRIPTOR)}
							maxLength={100}
							minLength={1}
							placeholder={i18n._(NEW_CATEGORY_DESCRIPTOR)}
							required={true}
						/>
					</Modal.ContentLayout>
				</Modal.Content>
				<Modal.Footer data-flx="channel.category-create-modal.modal-footer">
					<Button onClick={ModalCommands.pop} variant="secondary" data-flx="channel.category-create-modal.button.pop">
						{i18n._(CANCEL_DESCRIPTOR)}
					</Button>
					<Button
						type="submit"
						submitting={form.formState.isSubmitting}
						data-flx="channel.category-create-modal.button.submit"
					>
						{i18n._(CREATE_CATEGORY_DESCRIPTOR)}
					</Button>
				</Modal.Footer>
			</Form>
		</Modal.Root>
	);
});
