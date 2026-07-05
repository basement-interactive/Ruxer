// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsTabContainer, SettingsTabContent} from '@app/features/app/components/dialogs/shared/SettingsTabLayout';
import {PrivacyDashboardContent} from '@app/features/user/components/modals/tabs/privacy_safety_tab/PrivacySafetyTabInline';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const PrivacySafetyTab: React.FC = observer(() => {
	return (
		<SettingsTabContainer data-flx="user.privacy-safety-tab.settings-tab-container">
			<SettingsTabContent data-flx="user.privacy-safety-tab.settings-tab-content">
				<PrivacyDashboardContent data-flx="user.privacy-safety-tab.privacy-dashboard-content" />
			</SettingsTabContent>
		</SettingsTabContainer>
	);
});

export default PrivacySafetyTab;
