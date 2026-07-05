// SPDX-License-Identifier: AGPL-3.0-or-later

import sharedStyles from '@app/features/channel/components/ExpressionPickerShared.module.css';
import type React from 'react';

interface PickerEmptyStateProps {
	icon: React.ComponentType<{className?: string}>;
	title: string;
	description: string;
}

export const PickerEmptyState = ({icon: Icon, title, description}: PickerEmptyStateProps) => (
	<div className={sharedStyles.emptyState} data-flx="channel.picker-empty-state.div">
		<div className={sharedStyles.emptyStateContent} data-flx="channel.picker-empty-state.div--2">
			<Icon className={sharedStyles.emptyStateIcon} data-flx="channel.picker-empty-state.icon" />
			<div className={sharedStyles.emptyStateTextContainer} data-flx="channel.picker-empty-state.div--3">
				<h3 className={sharedStyles.emptyStateTitle} data-flx="channel.picker-empty-state.h3">
					{title}
				</h3>
				<p className={sharedStyles.emptyStateDescription} data-flx="channel.picker-empty-state.p">
					{description}
				</p>
			</div>
		</div>
	</div>
);
