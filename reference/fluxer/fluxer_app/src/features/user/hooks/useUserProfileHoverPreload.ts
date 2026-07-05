// SPDX-License-Identifier: AGPL-3.0-or-later

import * as UserProfileCommands from '@app/features/user/commands/UserProfileCommands';
import {useCallback, useEffect, useRef} from 'react';

const USER_PROFILE_HOVER_PRELOAD_DELAY_MS = 220;

interface UseUserProfileHoverPreloadOptions {
	userId: string;
	guildId?: string;
	enabled?: boolean;
}

export function useUserProfileHoverPreload({userId, guildId, enabled = true}: UseUserProfileHoverPreloadOptions): {
	scheduleProfilePreload: () => void;
	cancelProfilePreload: () => void;
	preloadProfileNow: () => void;
} {
	const timerRef = useRef<number | null>(null);
	const cancelProfilePreload = useCallback(() => {
		if (timerRef.current == null || typeof window === 'undefined') {
			timerRef.current = null;
			return;
		}
		window.clearTimeout(timerRef.current);
		timerRef.current = null;
	}, []);
	const preloadProfileNow = useCallback(() => {
		cancelProfilePreload();
		if (!enabled || !UserProfileCommands.canOpenUserProfileSurface()) {
			return;
		}
		void UserProfileCommands.fetch(userId, guildId).catch(() => {});
	}, [cancelProfilePreload, enabled, guildId, userId]);
	const scheduleProfilePreload = useCallback(() => {
		if (!enabled || typeof window === 'undefined' || !UserProfileCommands.canOpenUserProfileSurface()) {
			return;
		}
		cancelProfilePreload();
		timerRef.current = window.setTimeout(preloadProfileNow, USER_PROFILE_HOVER_PRELOAD_DELAY_MS);
	}, [cancelProfilePreload, enabled, preloadProfileNow]);
	useEffect(() => cancelProfilePreload, [cancelProfilePreload, enabled, guildId, userId]);
	return {scheduleProfilePreload, cancelProfilePreload, preloadProfileNow};
}
