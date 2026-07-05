// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility from '@app/features/accessibility/state/Accessibility';
import {useTooltipPortalRoot} from '@app/features/ui/tooltip/Tooltip';
import styles from '@app/features/ui/tooltip/Tooltip.module.css';
import type {HoverFloatingTooltipResult} from '@app/features/ui/tooltip/useHoverFloatingTooltip';
import {getReducedMotionProps, TOOLTIP_MOTION} from '@app/features/ui/utils/ReducedMotionAnimation';
import {FloatingPortal} from '@floating-ui/react';
import {AnimatePresence, type HTMLMotionProps, motion} from 'framer-motion';
import type React from 'react';
import {useCallback, useMemo} from 'react';

type TooltipSurfaceStyle = React.CSSProperties & {
	'--hover-floating-tooltip-left': string;
	'--hover-floating-tooltip-top': string;
	'--hover-floating-tooltip-visibility': 'visible' | 'hidden';
};

interface HoverFloatingTooltipSurfaceProps
	extends Omit<HTMLMotionProps<'div'>, 'children' | 'className' | 'ref' | 'style'> {
	tooltip: HoverFloatingTooltipResult;
	className?: string;
	children: React.ReactNode;
	portalDataFlx: string;
	presenceDataFlx: string;
	'data-flx': string;
}

export function HoverFloatingTooltipSurface({
	tooltip,
	className,
	children,
	portalDataFlx,
	presenceDataFlx,
	'data-flx': dataFlx,
	...props
}: HoverFloatingTooltipSurfaceProps) {
	const {floatingProps, floatingRef, state, updatePosition} = tooltip;
	const portalRoot = useTooltipPortalRoot(state.isOpen);
	const tooltipMotion = getReducedMotionProps(TOOLTIP_MOTION, Accessibility.useReducedMotion);
	const setFloatingNode = useCallback(
		(node: HTMLDivElement | null) => {
			floatingRef(node);
			if (node) {
				updatePosition();
			}
		},
		[floatingRef, updatePosition],
	);
	const positionStyle = useMemo(
		(): TooltipSurfaceStyle => ({
			'--hover-floating-tooltip-left': `${state.x}px`,
			'--hover-floating-tooltip-top': `${state.y}px`,
			'--hover-floating-tooltip-visibility': state.isReady ? 'visible' : 'hidden',
		}),
		[state.isReady, state.x, state.y],
	);
	const surfaceClassName = className
		? `${styles.hoverFloatingTooltipSurface} ${className}`
		: styles.hoverFloatingTooltipSurface;

	if (!state.isOpen) {
		return null;
	}

	return (
		<FloatingPortal root={portalRoot} data-flx={portalDataFlx}>
			<AnimatePresence data-flx={presenceDataFlx}>
				<motion.div
					ref={setFloatingNode}
					className={surfaceClassName}
					style={positionStyle}
					data-flx={dataFlx}
					{...tooltipMotion}
					{...(floatingProps as HTMLMotionProps<'div'>)}
					{...props}
				>
					{children}
				</motion.div>
			</AnimatePresence>
		</FloatingPortal>
	);
}
