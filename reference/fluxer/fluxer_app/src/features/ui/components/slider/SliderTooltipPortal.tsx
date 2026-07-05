// SPDX-License-Identifier: AGPL-3.0-or-later

import tooltipStyles from '@app/features/ui/components/SliderTooltip.module.css';
import type {SliderTooltipController} from '@app/features/ui/components/slider/useSliderTooltip';
import {FloatingPortal} from '@floating-ui/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion} from 'framer-motion';
import type React from 'react';

interface SliderTooltipPortalProps {
	showTooltip: boolean;
	shouldRender: boolean;
	value: number;
	onValueRender?: (value: number) => React.ReactNode;
	tooltip: SliderTooltipController;
}

export function SliderTooltipPortal({
	showTooltip,
	shouldRender,
	value,
	onValueRender,
	tooltip,
}: SliderTooltipPortalProps): React.ReactElement | null {
	if (!showTooltip || !shouldRender || !onValueRender) {
		return null;
	}
	return (
		<FloatingPortal root={tooltip.tooltipPortalRoot} data-flx="ui.slider.slider-tooltip-portal.floating-portal">
			<AnimatePresence mode="wait" data-flx="ui.slider.slider-tooltip-portal.animate-presence">
				<motion.div
					key="slider-tooltip"
					ref={(node: HTMLDivElement | null) => {
						if (node) {
							tooltip.tooltipRef.current = node;
							void tooltip.updateTooltipPosition();
						}
					}}
					style={{
						position: 'fixed',
						left: tooltip.tooltipPosition.x,
						top: tooltip.tooltipPosition.y,
						zIndex: 'var(--z-index-tooltip)',
						visibility: tooltip.tooltipPosition.isReady ? 'visible' : 'hidden',
					}}
					data-flx="ui.slider.slider-tooltip-portal.div"
					{...tooltip.tooltipMotion}
				>
					<div className={tooltipStyles.tooltip} data-flx="ui.slider.slider-tooltip-portal.div--2">
						<div
							ref={tooltip.arrowRef}
							className={clsx(tooltipStyles.tooltipPointer, tooltipStyles.tooltipPointerBg)}
							style={{
								left: tooltip.tooltipPosition.arrowX != null ? `${tooltip.tooltipPosition.arrowX}px` : undefined,
								marginLeft: tooltip.tooltipPosition.arrowX != null ? '0' : undefined,
							}}
							data-flx="ui.slider.slider-tooltip-portal.div--3"
						/>
						<div
							className={tooltipStyles.tooltipPointer}
							style={{
								left: tooltip.tooltipPosition.arrowX != null ? `${tooltip.tooltipPosition.arrowX}px` : undefined,
								marginLeft: tooltip.tooltipPosition.arrowX != null ? '0' : undefined,
							}}
							data-flx="ui.slider.slider-tooltip-portal.div--4"
						/>
						<div className={tooltipStyles.tooltipContent} data-flx="ui.slider.slider-tooltip-portal.div--5">
							{onValueRender(value)}
						</div>
					</div>
				</motion.div>
			</AnimatePresence>
		</FloatingPortal>
	);
}
