// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsSection} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/components/GuildOverviewTabSettingsSection';
import type {ChannelLike} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/GuildOverviewTypes';
import type {FormInputs} from '@app/features/guild/utils/guild_tabs/GuildOverviewTabUtils';
import type {ComboboxOption} from '@app/features/ui/components/form/FormCombobox';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {CompactComboboxRow} from '@app/features/user/components/modals/tabs/components/CompactComboboxRow';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import type React from 'react';
import {useMemo} from 'react';
import type {UseFormReturn} from 'react-hook-form';
import {Controller} from 'react-hook-form';

const NO_SYSTEM_CHANNEL_DESCRIPTOR = msg({
	message: 'No system channel',
	comment: 'Empty-state text in the system welcome section.',
});
const UNNAMED_CHANNEL_DESCRIPTOR = msg({
	message: 'Unnamed channel',
	comment: 'Short label in the system welcome section. Keep it concise.',
});
const DESTINATION_CHANNEL_DESCRIPTOR = msg({
	message: 'Destination channel',
	comment: 'Short label in the system welcome section. Keep it concise.',
});
const SELECT_A_CHANNEL_DESCRIPTOR = msg({
	message: 'Select a channel',
	comment: 'Button or menu action label in the system welcome section. Keep it concise.',
});
const HIDE_JOIN_MESSAGES_DESCRIPTOR = msg({
	message: 'Hide join messages',
	comment: 'Short label in the system welcome section. Keep it concise.',
});
export const SystemWelcomeSection: React.FC<{
	form: UseFormReturn<FormInputs>;
	canManageGuild: boolean;
	textChannels: Array<ChannelLike>;
}> = ({form, canManageGuild, textChannels}) => {
	const {i18n} = useLingui();
	const systemChannelOptions = useMemo<Array<ComboboxOption<string | null>>>(
		() => [
			{value: null, label: i18n._(NO_SYSTEM_CHANNEL_DESCRIPTOR)},
			...textChannels.map((channel) => ({
				value: channel.id,
				label: channel.name ?? i18n._(UNNAMED_CHANNEL_DESCRIPTOR),
			})),
		],
		[textChannels, i18n.locale],
	);
	return (
		<SettingsSection
			title={<Trans>System & welcome</Trans>}
			data-flx="guild.guild-tabs.guild-overview-tab.system-welcome-section.settings-section"
		>
			<Controller
				name="system_channel_id"
				control={form.control}
				render={({field}) => (
					<CompactComboboxRow<string | null>
						label={i18n._(DESTINATION_CHANNEL_DESCRIPTOR)}
						value={field.value ?? null}
						onChange={(v) => field.onChange(v)}
						options={systemChannelOptions}
						disabled={!canManageGuild}
						controlWidth="wide"
						menuMinWidth={280}
						dataFlx="guild.guild-tabs.guild-overview-tab.system-welcome-section.form-select.change"
						aria-label={i18n._(SELECT_A_CHANNEL_DESCRIPTOR)}
						data-flx="guild.guild-tabs.guild-overview-tab.system-welcome-section.compact-combobox-row.change"
					/>
				)}
				data-flx="guild.guild-tabs.guild-overview-tab.system-welcome-section.controller"
			/>
			<Controller
				name="suppress_join_notifications"
				control={form.control}
				render={({field}) => (
					<Switch
						label={i18n._(HIDE_JOIN_MESSAGES_DESCRIPTOR)}
						value={field.value ?? false}
						onChange={field.onChange}
						disabled={!canManageGuild}
						data-flx="guild.guild-tabs.guild-overview-tab.system-welcome-section.switch.change"
					/>
				)}
				data-flx="guild.guild-tabs.guild-overview-tab.system-welcome-section.controller--2"
			/>
		</SettingsSection>
	);
};
