// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsSection} from '@app/features/app/components/dialogs/shared/SettingsSection';
import {SettingsTabContainer} from '@app/features/app/components/dialogs/shared/SettingsTabLayout';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import * as UserSettingsCommands from '@app/features/user/commands/UserSettingsCommands';
import UserSettings from '@app/features/user/state/UserSettings';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const ClientDeveloperSettingsTab: React.FC = observer(() => {
	return (
		<SettingsTabContainer data-flx="user.client-developer-settings-tab.settings-tab-container">
			<SettingsSection
				id="developer-mode"
				title={<Trans>Developer mode</Trans>}
				description={
					<Trans>
						Turns on client debug logging and reveals debugging menus for inspecting internal app data. Copying
						snowflake IDs remains available without developer mode.
					</Trans>
				}
				data-flx="user.client-developer-settings-tab.settings-tab-section"
			>
				<Switch
					label={<Trans>Enable developer mode</Trans>}
					description={
						<Trans>
							Use this when troubleshooting the client or collecting logs. It may add verbose messages to the browser
							console for the current client.
						</Trans>
					}
					value={UserSettings.developerMode}
					onChange={(value) => UserSettingsCommands.update({developerMode: value})}
					data-flx="user.client-developer-settings-tab.switch.update"
				/>
			</SettingsSection>
		</SettingsTabContainer>
	);
});

export default ClientDeveloperSettingsTab;
