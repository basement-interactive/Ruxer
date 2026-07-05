// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/ui/warning_alert/WarningAlert.module.css';
import {WarningIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import type React from 'react';

interface WarningAlertProps {
	title?: React.ReactNode;
	children: React.ReactNode;
	link?: {
		label: React.ReactNode;
		onClick: () => void;
	};
	actions?: React.ReactNode;
	className?: string;
	'data-flx'?: string;
}

export const WarningAlert: React.FC<WarningAlertProps> = ({
	title,
	children,
	link,
	actions,
	className,
	'data-flx': dataFlx,
}) => {
	return (
		<div className={clsx(styles.alert, className)} data-flx={dataFlx ?? 'ui.warning-alert.warning-alert.alert'}>
			<WarningIcon size={16} weight="fill" className={styles.icon} data-flx="ui.warning-alert.warning-alert.icon" />
			<div className={styles.content} data-flx="ui.warning-alert.warning-alert.content">
				{title && (
					<h4 className={styles.title} data-flx="ui.warning-alert.warning-alert.title">
						{title}
					</h4>
				)}
				<p className={styles.text} data-flx="ui.warning-alert.warning-alert.text">
					{children}
				</p>
				{link && (
					<button
						type="button"
						className={styles.link}
						onClick={link.onClick}
						data-flx="ui.warning-alert.warning-alert.link.click.button"
					>
						{link.label}
					</button>
				)}
				{actions && (
					<div className={styles.actions} data-flx="ui.warning-alert.warning-alert.actions">
						{actions}
					</div>
				)}
			</div>
		</div>
	);
};
