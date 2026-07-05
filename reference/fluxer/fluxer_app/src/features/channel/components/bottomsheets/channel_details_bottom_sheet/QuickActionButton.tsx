// SPDX-License-Identifier: AGPL-3.0-or-later

import {usePressable} from '@app/features/app/hooks/usePressable';
import styles from '@app/features/channel/components/bottomsheets/ChannelDetailsBottomSheet.module.css';
import type {QuickActionButtonProps} from '@app/features/channel/components/bottomsheets/channel_details_bottom_sheet/ChannelDetailsBottomSheetShared';
import clsx from 'clsx';
import type React from 'react';

export const QuickActionButton: React.FC<QuickActionButtonProps> = ({
	icon,
	label,
	onClick,
	isActive,
	danger,
	disabled,
}) => {
	const {isPressed, pressableProps} = usePressable(disabled);
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={clsx(
				styles.quickActionButton,
				isPressed && styles.quickActionButtonPressed,
				isActive && styles.quickActionButtonActive,
				danger && styles.quickActionButtonDanger,
				disabled && styles.quickActionButtonDisabled,
			)}
			data-flx="channel.channel-details-bottom-sheet.quick-action-button.quick-action-button.click"
			{...pressableProps}
		>
			<div
				className={styles.quickActionIcon}
				data-flx="channel.channel-details-bottom-sheet.quick-action-button.quick-action-icon"
			>
				{icon}
			</div>
			<span
				className={styles.quickActionLabel}
				data-flx="channel.channel-details-bottom-sheet.quick-action-button.quick-action-label"
			>
				{label}
			</span>
		</button>
	);
};
