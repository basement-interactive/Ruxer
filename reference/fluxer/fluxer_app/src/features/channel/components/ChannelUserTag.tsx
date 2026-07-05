// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/ChannelUserTag.module.css';
import {Trans} from '@lingui/react/macro';
import {clsx} from 'clsx';
import React from 'react';

interface UserTagProps extends React.ComponentPropsWithoutRef<'span'> {
	className?: string;
	system?: boolean;
	size?: 'sm' | 'lg';
}

export const UserTag = React.forwardRef<HTMLSpanElement, UserTagProps>(
	({className, system, size = 'sm', ...props}, ref) => {
		return (
			<span
				className={clsx(styles.tag, size === 'lg' ? styles.tagLg : styles.tagSm, className)}
				ref={ref}
				data-flx="channel.user-tag.tag"
				{...props}
			>
				<span
					className={clsx(styles.text, size === 'lg' ? styles.textLg : styles.textSm)}
					data-flx="channel.user-tag.text"
				>
					{system ? <Trans>System</Trans> : <Trans>Bot</Trans>}
				</span>
			</span>
		);
	},
);

UserTag.displayName = 'UserTag';
