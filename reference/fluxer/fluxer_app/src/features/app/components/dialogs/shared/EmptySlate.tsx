// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/dialogs/shared/EmptySlate.module.css';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface EmptySlateProps {
	Icon: React.ComponentType<React.ComponentProps<'svg'>>;
	title: React.ReactNode;
	description: React.ReactNode;
	fullHeight?: boolean;
}

export const EmptySlate: React.FC<EmptySlateProps> = observer(({Icon, title, description, fullHeight = false}) => {
	return (
		<div
			className={`${styles.container} ${fullHeight ? styles.containerFullHeight : ''}`}
			data-flx="app.empty-slate.container"
		>
			<Icon className={styles.icon} aria-hidden={true} data-flx="app.empty-slate.icon" />
			<h3 className={styles.title} data-flx="app.empty-slate.title">
				{title}
			</h3>
			<p className={styles.description} data-flx="app.empty-slate.description">
				{description}
			</p>
		</div>
	);
});
