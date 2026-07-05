// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import styles from '@app/features/guild/components/modals/GuildOwnershipWarningModal.module.css';
import {GuildIcon} from '@app/features/guild/components/popouts/GuildIcon';
import type {Guild} from '@app/features/guild/models/Guild';
import {formatGuildSettingsPath} from '@app/features/user/components/settings_utils/GuildSettingsConstants';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const CANNOT_DELETE_ACCOUNT_DESCRIPTOR = msg({
	message: 'Cannot delete account',
	comment: 'Error message in the guild ownership warning modal. Keep the tone plain and specific.',
});

interface GuildOwnershipWarningModalProps {
	ownedGuilds: Array<Guild>;
}

export const GuildOwnershipWarningModal: React.FC<GuildOwnershipWarningModalProps> = observer(({ownedGuilds}) => {
	const {i18n} = useLingui();
	const displayedGuilds = ownedGuilds.slice(0, 3);
	const remainingCount = ownedGuilds.length - 3;
	const generalSettingsPath = formatGuildSettingsPath(i18n, 'overview');
	return (
		<Modal.Root size="small" centered data-flx="guild.guild-ownership-warning-modal.modal-root">
			<Modal.Header
				title={i18n._(CANNOT_DELETE_ACCOUNT_DESCRIPTOR)}
				data-flx="guild.guild-ownership-warning-modal.modal-header"
			/>
			<Modal.Content data-flx="guild.guild-ownership-warning-modal.modal-content">
				<Modal.ContentLayout data-flx="guild.guild-ownership-warning-modal.modal-content-layout">
					<Modal.Description className={styles.content} data-flx="guild.guild-ownership-warning-modal.content">
						<p data-flx="guild.guild-ownership-warning-modal.p">
							<Trans>
								You cannot delete your account while you own communities. Transfer ownership of the following
								communities first:
							</Trans>
						</p>
						<div className={styles.guildList} data-flx="guild.guild-ownership-warning-modal.guild-list">
							{displayedGuilds.map((guild) => (
								<div
									key={guild.id}
									className={styles.guildItem}
									data-flx="guild.guild-ownership-warning-modal.guild-item"
								>
									<GuildIcon
										id={guild.id}
										name={guild.name}
										icon={guild.icon}
										className={styles.guildIcon}
										sizePx={40}
										data-flx="guild.guild-ownership-warning-modal.guild-icon"
									/>
									<div className={styles.guildInfo} data-flx="guild.guild-ownership-warning-modal.guild-info">
										<div className={styles.guildName} data-flx="guild.guild-ownership-warning-modal.guild-name">
											{guild.name}
										</div>
									</div>
								</div>
							))}
							{remainingCount > 0 && (
								<div className={styles.remainingCount} data-flx="guild.guild-ownership-warning-modal.remaining-count">
									<Trans>and {remainingCount} more</Trans>
								</div>
							)}
						</div>
						<p className={styles.helpText} data-flx="guild.guild-ownership-warning-modal.help-text">
							<Trans>To transfer ownership, go to {generalSettingsPath} and use the transfer ownership option.</Trans>
						</p>
					</Modal.Description>
				</Modal.ContentLayout>
			</Modal.Content>
		</Modal.Root>
	);
});
