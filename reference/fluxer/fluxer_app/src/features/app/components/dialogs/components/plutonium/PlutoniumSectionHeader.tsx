// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/dialogs/components/plutonium/PlutoniumSectionHeader.module.css';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface SectionHeaderProps {
	title: React.ReactNode;
	description?: React.ReactNode;
	align?: 'left' | 'center';
}

export const SectionHeader: React.FC<SectionHeaderProps> = observer(({title, description, align = 'left'}) => (
	<div
		className={clsx(styles.header, align === 'center' && styles.headerCenter)}
		data-flx="app.plutonium.section-header.header"
	>
		<h2 className={styles.title} data-flx="app.plutonium.section-header.title">
			{title}
		</h2>
		{description ? (
			<p className={styles.description} data-flx="app.plutonium.section-header.description">
				{description}
			</p>
		) : null}
	</div>
));
