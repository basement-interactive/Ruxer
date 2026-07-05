// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/ui/components/LiveBadge.module.css';
import {Tooltip, type TooltipPosition} from '@app/features/ui/tooltip/Tooltip';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';

const LIVE_DESCRIPTOR = msg({
	message: 'Live',
	comment: 'Badge label shown on a live or actively-streaming surface.',
});
const SCREEN_SHARING_DESCRIPTOR = msg({
	message: 'Screen sharing',
	comment: 'Status badge label shown on a live tile when the participant is sharing their screen.',
});

interface LiveBadgeProps {
	className?: string;
	showTooltip?: boolean;
	tooltipPosition?: TooltipPosition;
	tone?: 'default' | 'voice_tile';
}

export function LiveBadge({className, showTooltip = true, tooltipPosition, tone = 'default'}: LiveBadgeProps) {
	const {i18n} = useLingui();
	const badge = (
		<span
			className={clsx(styles.liveBadge, tone === 'voice_tile' && styles.liveBadgeOnVoiceTile, className)}
			data-flx="ui.live-badge.live-badge"
		>
			{i18n._(LIVE_DESCRIPTOR)}
		</span>
	);
	if (showTooltip) {
		return (
			<Tooltip text={i18n._(SCREEN_SHARING_DESCRIPTOR)} position={tooltipPosition} data-flx="ui.live-badge.tooltip">
				{badge}
			</Tooltip>
		);
	}
	return badge;
}
