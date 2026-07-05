// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsSection} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/components/GuildOverviewTabSettingsSection';
import type {FormInputs} from '@app/features/guild/utils/guild_tabs/GuildOverviewTabUtils';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import type React from 'react';
import type {UseFormReturn} from 'react-hook-form';
import {Controller} from 'react-hook-form';

const ALLOW_FLEXIBLE_TEXT_CHANNEL_NAMES_DESCRIPTOR = msg({
	message: 'Allow flexible text channel names',
	comment: 'Label in the text channel names section.',
});
const WHEN_ENABLED_TEXT_CHANNELS_CAN_HAVE_CAPITALIZED_LETTERS_DESCRIPTOR = msg({
	message:
		'Allow capital letters and spaces in text channel names. Off restricts names to lowercase with hyphens and underscores.',
	comment: 'Label in the text channel names section.',
});
export const TextChannelNamesSection: React.FC<{
	form: UseFormReturn<FormInputs>;
	canManageGuild: boolean;
}> = ({form, canManageGuild}) => {
	const {i18n} = useLingui();
	return (
		<SettingsSection
			title={<Trans>Text channel names</Trans>}
			data-flx="guild.guild-tabs.guild-overview-tab.text-channel-names-section.settings-section"
		>
			<Controller
				name="text_channel_flexible_names"
				control={form.control}
				render={({field}) => (
					<Switch
						label={i18n._(ALLOW_FLEXIBLE_TEXT_CHANNEL_NAMES_DESCRIPTOR)}
						description={i18n._(WHEN_ENABLED_TEXT_CHANNELS_CAN_HAVE_CAPITALIZED_LETTERS_DESCRIPTOR)}
						value={field.value ?? false}
						onChange={field.onChange}
						disabled={!canManageGuild}
						data-flx="guild.guild-tabs.guild-overview-tab.text-channel-names-section.switch.change"
					/>
				)}
				data-flx="guild.guild-tabs.guild-overview-tab.text-channel-names-section.controller"
			/>
		</SettingsSection>
	);
};
