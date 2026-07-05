// SPDX-License-Identifier: AGPL-3.0-or-later

import Presence from '@app/features/presence/state/Presence';
import type {CustomStatus} from '@app/features/user/state/CustomStatus';
import {isCustomStatusExpired} from '@app/features/user/state/CustomStatus';
import {CustomStatusEmitter} from '@app/features/user/state/CustomStatusEmitter';
import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react';

interface UsePresenceCustomStatusOptions {
	userId: string;
	enabled?: boolean;
}

function filterExpiredStatus(status: CustomStatus | null): CustomStatus | null {
	if (status === null || isCustomStatusExpired(status)) {
		return null;
	}
	return status;
}

export function usePresenceCustomStatus({userId, enabled = true}: UsePresenceCustomStatusOptions): CustomStatus | null {
	const [expiryTick, setExpiryTick] = useState(0);
	const timerRef = useRef<NodeJS.Timeout | null>(null);
	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);
	const subscribe = useCallback(
		(onChange: () => void) => {
			if (!enabled) {
				return () => {};
			}
			return CustomStatusEmitter.subscribeToPresence(userId, onChange);
		},
		[userId, enabled],
	);
	const getSnapshot = useCallback((): CustomStatus | null => {
		if (!enabled) {
			return null;
		}
		return filterExpiredStatus(Presence.getCustomStatus(userId));
	}, [userId, enabled, expiryTick]);
	const customStatus = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	useEffect(() => {
		clearTimer();
		if (!customStatus?.expiresAt) {
			return;
		}
		const expiresAtMs = Date.parse(customStatus.expiresAt);
		if (Number.isNaN(expiresAtMs)) {
			return;
		}
		const delay = expiresAtMs - Date.now();
		if (delay <= 0) {
			return;
		}
		timerRef.current = setTimeout(() => {
			setExpiryTick((t) => t + 1);
		}, delay);
		return clearTimer;
	}, [customStatus?.expiresAt, clearTimer]);
	return customStatus;
}
