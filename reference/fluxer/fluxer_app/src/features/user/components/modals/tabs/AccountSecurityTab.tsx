// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsTabContainer, SettingsTabContent} from '@app/features/app/components/dialogs/shared/SettingsTabLayout';
import {StreamerModeGate} from '@app/features/streamer_mode/components/StreamerModeGate';
import StreamerMode from '@app/features/streamer_mode/state/StreamerMode';
import {AccountSecuritySections} from '@app/features/user/components/modals/tabs/account_security_tab/AccountSecuritySections';
import {
	getAccountSectionForLegacySection,
	getAccountSectionForNestedTab,
} from '@app/features/user/components/settings_utils/SettingsNavigationGroups';
import type {UserSettingsTabType} from '@app/features/user/components/settings_utils/SettingsSectionRegistry';
import Users from '@app/features/user/state/Users';
import WebAuthnCredentials from '@app/features/user/state/WebAuthnCredentials';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useState} from 'react';

interface AccountSecurityTabProps {
	settingsTabType?: UserSettingsTabType;
	initialSubtab?: string;
}

const AccountSecurityTab: React.FC<AccountSecurityTabProps> = observer(({settingsTabType, initialSubtab}) => {
	const user = Users.currentUser;
	const [showMaskedEmail, setShowMaskedEmail] = useState(false);
	if (!user) return null;
	if (StreamerMode.shouldHidePersonalInformation) {
		return (
			<SettingsTabContainer data-flx="user.account-security-tab.settings-tab-container.streamer-mode-gate">
				<SettingsTabContent data-flx="user.account-security-tab.settings-tab-content.streamer-mode-gate">
					<StreamerModeGate data-flx="user.account-security-tab.streamer-mode-gate" />
				</SettingsTabContent>
			</SettingsTabContainer>
		);
	}
	const isClaimed = user.isClaimed();
	const passkeys = isClaimed ? WebAuthnCredentials.credentials : [];
	const targetSection =
		getAccountSectionForNestedTab(settingsTabType) ?? getAccountSectionForLegacySection(initialSubtab);
	return (
		<SettingsTabContainer data-flx="user.account-security-tab.settings-tab-container">
			<SettingsTabContent data-flx="user.account-security-tab.settings-tab-content">
				<AccountSecuritySections
					user={user}
					isClaimed={isClaimed}
					passkeys={passkeys}
					showMaskedEmail={showMaskedEmail}
					setShowMaskedEmail={setShowMaskedEmail}
					targetSection={targetSection}
					data-flx="user.account-security-tab.account-security-sections"
				/>
			</SettingsTabContent>
		</SettingsTabContainer>
	);
});

export default AccountSecurityTab;
