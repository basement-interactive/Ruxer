// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/friends/ActionButton.module.css';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

export const ActionButton = observer(
	({
		tooltip,
		onClick,
		className,
		danger = false,
		children,
	}: {
		tooltip: string;
		onClick: (e: React.MouseEvent<HTMLButtonElement>, target: HTMLButtonElement) => void;
		className?: string;
		danger?: boolean;
		children: React.ReactNode;
	}) => (
		<Tooltip text={tooltip} position="top" data-flx="channel.friends.action-button.tooltip">
			<FocusRing data-flx="channel.friends.action-button.focus-ring">
				<button
					type="button"
					className={clsx(styles.button, danger && styles.danger, !danger && className)}
					onClick={(e) => {
						e.stopPropagation();
						onClick(e, e.currentTarget);
					}}
					data-flx="channel.friends.action-button.button.stop-propagation"
				>
					{children}
				</button>
			</FocusRing>
		</Tooltip>
	),
);
