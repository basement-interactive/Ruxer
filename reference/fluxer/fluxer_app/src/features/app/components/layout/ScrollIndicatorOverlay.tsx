// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility from '@app/features/accessibility/state/Accessibility';
import styles from '@app/features/app/components/layout/ScrollIndicatorOverlay.module.css';
import {
	type ActiveScrollIndicator,
	createScrollIndicatorSnapshot,
	type ScrollIndicatorDirection,
	type ScrollIndicatorMachineEvent,
	type ScrollIndicatorSeverity,
	type ScrollIndicatorTargetMeasurement,
	selectActiveScrollIndicator,
	transitionScrollIndicatorSnapshot,
} from '@app/features/app/components/layout/ScrollIndicatorStateMachine';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {clsx} from 'clsx';
import {AnimatePresence, motion} from 'framer-motion';
import type React from 'react';
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';

export type {ScrollIndicatorSeverity};

const SCROLL_DIRECTION_EPSILON = 0.5;

interface MeasurementRect {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

function hasPositiveArea(rect: MeasurementRect): boolean {
	return rect.bottom > rect.top && rect.right > rect.left;
}

function getMeasurableRectInsideScrollContent(node: HTMLElement, container: HTMLElement): MeasurementRect | null {
	const nodeStyle = getComputedStyle(node);
	if (nodeStyle.display === 'none' || nodeStyle.visibility === 'hidden') return null;
	const nodeRect = node.getBoundingClientRect();
	if (!hasPositiveArea(nodeRect)) return null;
	for (let parent = node.parentElement; parent && parent !== container; parent = parent.parentElement) {
		const parentStyle = getComputedStyle(parent);
		if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') return null;
		const parentRect = parent.getBoundingClientRect();
		if (!hasPositiveArea(parentRect)) return null;
	}
	return nodeRect;
}

export function measureScrollIndicatorTargets(container: HTMLElement): Array<ScrollIndicatorTargetMeasurement> {
	const containerRect = container.getBoundingClientRect();
	const nodes = container.querySelectorAll<HTMLElement>(
		'[data-scroll-indicator="mention"],[data-scroll-indicator="unread"]',
	);
	const measurements: Array<ScrollIndicatorTargetMeasurement> = [];
	nodes.forEach((node, order) => {
		const severity = node.dataset.scrollIndicator as ScrollIndicatorSeverity | undefined;
		const id = node.dataset.scrollId;
		if (!severity || !id || !node.isConnected || node.getClientRects().length === 0) return;
		const rect = getMeasurableRectInsideScrollContent(node, container);
		if (!rect) return;
		measurements.push({
			id,
			severity,
			top: container.scrollTop + rect.top - containerRect.top,
			bottom: container.scrollTop + rect.bottom - containerRect.top,
			order,
		});
	});
	return measurements;
}

function findScrollIndicatorNode(container: HTMLElement, id: string): HTMLElement | null {
	const nodes = container.querySelectorAll<HTMLElement>('[data-scroll-id]');
	for (const node of nodes) {
		if (node.dataset.scrollId === id) return node;
	}
	return null;
}

export const useScrollEdgeIndicators = (
	getScrollContainer: () => HTMLElement | null,
	dependencies: React.DependencyList = [],
) => {
	const [snapshot, setSnapshot] = useState(() => createScrollIndicatorSnapshot());
	const activeIndicator = selectActiveScrollIndicator(snapshot);
	const preferredDirectionRef = useRef<ScrollIndicatorDirection | null>(null);
	const lastScrollTopRef = useRef(0);
	const send = useCallback((event: ScrollIndicatorMachineEvent) => {
		setSnapshot((previous) => transitionScrollIndicatorSnapshot(previous, event));
	}, []);
	const refresh = useCallback(() => {
		const container = getScrollContainer();
		if (!container) {
			send({type: 'scrollIndicator.reset'});
			return;
		}
		send({
			type: 'scrollIndicator.measured',
			measurement: {
				scrollTop: container.scrollTop,
				viewportHeight: container.clientHeight,
				targets: measureScrollIndicatorTargets(container),
				preferredDirection: preferredDirectionRef.current,
			},
		});
	}, [getScrollContainer, send]);
	useLayoutEffect(() => {
		refresh();
	}, [refresh, ...dependencies]);
	useLayoutEffect(() => {
		const container = getScrollContainer();
		if (!container) return;
		const content = container.firstElementChild instanceof HTMLElement ? container.firstElementChild : null;
		const resizeObserver =
			typeof ResizeObserver !== 'undefined'
				? new ResizeObserver(() => {
						refresh();
					})
				: null;
		const mutationObserver =
			typeof MutationObserver !== 'undefined'
				? new MutationObserver(() => {
						refresh();
					})
				: null;
		resizeObserver?.observe(container);
		if (content) resizeObserver?.observe(content);
		mutationObserver?.observe(container, {
			attributes: true,
			childList: true,
			subtree: true,
			attributeFilter: ['data-scroll-indicator', 'data-scroll-id', 'class', 'style'],
		});
		return () => {
			resizeObserver?.disconnect();
			mutationObserver?.disconnect();
		};
	}, [getScrollContainer, refresh]);
	useEffect(() => {
		const container = getScrollContainer();
		if (!container) return;
		lastScrollTopRef.current = container.scrollTop;
		const handleScroll = () => {
			const currentScrollTop = container.scrollTop;
			if (currentScrollTop > lastScrollTopRef.current + SCROLL_DIRECTION_EPSILON) {
				preferredDirectionRef.current = 'bottom';
			} else if (currentScrollTop < lastScrollTopRef.current - SCROLL_DIRECTION_EPSILON) {
				preferredDirectionRef.current = 'top';
			}
			lastScrollTopRef.current = currentScrollTop;
			refresh();
		};
		container.addEventListener('scroll', handleScroll, {passive: true});
		return () => {
			container.removeEventListener('scroll', handleScroll);
		};
	}, [getScrollContainer, refresh]);
	useEffect(() => {
		const handleResize = () => refresh();
		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
		};
	}, [refresh]);
	return {activeIndicator, refresh};
};

interface FloatingScrollIndicatorProps {
	label: React.ReactNode;
	severity: ScrollIndicatorSeverity;
	onClick: () => void;
}

const FloatingScrollIndicator = ({label, severity, onClick}: FloatingScrollIndicatorProps) => {
	const prefersReducedMotion = Accessibility.useReducedMotion;
	return (
		<FocusRing offset={-2} data-flx="app.scroll-indicator-overlay.floating-scroll-indicator.focus-ring">
			<motion.button
				type="button"
				className={clsx(styles.indicator, severity === 'mention' ? styles.indicatorMention : styles.indicatorBrand)}
				onClick={onClick}
				initial={{opacity: 1, y: 0, scale: 1}}
				animate={{opacity: 1, y: 0, scale: 1}}
				exit={
					prefersReducedMotion
						? {opacity: 1, y: 0, scale: 1, transition: {duration: 0}}
						: {opacity: 0, y: 0, scale: 1, transition: {duration: 0}}
				}
				transition={{duration: 0}}
				whileHover={prefersReducedMotion ? undefined : {scale: 1.05}}
				whileTap={prefersReducedMotion ? undefined : {y: 1}}
				aria-label={typeof label === 'string' ? label : undefined}
				data-flx="app.scroll-indicator-overlay.floating-scroll-indicator.indicator.click.button"
			>
				{label}
			</motion.button>
		</FocusRing>
	);
};

interface ScrollIndicatorOverlayProps {
	getScrollContainer: () => HTMLElement | null;
	dependencies?: React.DependencyList;
	label: React.ReactNode;
}

export const ScrollIndicatorOverlay = ({getScrollContainer, dependencies = [], label}: ScrollIndicatorOverlayProps) => {
	const {activeIndicator, refresh} = useScrollEdgeIndicators(getScrollContainer, dependencies);
	const scrollIndicatorIntoView = (indicator: ActiveScrollIndicator) => {
		const container = getScrollContainer();
		const node = container ? findScrollIndicatorNode(container, indicator.indicator.id) : null;
		if (!node) {
			refresh();
			return;
		}
		node.scrollIntoView({behavior: Accessibility.useSmoothScrolling ? 'smooth' : 'auto', block: 'nearest'});
		refresh();
		requestAnimationFrame(refresh);
	};
	return (
		<div className={styles.scrollIndicatorLayer} data-flx="app.scroll-indicator-overlay.scroll-indicator-layer">
			<AnimatePresence initial={false} data-flx="app.scroll-indicator-overlay.animate-presence">
				{activeIndicator && (
					<div
						key={`${activeIndicator.direction}:${activeIndicator.indicator.id}:${activeIndicator.indicator.severity}`}
						className={clsx(
							styles.indicatorSlot,
							activeIndicator.direction === 'top' ? styles.indicatorSlotTop : styles.indicatorSlotBottom,
						)}
						data-flx="app.scroll-indicator-overlay.indicator-slot"
					>
						<FloatingScrollIndicator
							severity={activeIndicator.indicator.severity}
							onClick={() => scrollIndicatorIntoView(activeIndicator)}
							label={label}
							data-flx="app.scroll-indicator-overlay.floating-scroll-indicator.scroll-indicator-into-view"
						/>
					</div>
				)}
			</AnimatePresence>
		</div>
	);
};
