// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/ui/alt_text_tooltip/AltTextTooltip.module.css';
import {EmojiTooltipContent} from '@app/features/ui/emoji_tooltip_content/EmojiTooltipContent';
import {HoverFloatingTooltipSurface} from '@app/features/ui/tooltip/HoverFloatingTooltipSurface';
import {HoverFloatingTooltipTrigger} from '@app/features/ui/tooltip/HoverFloatingTooltipTrigger';
import {useHoverFloatingTooltip} from '@app/features/ui/tooltip/useHoverFloatingTooltip';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect} from 'react';

interface AltTextTooltipProps {
	altText: string;
	children: React.ReactElement<{ref?: React.Ref<HTMLElement>}>;
	onPopoutToggle?: (open: boolean) => void;
}

export const AltTextTooltip: React.FC<AltTextTooltipProps> = observer(({altText, children, onPopoutToggle}) => {
	const tooltip = useHoverFloatingTooltip(200, 'top-end');
	useEffect(() => {
		if (!onPopoutToggle) {
			return;
		}
		onPopoutToggle(tooltip.state.isOpen);
	}, [onPopoutToggle, tooltip.state.isOpen]);
	const stopPropagation = useCallback((event: React.SyntheticEvent) => {
		event.stopPropagation();
	}, []);
	return (
		<>
			<HoverFloatingTooltipTrigger
				tooltip={tooltip}
				data-flx="ui.alt-text-tooltip.alt-text-tooltip.hover-floating-tooltip-trigger"
			>
				{children}
			</HoverFloatingTooltipTrigger>
			<HoverFloatingTooltipSurface
				tooltip={tooltip}
				portalDataFlx="ui.alt-text-tooltip.alt-text-tooltip.floating-portal"
				presenceDataFlx="ui.alt-text-tooltip.alt-text-tooltip.animate-presence"
				data-flx="ui.alt-text-tooltip.alt-text-tooltip.div.stop-propagation"
				onMouseDown={stopPropagation}
				onTouchStart={stopPropagation}
				onClick={stopPropagation}
			>
				<EmojiTooltipContent
					className={styles.tooltip}
					primaryContent={
						<span className={styles.text} data-flx="ui.alt-text-tooltip.alt-text-tooltip.text">
							{altText}
						</span>
					}
					data-flx="ui.alt-text-tooltip.alt-text-tooltip.tooltip"
				/>
			</HoverFloatingTooltipSurface>
		</>
	);
});
