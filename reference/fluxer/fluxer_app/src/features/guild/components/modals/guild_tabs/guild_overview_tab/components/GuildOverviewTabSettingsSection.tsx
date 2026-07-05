// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/guild/components/modals/guild_tabs/guild_overview_tab/GuildOverviewTab.module.css';
import type React from 'react';

export const SettingsSection: React.FC<{
	title: React.ReactNode;
	description?: React.ReactNode;
	children: React.ReactNode;
	id?: string;
}> = ({title, description, children, id}) => {
	return (
		<section className={styles.section} id={id} data-flx="guild.guild-tabs.guild-overview-tab.settings-section.section">
			<div
				className={styles.sectionHeader}
				data-flx="guild.guild-tabs.guild-overview-tab.settings-section.section-header"
			>
				<h2
					className={styles.sectionTitle}
					data-flx="guild.guild-tabs.guild-overview-tab.settings-section.section-title"
				>
					{title}
				</h2>
				{description ? (
					<div
						className={styles.sectionDescription}
						data-flx="guild.guild-tabs.guild-overview-tab.settings-section.section-description"
					>
						{description}
					</div>
				) : null}
			</div>
			{children}
		</section>
	);
};
