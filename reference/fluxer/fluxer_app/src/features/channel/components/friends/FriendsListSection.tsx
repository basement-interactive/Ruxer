// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/friends/FriendsListSection.module.css';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

export const ListSection = observer(
	({
		title,
		count,
		children,
		marginBottom = false,
	}: {
		title: string;
		count: number;
		children: React.ReactNode;
		marginBottom?: boolean;
	}) => (
		<>
			<div className={styles.sectionTitle} data-flx="channel.friends.list-section.section-title">
				{title} — {count}
			</div>
			<div
				className={clsx(marginBottom ? styles.sectionContentWithMargin : styles.sectionContent)}
				data-flx="channel.friends.list-section.section-content"
			>
				{children}
			</div>
		</>
	),
);
