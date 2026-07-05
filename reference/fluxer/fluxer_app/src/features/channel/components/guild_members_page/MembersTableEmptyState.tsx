// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/GuildMembersPage.module.css';
import {Trans} from '@lingui/react/macro';

export function MembersTableEmptyState({variant}: {variant: 'error' | 'empty-search'}) {
	return (
		<div className={styles.emptyState} data-flx="channel.guild-members-page.members-table-empty-state.empty-state">
			<p
				className={styles.emptyStateText}
				data-flx="channel.guild-members-page.members-table-empty-state.empty-state-text"
			>
				{variant === 'error' ? (
					<Trans>Something went wrong loading members. Try again later.</Trans>
				) : (
					<Trans>Nobody matches that search.</Trans>
				)}
			</p>
		</div>
	);
}
