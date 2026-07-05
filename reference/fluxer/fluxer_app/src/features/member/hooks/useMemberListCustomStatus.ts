// SPDX-License-Identifier: AGPL-3.0-or-later

import MemberSidebar from '@app/features/member/state/MemberSidebar';
import Presence from '@app/features/presence/state/Presence';
import type {CustomStatus} from '@app/features/user/state/CustomStatus';
import {isCustomStatusExpired} from '@app/features/user/state/CustomStatus';
import {CustomStatusEmitter} from '@app/features/user/state/CustomStatusEmitter';
import {isOfflineStatus} from '@fluxer/constants/src/StatusConstants';
import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react';

interface UseMemberListCustomStatusOptions {
	guildId: string;
	channelId: string;
	userId: string;
	enabled?: boolean;
}

type CustomStatusResult = CustomStatus | null | undefined;

function filterExpiredStatus<T extends CustomStatusResult>(status: T): T | null {
	if (status === undefined) {
		return status;
	}
	if (status === null || isCustomStatusExpired(status)) {
		return null;
	}
	return status;
}

export function resolveMemberListCustomStatus({
	guildId,
	channelId,
	userId,
	enabled = true,
}: UseMemberListCustomStatusOptions): CustomStatus | null {
	const memberListPresence = enabled ? MemberSidebar.getPresence(guildId, channelId, userId) : null;
	if (memberListPresence !== null && isOfflineStatus(memberListPresence)) {
		return null;
	}
	const memberListStatus = enabled ? MemberSidebar.getCustomStatus(guildId, channelId, userId) : undefined;
	if (memberListStatus !== undefined) {
		return filterExpiredStatus(memberListStatus);
	}
	if (isOfflineStatus(Presence.getStatus(userId))) {
		return null;
	}
	return filterExpiredStatus(Presence.getCustomStatus(userId));
}

export function useMemberListCustomStatus({
	guildId,
	channelId,
	userId,
	enabled = true,
}: UseMemberListCustomStatusOptions): CustomStatus | null | undefined {
	const [expiryTick, setExpiryTick] = useState(0);
	const timerRef = useRef<number | null>(null);
	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);
	const subscribe = useCallback(
		(onChange: () => void) => {
			if (!enabled) {
				return () => {};
			}
			return CustomStatusEmitter.subscribeToMemberList(guildId, channelId, userId, onChange);
		},
		[guildId, channelId, userId, enabled],
	);
	const getSnapshot = useCallback((): CustomStatus | null | undefined => {
		if (!enabled) {
			return undefined;
		}
		const memberListPresence = MemberSidebar.getPresence(guildId, channelId, userId);
		if (memberListPresence !== null && isOfflineStatus(memberListPresence)) {
			return null;
		}
		return filterExpiredStatus(MemberSidebar.getCustomStatus(guildId, channelId, userId));
	}, [guildId, channelId, userId, enabled, expiryTick]);
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
		timerRef.current = window.setTimeout(() => {
			setExpiryTick((t) => t + 1);
		}, delay);
		return clearTimer;
	}, [customStatus?.expiresAt, clearTimer]);
	return customStatus;
}
