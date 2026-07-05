// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/dialogs/components/Slate.module.css';
import {Button} from '@app/features/ui/button/Button';
import type {Icon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface SlateProps {
	icon: Icon;
	title: string;
	description: string;
	buttonText?: string;
	onClick?: () => void;
}

export const Slate: React.FC<SlateProps> = observer(({icon: Icon, title, description, buttonText, onClick}) => (
	<div className={styles.container} data-flx="app.slate.container">
		<div className={styles.content} data-flx="app.slate.content">
			<div className={styles.iconTextContainer} data-flx="app.slate.icon-text-container">
				<Icon className={styles.icon} data-flx="app.slate.icon" />
				<div className={styles.textContainer} data-flx="app.slate.text-container">
					<h3 className={styles.title} data-flx="app.slate.title">
						{title}
					</h3>
					<p className={styles.description} data-flx="app.slate.description">
						{description}
					</p>
				</div>
			</div>
			{buttonText && (
				<Button onClick={onClick} data-flx="app.slate.button.click">
					{buttonText}
				</Button>
			)}
		</div>
	</div>
));
