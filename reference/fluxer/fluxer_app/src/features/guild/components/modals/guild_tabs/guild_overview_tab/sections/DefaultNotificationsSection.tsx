// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsSection} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/components/GuildOverviewTabSettingsSection';
import Guilds from '@app/features/guild/state/Guilds';
import type {FormInputs} from '@app/features/guild/utils/guild_tabs/GuildOverviewTabUtils';
import type {ComboboxOption} from '@app/features/ui/components/form/FormCombobox';
import {WarningAlert} from '@app/features/ui/warning_alert/WarningAlert';
import {CompactComboboxRow} from '@app/features/user/components/modals/tabs/components/CompactComboboxRow';
import {MessageNotifications} from '@fluxer/constants/src/NotificationConstants';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import type React from 'react';
import type {UseFormReturn} from 'react-hook-form';
import {Controller} from 'react-hook-form';

const DEFAULT_NOTIFICATION_SETTINGS_DESCRIPTOR = msg({
	message: 'Default notification settings',
	comment: 'Short label in the default notifications section. Keep it concise.',
});
const ALL_MESSAGES_DESCRIPTOR = msg({
	message: 'All messages',
	comment: 'Short label in the default notifications section. Keep it concise.',
});
const MENTIONS_ONLY_DESCRIPTOR = msg({
	message: 'Mentions only',
	comment: 'Short label in the default notifications section. Keep it concise.',
});
export const DefaultNotificationsSection: React.FC<{
	form: UseFormReturn<FormInputs>;
	canManageGuild: boolean;
	guildId: string;
}> = ({form, canManageGuild, guildId}) => {
	const {i18n} = useLingui();
	const guild = Guilds.getGuild(guildId)!;
	const notificationOptions: ReadonlyArray<ComboboxOption<number>> = [
		{value: MessageNotifications.ALL_MESSAGES, label: i18n._(ALL_MESSAGES_DESCRIPTOR)},
		{value: MessageNotifications.ONLY_MENTIONS, label: i18n._(MENTIONS_ONLY_DESCRIPTOR)},
	];
	return (
		<SettingsSection
			title={<Trans>Default notifications</Trans>}
			data-flx="guild.guild-tabs.guild-overview-tab.default-notifications-section.settings-section"
		>
			{guild.isLargeGuild && (
				<WarningAlert data-flx="guild.guild-tabs.guild-overview-tab.default-notifications-section.warning-alert">
					<Trans>
						Communities with over 250 people are forced onto the &quot;mentions only&quot; setting. Your original
						setting is preserved and will be restored if the community drops below 250 members.
					</Trans>
				</WarningAlert>
			)}
			<Controller
				name="default_message_notifications"
				control={form.control}
				render={({field}) => (
					<CompactComboboxRow<number>
						label={i18n._(DEFAULT_NOTIFICATION_SETTINGS_DESCRIPTOR)}
						value={guild.isLargeGuild ? MessageNotifications.ONLY_MENTIONS : field.value}
						onChange={field.onChange}
						disabled={!canManageGuild || guild.isLargeGuild}
						options={notificationOptions}
						isSearchable={false}
						controlWidth="medium"
						dataFlx="guild.guild-tabs.guild-overview-tab.default-notifications-section.notification-options.change"
						data-flx="guild.guild-tabs.guild-overview-tab.default-notifications-section.compact-combobox-row.change"
					/>
				)}
				data-flx="guild.guild-tabs.guild-overview-tab.default-notifications-section.controller"
			/>
		</SettingsSection>
	);
};
