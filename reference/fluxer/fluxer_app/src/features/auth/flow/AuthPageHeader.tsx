// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/auth/flow/AuthPageStyles.module.css';
import {GuildBadge} from '@app/features/guild/components/GuildBadge';
import type {ReactNode} from 'react';

interface AuthPageHeaderStatProps {
	value: string | number;
	dot?: 'online' | 'offline';
}

interface AuthPageHeaderProps {
	icon: ReactNode;
	title: string;
	subtitle: string;
	features?: ReadonlyArray<string>;
	stats?: Array<AuthPageHeaderStatProps>;
}

export function AuthPageHeader({icon, title, subtitle, features, stats}: AuthPageHeaderProps) {
	return (
		<div className={styles.entityHeader} data-flx="auth.flow.auth-page-header.entity-header">
			{icon}
			<div className={styles.entityDetails} data-flx="auth.flow.auth-page-header.entity-details">
				<p className={styles.entityText} data-flx="auth.flow.auth-page-header.entity-text">
					{title}
				</p>
				<div className={styles.entityTitleWrapper} data-flx="auth.flow.auth-page-header.entity-title-wrapper">
					<h2 className={styles.entityTitle} data-flx="auth.flow.auth-page-header.entity-title">
						{subtitle}
					</h2>
					{features && <GuildBadge features={features} data-flx="auth.flow.auth-page-header.guild-badge" />}
				</div>
				{stats && stats.length > 0 && (
					<div className={styles.entityStats} data-flx="auth.flow.auth-page-header.entity-stats">
						{stats.map((stat, index) => (
							<div key={index} className={styles.entityStat} data-flx="auth.flow.auth-page-header.entity-stat">
								{stat.dot === 'online' && (
									<div className={styles.onlineDot} data-flx="auth.flow.auth-page-header.online-dot" />
								)}
								{stat.dot === 'offline' && (
									<div className={styles.offlineDot} data-flx="auth.flow.auth-page-header.offline-dot" />
								)}
								<span className={styles.statText} data-flx="auth.flow.auth-page-header.stat-text">
									{stat.value}
								</span>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
