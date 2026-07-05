// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import DeveloperOptions from '@app/features/devtools/state/DeveloperOptions';
import Permission from '@app/features/permissions/state/Permission';
import Slowmode from '@app/features/slowmode/state/Slowmode';
import Users from '@app/features/user/state/Users';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {useEffect, useState} from 'react';

type TickListener = () => void;

const tickListeners = new Set<TickListener>();

let tickInterval: NodeJS.Timeout | null = null;

const fireTick = (): void => {
	for (const listener of tickListeners) listener();
};
const startTicker = (): void => {
	if (tickInterval !== null) return;
	tickInterval = setInterval(fireTick, 1000);
};
const stopTicker = (): void => {
	if (tickInterval === null) return;
	clearInterval(tickInterval);
	tickInterval = null;
};

if (typeof document !== 'undefined') {
	const handleWake = (): void => {
		if (document.hidden) return;
		fireTick();
	};
	document.addEventListener('visibilitychange', handleWake);
	window.addEventListener('pageshow', handleWake);
	window.addEventListener('focus', handleWake);
}

function subscribeToTicker(listener: TickListener): () => void {
	tickListeners.add(listener);
	startTicker();
	return () => {
		tickListeners.delete(listener);
		if (tickListeners.size === 0) stopTicker();
	};
}

interface SlowmodeState {
	isSlowmodeActive: boolean;
	slowmodeRemaining: number;
	canBypass: boolean;
	isSlowmodeEnabled: boolean;
	isSlowmodeImmune: boolean;
}

export function useSlowmode(channel: Channel): SlowmodeState {
	const [, setTick] = useState(0);
	const currentUser = Users.getCurrentUser();
	const mockSlowmodeActive = DeveloperOptions.mockSlowmodeActive;
	const mockSlowmodeRemaining = DeveloperOptions.mockSlowmodeRemaining;
	const canBypass = channel.guildId ? Permission.can(Permissions.BYPASS_SLOWMODE, channel) : true;
	const rateLimitPerUser = channel.rateLimitPerUser || 0;
	let slowmodeRemaining = 0;
	if (mockSlowmodeActive) {
		slowmodeRemaining = mockSlowmodeRemaining;
	} else if (currentUser && channel.guildId && rateLimitPerUser && !canBypass) {
		slowmodeRemaining = Slowmode.getSlowmodeRemaining(channel.id, rateLimitPerUser);
	}
	const isCountingDown = !mockSlowmodeActive && slowmodeRemaining > 0;
	useEffect(() => {
		if (!isCountingDown) return;
		return subscribeToTicker(() => setTick((t) => t + 1));
	}, [isCountingDown]);
	const isSlowmodeEnabled = mockSlowmodeActive || (Boolean(channel.guildId) && rateLimitPerUser > 0);
	const isSlowmodeImmune = !mockSlowmodeActive && isSlowmodeEnabled && canBypass;
	const isSlowmodeActive = mockSlowmodeActive || (!canBypass && rateLimitPerUser > 0 && slowmodeRemaining > 0);
	return {
		isSlowmodeActive,
		slowmodeRemaining,
		canBypass,
		isSlowmodeEnabled,
		isSlowmodeImmune,
	};
}
