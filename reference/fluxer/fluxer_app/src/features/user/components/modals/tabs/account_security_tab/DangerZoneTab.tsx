// SPDX-License-Identifier: AGPL-3.0-or-later

import {SettingsTabSection} from '@app/features/app/components/dialogs/shared/SettingsTabLayout';
import {AccountDeleteModal} from '@app/features/auth/components/modals/AccountDeleteModal';
import {AccountDisableModal} from '@app/features/auth/components/modals/AccountDisableModal';
import {GuildOwnershipWarningModal} from '@app/features/guild/components/modals/GuildOwnershipWarningModal';
import Guilds from '@app/features/guild/state/Guilds';
import {DELETE_ACCOUNT_DESCRIPTOR, DISABLE_ACCOUNT_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import styles from '@app/features/user/components/modals/tabs/account_security_tab/AccountTab.module.css';
import type {User} from '@app/features/user/models/User';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface DangerZoneTabProps {
	user: User;
	isClaimed: boolean;
}

export const DangerZoneTabContent: React.FC<DangerZoneTabProps> = observer(({user, isClaimed}) => {
	const {i18n} = useLingui();
	const handleDisableAccount = () => {
		ModalCommands.push(
			modal(() => (
				<AccountDisableModal data-flx="user.account-security-tab.danger-zone-tab.handle-disable-account.account-disable-modal" />
			)),
		);
	};
	const handleDeleteAccount = () => {
		const ownedGuilds = Guilds.getOwnedGuilds(user.id);
		if (ownedGuilds.length > 0) {
			ModalCommands.push(
				modal(() => (
					<GuildOwnershipWarningModal
						ownedGuilds={ownedGuilds}
						data-flx="user.account-security-tab.danger-zone-tab.handle-delete-account.guild-ownership-warning-modal"
					/>
				)),
			);
		} else {
			ModalCommands.push(
				modal(() => (
					<AccountDeleteModal data-flx="user.account-security-tab.danger-zone-tab.handle-delete-account.account-delete-modal" />
				)),
			);
		}
	};
	return (
		<>
			{isClaimed && (
				<SettingsTabSection
					title={i18n._(DISABLE_ACCOUNT_DESCRIPTOR)}
					description={<Trans>Temporarily disable your account. You can reactivate it later by signing back in.</Trans>}
					data-flx="user.account-security-tab.danger-zone-tab.danger-zone-tab-content.settings-tab-section"
				>
					<Button
						variant="primary"
						className={styles.claimButton}
						small={true}
						onClick={handleDisableAccount}
						data-flx="user.account-security-tab.danger-zone-tab.danger-zone-tab-content.claim-button.disable-account"
					>
						{i18n._(DISABLE_ACCOUNT_DESCRIPTOR)}
					</Button>
				</SettingsTabSection>
			)}
			<SettingsTabSection
				title={i18n._(DELETE_ACCOUNT_DESCRIPTOR)}
				description={
					<Trans>Permanently delete your account and all associated data. This action cannot be undone.</Trans>
				}
				data-flx="user.account-security-tab.danger-zone-tab.danger-zone-tab-content.settings-tab-section--2"
			>
				<Button
					variant="danger"
					className={styles.claimButton}
					small={true}
					onClick={handleDeleteAccount}
					data-flx="user.account-security-tab.danger-zone-tab.danger-zone-tab-content.claim-button.delete-account"
				>
					{i18n._(DELETE_ACCOUNT_DESCRIPTOR)}
				</Button>
			</SettingsTabSection>
		</>
	);
});
