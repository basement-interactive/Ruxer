// SPDX-License-Identifier: AGPL-3.0-or-later

import {clsx} from 'clsx';
import type React from 'react';
import styles from './StudioDivider.module.css';

interface StudioDividerProps {
	orientation?: 'horizontal' | 'vertical';
	className?: string;
}

export const StudioDivider: React.FC<StudioDividerProps> = ({orientation = 'horizontal', className}) => (
	<div
		aria-hidden="true"
		className={clsx(styles.divider, styles[orientation], className)}
		data-flx="theme-studio.ui.studio-divider.divider"
	/>
);
