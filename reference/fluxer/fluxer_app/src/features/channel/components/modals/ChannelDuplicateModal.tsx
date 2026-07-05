// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {EXAMPLE_CHANNEL_NAME} from '@app/features/app/config/I18nDisplayConstants';
import {useFormSubmit} from '@app/features/app/hooks/useFormSubmit';
import styles from '@app/features/channel/components/modals/ChannelDuplicateModal.module.css';
import type {Channel} from '@app/features/channel/models/Channel';
import {
	type DuplicateChannelFormInputs,
	duplicateChannel,
	getDuplicateChannelDefaultValues,
} from '@app/features/channel/utils/ChannelCreateModalUtils';
import {CANCEL_DESCRIPTOR, CREATE_CHANNEL_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Form} from '@app/features/ui/components/form/Form';
import {Input} from '@app/features/ui/components/form/FormInput';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useForm} from 'react-hook-form';

const THIS_CHANNEL_DESCRIPTOR = msg({
	message: 'this channel',
	comment: 'Short label in the channel duplicate modal. Keep it concise.',
});
const DUPLICATE_CHANNEL_DESCRIPTOR = msg({
	message: 'Duplicate channel',
	comment: 'Short label in the channel duplicate modal. Keep it concise.',
});
const CHANNEL_NAME_DESCRIPTOR = msg({
	message: 'Channel name',
	comment: 'Short label in the channel duplicate modal. Keep it concise.',
});

interface ChannelDuplicateModalProps {
	guildId: string;
	channel: Channel;
}

export const ChannelDuplicateModal = observer(({guildId, channel}: ChannelDuplicateModalProps) => {
	const {i18n} = useLingui();
	const form = useForm<DuplicateChannelFormInputs>({
		defaultValues: getDuplicateChannelDefaultValues(channel),
	});
	const onSubmit = async (data: DuplicateChannelFormInputs) => {
		await duplicateChannel(guildId, channel, data);
	};
	const {handleSubmit} = useFormSubmit({
		form,
		onSubmit,
		defaultErrorField: 'name',
	});
	const channelLabel = channel.name ? `#${channel.name}` : i18n._(THIS_CHANNEL_DESCRIPTOR);
	const helperText =
		channel.type === ChannelTypes.GUILD_VOICE ? (
			<Trans>
				The new voice channel will reuse the permissions, user limit, and bitrate from{' '}
				<strong data-flx="channel.channel-duplicate-modal.strong">{channelLabel}</strong>.
			</Trans>
		) : (
			<Trans>
				The new channel will reuse the permissions from{' '}
				<strong data-flx="channel.channel-duplicate-modal.strong--2">{channelLabel}</strong>.
			</Trans>
		);
	return (
		<Modal.Root size="small" centered data-flx="channel.channel-duplicate-modal.modal-root">
			<Form form={form} onSubmit={handleSubmit} data-flx="channel.channel-duplicate-modal.form.submit">
				<Modal.Header
					title={i18n._(DUPLICATE_CHANNEL_DESCRIPTOR)}
					data-flx="channel.channel-duplicate-modal.modal-header"
				/>
				<Modal.Content contentClassName={styles.content} data-flx="channel.channel-duplicate-modal.modal-content">
					<Input
						data-flx="channel.channel-duplicate-modal.input"
						{...form.register('name')}
						autoComplete="off"
						autoFocus={true}
						error={form.formState.errors.name?.message}
						footer={
							<p className={styles.helperText} data-flx="channel.channel-duplicate-modal.helper-text">
								{helperText}
							</p>
						}
						label={i18n._(CHANNEL_NAME_DESCRIPTOR)}
						maxLength={100}
						minLength={1}
						placeholder={EXAMPLE_CHANNEL_NAME}
						required={true}
					/>
				</Modal.Content>
				<Modal.Footer data-flx="channel.channel-duplicate-modal.modal-footer">
					<Button onClick={ModalCommands.pop} variant="secondary" data-flx="channel.channel-duplicate-modal.button.pop">
						{i18n._(CANCEL_DESCRIPTOR)}
					</Button>
					<Button
						type="submit"
						submitting={form.formState.isSubmitting}
						data-flx="channel.channel-duplicate-modal.button.submit"
					>
						{i18n._(CREATE_CHANNEL_DESCRIPTOR)}
					</Button>
				</Modal.Footer>
			</Form>
		</Modal.Root>
	);
});
