// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	canUseWindowFocusedHoverControls,
	subscribeWindowHoverControlsChange,
} from '@app/features/ui/utils/WindowFocusInteractionGuard';
import type React from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
	createHoverStateSnapshot,
	type HoverStateEvent,
	type HoverStateSnapshot,
	selectIsHovering,
	transitionHoverStateSnapshot,
} from './HoverStateMachine';

type HoverHook = [React.RefCallback<HTMLElement>, boolean];

export const useHover = (delay = 0): HoverHook => {
	const [snapshot, setSnapshot] = useState<HoverStateSnapshot>(createHoverStateSnapshot);
	const snapshotRef = useRef(snapshot);
	const previousNode = useRef<HTMLElement | null>(null);
	const timeoutId = useRef<NodeJS.Timeout | null>(null);
	const clearHoverTimeout = useCallback(() => {
		if (!timeoutId.current) return;
		clearTimeout(timeoutId.current);
		timeoutId.current = null;
	}, []);
	const sendHoverEvent = useCallback((event: HoverStateEvent) => {
		const nextSnapshot = transitionHoverStateSnapshot(snapshotRef.current, event);
		if (selectIsHovering(nextSnapshot) === selectIsHovering(snapshotRef.current)) return;
		snapshotRef.current = nextSnapshot;
		setSnapshot(nextSnapshot);
	}, []);
	const handleMouseEnter = useCallback(() => {
		clearHoverTimeout();
		if (!canUseWindowFocusedHoverControls()) {
			sendHoverEvent({type: 'hover.leave'});
			return;
		}
		timeoutId.current = setTimeout(() => {
			if (canUseWindowFocusedHoverControls() && previousNode.current?.matches(':hover')) {
				sendHoverEvent({type: 'hover.enter'});
			}
		}, delay);
	}, [clearHoverTimeout, delay, sendHoverEvent]);
	const handleMouseLeave = useCallback(() => {
		clearHoverTimeout();
		sendHoverEvent({type: 'hover.leave'});
	}, [clearHoverTimeout, sendHoverEvent]);
	const syncHoverWithWindowFocus = useCallback(() => {
		clearHoverTimeout();
		if (!canUseWindowFocusedHoverControls() || !previousNode.current?.matches(':hover')) {
			sendHoverEvent({type: 'hover.leave'});
			return;
		}
		timeoutId.current = setTimeout(() => {
			if (canUseWindowFocusedHoverControls() && previousNode.current?.matches(':hover')) {
				sendHoverEvent({type: 'hover.enter'});
			}
		}, delay);
	}, [clearHoverTimeout, delay, sendHoverEvent]);
	useEffect(() => {
		const unsubscribe = subscribeWindowHoverControlsChange(syncHoverWithWindowFocus);
		window.addEventListener('blur', syncHoverWithWindowFocus);
		return () => {
			unsubscribe();
			window.removeEventListener('blur', syncHoverWithWindowFocus);
			clearHoverTimeout();
		};
	}, [clearHoverTimeout, syncHoverWithWindowFocus]);
	const customRef = useCallback(
		(node: HTMLElement | null) => {
			if (previousNode.current) {
				previousNode.current.removeEventListener('mouseenter', handleMouseEnter);
				previousNode.current.removeEventListener('mouseleave', handleMouseLeave);
			}
			if (node) {
				node.addEventListener('mouseenter', handleMouseEnter);
				node.addEventListener('mouseleave', handleMouseLeave);
			}
			previousNode.current = node;
		},
		[handleMouseEnter, handleMouseLeave],
	);
	return [customRef, selectIsHovering(snapshot)];
};
