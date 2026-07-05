// SPDX-License-Identifier: AGPL-3.0-or-later

import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {clsx} from 'clsx';
import {type ButtonHTMLAttributes, forwardRef} from 'react';
import styles from './StudioIconButton.module.css';

interface StudioIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	compact?: boolean;
	active?: boolean;
	tone?: 'default' | 'danger';
}

export const StudioIconButton = forwardRef<HTMLButtonElement, StudioIconButtonProps>(function StudioIconButton(
	{compact = false, active = false, tone = 'default', className, type = 'button', children, ...rest},
	ref,
) {
	return (
		<FocusRing offset={-2} data-flx="theme-studio.ui.studio-icon-button.focus-ring">
			<button
				ref={ref}
				type={type}
				className={clsx(
					styles.button,
					compact && styles.compact,
					active && styles.active,
					tone === 'danger' && styles.danger,
					className,
				)}
				data-flx="theme-studio.ui.studio-icon-button.button"
				{...rest}
			>
				{children}
			</button>
		</FocusRing>
	);
});
