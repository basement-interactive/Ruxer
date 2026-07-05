// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/ChannelDivider.module.css';
import {Trans} from '@lingui/react/macro';
import {clsx} from 'clsx';
import React from 'react';

export const Divider = React.forwardRef<
	HTMLDivElement,
	{
		red?: boolean;
		children?: React.ReactNode;
		spacing?: number;
		isDate?: boolean;
		style?: React.CSSProperties;
		className?: string;
		id?: string;
		onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
	}
>(({red = false, children, spacing = 8, isDate = false, style, className, ...rest}, ref) => {
	if (red) {
		if (isDate && children) {
			return (
				<div
					ref={ref}
					className={clsx(styles.unreadContainer, styles.unreadDate, className)}
					style={{marginTop: `${spacing}px`, marginBottom: `${spacing}px`, ...style}}
					data-flx="channel.divider.unread-container"
					{...rest}
				>
					<div className={styles.unreadLine} data-flx="channel.divider.unread-line" />
					<span className={styles.dateWithUnreadText} data-flx="channel.divider.date-with-unread-text">
						{children}
					</span>
					<div className={styles.unreadLine} data-flx="channel.divider.unread-line--2" />
					<span className={styles.unreadBadge} data-flx="channel.divider.unread-badge">
						<Trans>New</Trans>
					</span>
				</div>
			);
		}
		return (
			<div
				ref={ref}
				className={clsx(styles.unreadContainer, className)}
				style={{...style}}
				data-flx="channel.divider.unread-container--2"
				{...rest}
			>
				<div className={styles.unreadLine} data-flx="channel.divider.unread-line--3" />
				<span className={styles.unreadBadge} data-flx="channel.divider.unread-badge--2">
					{children || <Trans>New</Trans>}
				</span>
			</div>
		);
	}
	return (
		<div
			ref={ref}
			className={clsx(styles.container, className)}
			style={{marginTop: `${spacing}px`, marginBottom: `${spacing}px`, ...style}}
			data-flx="channel.divider.container"
			{...rest}
		>
			<div className={styles.line} data-flx="channel.divider.line" />
			{children && (
				<span className={clsx(styles.text, 'text')} data-flx="channel.divider.text">
					{children}
				</span>
			)}
			<div className={styles.line} data-flx="channel.divider.line--2" />
		</div>
	);
});

Divider.displayName = 'Divider';
