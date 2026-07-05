// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/layout/Nagbar.module.css';
import {NativeDragRegion} from '@app/features/app/components/layout/NativeDragRegion';
import {CLOSE_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {useLingui} from '@lingui/react/macro';
import {XIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface NagbarProps {
	isMobile: boolean;
	backgroundColor: string;
	textColor: string;
	children: React.ReactNode;
	onDismiss?: () => void;
	dismissible?: boolean;
}

export const Nagbar = observer(
	({isMobile, backgroundColor, textColor, children, onDismiss, dismissible = false}: NagbarProps) => {
		const {i18n} = useLingui();
		const showDismissButton = dismissible && onDismiss && !isMobile;
		return (
			<NativeDragRegion
				className={clsx(
					styles.nagbar,
					isMobile ? styles.nagbarMobile : styles.nagbarDesktop,
					showDismissButton && styles.nagbarDismissible,
				)}
				style={
					{
						backgroundColor,
						color: textColor,
						'--nagbar-background-color': backgroundColor,
					} as React.CSSProperties
				}
				data-flx="app.nagbar.nagbar"
			>
				{children}
				{showDismissButton && (
					<FocusRing data-flx="app.nagbar.focus-ring">
						<button
							type="button"
							className={styles.dismissButton}
							style={{color: textColor}}
							aria-label={i18n._(CLOSE_DESCRIPTOR)}
							onClick={onDismiss}
							data-flx="app.nagbar.dismiss-button"
						>
							<XIcon weight="bold" className={styles.dismissIcon} data-flx="app.nagbar.dismiss-icon" />
						</button>
					</FocusRing>
				)}
			</NativeDragRegion>
		);
	},
);
