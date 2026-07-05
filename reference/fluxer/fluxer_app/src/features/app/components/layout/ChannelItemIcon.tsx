// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/layout/ChannelItemIcon.module.css';
import {stopPropagationOnEnterSpace} from '@app/features/input/utils/KeyboardUtils';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import type {Icon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';

interface ChannelItemIconProps {
	icon: Icon;
	label: string;
	onClick?: () => void;
	className?: string;
	selected?: boolean;
	tabIndex?: number;
}

export const ChannelItemIcon = observer(
	({icon: Icon, label, onClick, className, selected = false, tabIndex = -1}: ChannelItemIconProps) => {
		return (
			<Tooltip text={label} data-flx="app.channel-item-icon.tooltip">
				<FocusRing offset={-2} ringClassName={styles.iconFocusRing} data-flx="app.channel-item-icon.focus-ring">
					<button
						type="button"
						tabIndex={tabIndex}
						className={clsx(
							styles.iconButton,
							selected ? styles.iconButtonSelected : styles.iconButtonDefault,
							className,
						)}
						aria-label={label}
						onClick={(e) => {
							e.stopPropagation();
							onClick?.();
						}}
						onKeyDown={stopPropagationOnEnterSpace}
						data-flx="app.channel-item-icon.icon-button.stop-propagation"
					>
						<Icon className={styles.icon} data-flx="app.channel-item-icon.icon" />
					</button>
				</FocusRing>
			</Tooltip>
		);
	},
);
