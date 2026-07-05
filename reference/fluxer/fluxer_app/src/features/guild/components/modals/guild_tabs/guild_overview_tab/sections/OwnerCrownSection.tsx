// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsSection} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/components/GuildOverviewTabSettingsSection';
import type {FormInputs} from '@app/features/guild/utils/guild_tabs/GuildOverviewTabUtils';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import type React from 'react';
import type {UseFormReturn} from 'react-hook-form';
import {Controller} from 'react-hook-form';

const HIDE_COMMUNITY_OWNER_CROWN_DESCRIPTOR = msg({
	message: 'Hide community owner crown',
	comment: 'Label in the owner crown section.',
});
export const OwnerCrownSection: React.FC<{
	form: UseFormReturn<FormInputs>;
	canManageGuild: boolean;
}> = ({form, canManageGuild}) => {
	const {i18n} = useLingui();
	return (
		<SettingsSection
			title={<Trans>Community owner crown</Trans>}
			data-flx="guild.guild-tabs.guild-overview-tab.owner-crown-section.settings-section"
		>
			<Controller
				name="hide_owner_crown"
				control={form.control}
				render={({field}) => (
					<Switch
						label={i18n._(HIDE_COMMUNITY_OWNER_CROWN_DESCRIPTOR)}
						value={field.value ?? false}
						onChange={field.onChange}
						disabled={!canManageGuild}
						data-flx="guild.guild-tabs.guild-overview-tab.owner-crown-section.switch.change"
					/>
				)}
				data-flx="guild.guild-tabs.guild-overview-tab.owner-crown-section.controller"
			/>
		</SettingsSection>
	);
};
