// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/friends/EmptyStateView.module.css';
import {UsersThreeIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';

export const EmptyStateView = observer(({title, subtitle}: {title: string; subtitle: string}) => (
	<div className={styles.container} data-flx="channel.friends.empty-state-view.container">
		<UsersThreeIcon weight="fill" className={styles.icon} data-flx="channel.friends.empty-state-view.icon" />
		<h2 className={styles.title} data-flx="channel.friends.empty-state-view.title">
			{title}
		</h2>
		<p className={styles.subtitle} data-flx="channel.friends.empty-state-view.subtitle">
			{subtitle}
		</p>
	</div>
));
