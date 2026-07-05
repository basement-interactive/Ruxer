// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsSection} from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/components/GuildOverviewTabSettingsSection';
import type {FormInputs} from '@app/features/guild/utils/guild_tabs/GuildOverviewTabUtils';
import {openMessageHistoryThresholdSettings} from '@app/features/guild/utils/guild_tabs/GuildOverviewTabUtils';
import {formatPermissionLabel} from '@app/features/permissions/utils/PermissionUtils';
import {Button} from '@app/features/ui/button/Button';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {Trans, useLingui} from '@lingui/react/macro';
import type React from 'react';
import type {UseFormReturn} from 'react-hook-form';

export const MessageHistoryCutoffSection: React.FC<{
	form: UseFormReturn<FormInputs>;
	canManageGuild: boolean;
	guildId: string;
}> = ({form: _form, canManageGuild, guildId}) => {
	const {i18n} = useLingui();
	const readMessageHistoryPermissionLabel = formatPermissionLabel(i18n, Permissions.READ_MESSAGE_HISTORY);
	return (
		<SettingsSection
			title={<Trans>Change what users without "{readMessageHistoryPermissionLabel}" can see</Trans>}
			description={
				<Trans>
					Use a dedicated modal to set a message history threshold date for members who don't have the{' '}
					{readMessageHistoryPermissionLabel} permission.
				</Trans>
			}
			data-flx="guild.guild-tabs.guild-overview-tab.message-history-cutoff-section.settings-section"
		>
			<Button
				variant="secondary"
				onClick={() => openMessageHistoryThresholdSettings(guildId)}
				disabled={!canManageGuild}
				data-flx="guild.guild-tabs.guild-overview-tab.message-history-cutoff-section.button.open-message-history-threshold-settings"
			>
				<Trans>Open message history threshold</Trans>
			</Button>
		</SettingsSection>
	);
};
