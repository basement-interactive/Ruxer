// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/voice/components/ScreenShareBufferingFrame.module.css';
import {clsx} from 'clsx';
import type React from 'react';

const DOT_CLASS_NAMES = [
	styles.dot0,
	styles.dot1,
	styles.dot2,
	styles.dot3,
	styles.dot4,
	styles.dot5,
	styles.dot6,
	styles.dot7,
	styles.dot8,
] as const;

interface ScreenShareBufferingFrameProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
	label: string;
	status?: 'buffering' | 'failed';
	variant?: 'full' | 'corner';
	title?: string;
	subtext?: string;
	'data-flx'?: string;
}

export function ScreenShareBufferingFrame({
	className,
	label,
	status = 'buffering',
	variant = 'full',
	title,
	subtext,
	'data-flx': dataFlx = 'voice.screen-share-buffering-frame.root',
	...props
}: ScreenShareBufferingFrameProps) {
	return (
		<div
			{...props}
			className={clsx(styles.root, variant === 'corner' && styles.corner, className)}
			role={status === 'failed' ? 'alert' : 'status'}
			data-flx={dataFlx}
		>
			<span className={styles.srOnly} data-flx={`${dataFlx}.label`}>
				{label}
			</span>
			{status === 'failed' ? (
				<div className={styles.failureContent} data-flx={`${dataFlx}.failure-content`}>
					{title && (
						<span className={styles.failureTitle} data-flx={`${dataFlx}.failure-title`}>
							{title}
						</span>
					)}
					{subtext && (
						<span className={styles.failureSubtext} data-flx={`${dataFlx}.failure-subtext`}>
							{subtext}
						</span>
					)}
				</div>
			) : (
				<div className={styles.spinner} aria-hidden="true" data-flx={`${dataFlx}.spinner`}>
					{DOT_CLASS_NAMES.map((dotClassName, index) => (
						<span key={dotClassName} className={clsx(styles.dot, dotClassName)} data-flx={`${dataFlx}.dot-${index}`} />
					))}
				</div>
			)}
		</div>
	);
}
