// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/layout/NagbarButton.module.css';
import {Button} from '@app/features/ui/button/Button';
import {clsx} from 'clsx';
import type React from 'react';

interface NagbarButtonProps {
	children: React.ReactNode;
	onClick: () => void;
	isMobile: boolean;
	className?: string;
	disabled?: boolean;
	submitting?: boolean;
}

export const NagbarButton = ({
	children,
	onClick,
	isMobile,
	className,
	disabled = false,
	submitting,
}: NagbarButtonProps) => {
	return (
		<Button
			variant="inverted"
			superCompact={!isMobile}
			compact={isMobile}
			fitContent
			className={clsx(styles.button, className)}
			onClick={onClick}
			disabled={disabled}
			submitting={submitting}
			data-flx="app.nagbar-button.button.click"
		>
			{children}
		</Button>
	);
};
