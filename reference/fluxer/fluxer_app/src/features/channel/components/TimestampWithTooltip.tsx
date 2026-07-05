// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/TimestampWithTooltip.module.css';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import * as DateUtils from '@app/features/user/utils/DateFormatting';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface TimestampWithTooltipProps {
	date: Date;
	children: React.ReactNode;
	className?: string;
	containerRef?: React.Ref<HTMLSpanElement>;
	copyHidden?: boolean;
}

const renderTimeElement = (date: Date, formattedDateTime: string, content: React.ReactNode) => (
	<time
		dateTime={date.toISOString()}
		data-full-date-time={formattedDateTime}
		data-flx="channel.timestamp-with-tooltip.render-time-element.time"
	>
		{content}
	</time>
);
export const TimestampWithTooltip = observer(
	({date, children, className, containerRef, copyHidden}: TimestampWithTooltipProps) => {
		const isMobileLayout = MobileLayout.isEnabled();
		const formattedDateTime = DateUtils.getFormattedDateTimeWithSeconds(date);
		const decoratedChildren = (
			<>
				<i className={styles.hiddenSpacer} aria-hidden="true" data-flx="channel.timestamp-with-tooltip.hidden-spacer">
					{' '}
				</i>
				{children}
			</>
		);
		const timeElement = renderTimeElement(date, formattedDateTime, decoratedChildren);
		return (
			<span
				ref={containerRef}
				className={clsx(className, styles.container)}
				data-message-copy-hidden={copyHidden ? 'true' : undefined}
				data-flx="channel.timestamp-with-tooltip.container"
			>
				{isMobileLayout ? (
					timeElement
				) : (
					<Tooltip
						delay={750}
						text={formattedDateTime}
						maxWidth="none"
						data-flx="channel.timestamp-with-tooltip.tooltip"
					>
						{timeElement}
					</Tooltip>
				)}
			</span>
		);
	},
);
