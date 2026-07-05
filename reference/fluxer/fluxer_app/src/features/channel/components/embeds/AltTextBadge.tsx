// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/embeds/AltTextBadge.module.css';
import {AltTextTooltip} from '@app/features/ui/alt_text_tooltip/AltTextTooltip';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import type {FC} from 'react';

interface AltTextBadgeProps {
	altText?: string | null;
	onPopoutToggle?: (open: boolean) => void;
}

const getAltBadgeText = (altText?: string | null): string | null => {
	if (!altText) return null;
	const trimmed = altText.trim();
	return trimmed.length > 0 ? trimmed : null;
};
export const AltTextBadge: FC<AltTextBadgeProps> = ({altText, onPopoutToggle}) => {
	const badgeText = getAltBadgeText(altText);
	if (!badgeText) return null;
	return (
		<div className={styles.wrapper} data-flx="channel.embeds.alt-text-badge.wrapper">
			<AltTextTooltip
				altText={badgeText}
				onPopoutToggle={onPopoutToggle}
				data-flx="channel.embeds.alt-text-badge.alt-text-tooltip"
			>
				<FocusRing offset={-2} data-flx="channel.embeds.alt-text-badge.focus-ring">
					<button
						type="button"
						className={styles.button}
						aria-label={badgeText}
						data-flx="channel.embeds.alt-text-badge.button"
					>
						ALT
					</button>
				</FocusRing>
			</AltTextTooltip>
		</div>
	);
};
