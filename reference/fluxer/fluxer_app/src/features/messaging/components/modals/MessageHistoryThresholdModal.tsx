// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {useFormSubmit} from '@app/features/app/hooks/useFormSubmit';
import * as GuildCommands from '@app/features/guild/commands/GuildCommands';
import {
	MessageHistoryThresholdAccordion,
	MessageHistoryThresholdField,
	type MessageHistoryThresholdFormValues,
} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/sections/MessageHistoryThresholdContent';
import Guilds from '@app/features/guild/state/Guilds';
import Permission from '@app/features/permissions/state/Permission';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Form} from '@app/features/ui/components/form/Form';
import {useRemoteFormReset} from '@app/lib/forms/RemoteFormReset';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {extractTimestamp} from '@fluxer/snowflake/src/SnowflakeUtils';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useMemo} from 'react';
import {useForm} from 'react-hook-form';

const MESSAGE_HISTORY_THRESHOLD_UPDATED_DESCRIPTOR = msg({
	message: 'Message history threshold updated',
	comment: 'Label in the message history threshold modal.',
});
const MESSAGE_HISTORY_THRESHOLD_DESCRIPTOR = msg({
	message: 'Message history threshold',
	comment: 'Short label in the message history threshold modal. Keep it concise.',
});

interface MessageHistoryThresholdModalProps {
	guildId: string;
}

export const MessageHistoryThresholdModal: React.FC<MessageHistoryThresholdModalProps> = observer(({guildId}) => {
	const {i18n} = useLingui();
	const guild = Guilds.getGuild(guildId);
	const canManageGuild = Permission.can(Permissions.MANAGE_GUILD, {guildId});
	const form = useForm<MessageHistoryThresholdFormValues>({
		defaultValues: {message_history_cutoff: guild?.messageHistoryCutoff ?? null},
	});
	const remoteValues: MessageHistoryThresholdFormValues | null = guild
		? {message_history_cutoff: guild.messageHistoryCutoff ?? null}
		: null;
	const {commitRemoteValues} = useRemoteFormReset<MessageHistoryThresholdFormValues>({
		form,
		identityKey: guildId,
		remoteValues,
	});
	const {handleSubmit, isSubmitting} = useFormSubmit({
		form,
		onSubmit: async (data) => {
			if (!guild) return;
			await GuildCommands.update(guild.id, {message_history_cutoff: data.message_history_cutoff});
			commitRemoteValues(data);
			ToastCommands.createToast({type: 'success', children: i18n._(MESSAGE_HISTORY_THRESHOLD_UPDATED_DESCRIPTOR)});
			ModalCommands.pop();
		},
		defaultErrorField: 'message_history_cutoff',
	});
	const guildCreatedAt = useMemo(() => {
		const timestamp = extractTimestamp(guildId);
		return new Date(timestamp);
	}, [guildId]);
	const maxDate = useMemo(() => new Date(), []);
	if (!guild) return null;
	return (
		<Modal.Root
			size="medium"
			centered
			onClose={ModalCommands.pop}
			data-flx="messaging.message-history-threshold-modal.modal-root"
		>
			<Modal.Header
				title={i18n._(MESSAGE_HISTORY_THRESHOLD_DESCRIPTOR)}
				data-flx="messaging.message-history-threshold-modal.modal-header"
			/>
			<Modal.Content data-flx="messaging.message-history-threshold-modal.modal-content">
				<Modal.ContentLayout data-flx="messaging.message-history-threshold-modal.modal-content-layout">
					<Modal.Description data-flx="messaging.message-history-threshold-modal.modal-description">
						<MessageHistoryThresholdAccordion data-flx="messaging.message-history-threshold-modal.message-history-threshold-accordion" />
					</Modal.Description>
					<Form form={form} onSubmit={handleSubmit} data-flx="messaging.message-history-threshold-modal.form.submit">
						<MessageHistoryThresholdField
							form={form}
							name="message_history_cutoff"
							canManageGuild={canManageGuild}
							guildCreatedAt={guildCreatedAt}
							maxDate={maxDate}
							data-flx="messaging.message-history-threshold-modal.message-history-threshold-field"
						/>
					</Form>
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.Footer data-flx="messaging.message-history-threshold-modal.modal-footer">
				<Button
					variant="secondary"
					onClick={ModalCommands.pop}
					disabled={isSubmitting}
					data-flx="messaging.message-history-threshold-modal.button.pop"
				>
					<Trans>Cancel</Trans>
				</Button>
				<Button
					onClick={handleSubmit}
					disabled={!canManageGuild}
					submitting={isSubmitting}
					data-flx="messaging.message-history-threshold-modal.button.submit"
				>
					<Trans>Save</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
