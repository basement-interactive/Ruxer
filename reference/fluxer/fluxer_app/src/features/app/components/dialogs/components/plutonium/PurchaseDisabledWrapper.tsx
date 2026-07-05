// SPDX-License-Identifier: AGPL-3.0-or-later

import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import type React from 'react';

interface PurchaseDisabledWrapperProps {
	disabled: boolean;
	tooltipText: React.ReactNode;
	children: React.ReactElement;
}

export const PurchaseDisabledWrapper: React.FC<PurchaseDisabledWrapperProps> = ({disabled, tooltipText, children}) => {
	if (!disabled) return children;
	const tooltipContent = typeof tooltipText === 'function' ? (tooltipText as () => React.ReactNode) : () => tooltipText;
	return (
		<Tooltip text={tooltipContent} data-flx="app.plutonium.purchase-disabled-wrapper.tooltip">
			<div data-flx="app.plutonium.purchase-disabled-wrapper.div">{children}</div>
		</Tooltip>
	);
};
