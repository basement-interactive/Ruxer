// SPDX-License-Identifier: AGPL-3.0-or-later

import Accessibility from '@app/features/accessibility/state/Accessibility';
import {useAnimatedMediaPlaybackAllowed} from '@app/features/app/hooks/useAnimatedMediaPlayback';
import UserSettings from '@app/features/user/state/UserSettings';
import {StickerAnimationOptions} from '@fluxer/constants/src/UserConstants';
import {useEffect, useState} from 'react';

export type ShouldAnimateKind =
	| 'avatar'
	| 'emoji'
	| 'sticker'
	| 'gif'
	| 'guild_icon'
	| 'banner'
	| 'custom_status_emoji';

export interface UseShouldAnimateOptions {
	kind: ShouldAnimateKind;
	isHovering?: boolean;
	isFocused?: boolean;
	entitlementOk?: boolean;
	respectPlaybackAllowed?: boolean;
}

type ConnectionLike = {
	saveData?: boolean;
	addEventListener?: (event: string, cb: () => void) => void;
};

const getConnection = (): ConnectionLike | undefined => {
	const nav =
		typeof navigator === 'undefined'
			? undefined
			: (navigator as Navigator & {
					connection?: ConnectionLike;
				});
	return nav?.connection;
};

let cachedSaveData: boolean = getConnection()?.saveData === true;

const saveDataListeners = new Set<(value: boolean) => void>();

let saveDataListenerInstalled = false;

function installSaveDataListener(): void {
	if (saveDataListenerInstalled) return;
	const connection = getConnection();
	if (!connection?.addEventListener) {
		saveDataListenerInstalled = true;
		return;
	}
	connection.addEventListener('change', () => {
		const next = getConnection()?.saveData === true;
		if (next !== cachedSaveData) {
			cachedSaveData = next;
			saveDataListeners.forEach((listener) => listener(next));
		}
	});
	saveDataListenerInstalled = true;
}

function useSaveData(): boolean {
	const [saveData, setSaveData] = useState(() => getConnection()?.saveData === true);
	useEffect(() => {
		installSaveDataListener();
		const live = getConnection()?.saveData === true;
		if (live !== cachedSaveData) cachedSaveData = live;
		setSaveData(live);
		saveDataListeners.add(setSaveData);
		return () => {
			saveDataListeners.delete(setSaveData);
		};
	}, []);
	return saveData;
}

function isKeptUnderReducedMotion(kind: ShouldAnimateKind): boolean {
	if (kind === 'emoji' || kind === 'gif' || kind === 'sticker') {
		return Accessibility.isAnimationKeptUnderReducedMotion(kind);
	}
	return false;
}

export type AnimationAllowanceMode = 'ALWAYS' | 'ON_INTERACTION' | 'NEVER';

function getKindAllowance(kind: ShouldAnimateKind): AnimationAllowanceMode {
	switch (kind) {
		case 'emoji':
			return UserSettings.getAnimateEmoji() ? 'ALWAYS' : 'ON_INTERACTION';
		case 'gif':
			return UserSettings.getGifAutoPlay() ? 'ALWAYS' : 'ON_INTERACTION';
		case 'sticker': {
			const value = UserSettings.getAnimateStickers();
			if (value === StickerAnimationOptions.ALWAYS_ANIMATE) return 'ALWAYS';
			if (value === StickerAnimationOptions.NEVER_ANIMATE) return 'NEVER';
			return 'ON_INTERACTION';
		}
		case 'avatar':
		case 'guild_icon':
		case 'banner':
		case 'custom_status_emoji':
			return 'ON_INTERACTION';
	}
}

export interface ShouldAnimateDecisionInput {
	allowance: AnimationAllowanceMode;
	reducedMotion: boolean;
	keptUnderReducedMotion: boolean;
	isInteracting: boolean;
	entitlementOk?: boolean;
	saveData: boolean;
	animatedMediaPlaybackAllowed: boolean;
}

export function resolveShouldAnimateDecision({
	allowance,
	reducedMotion,
	keptUnderReducedMotion,
	isInteracting,
	entitlementOk,
	saveData,
	animatedMediaPlaybackAllowed,
}: ShouldAnimateDecisionInput): boolean {
	if (entitlementOk === false) return false;
	if (saveData) return false;
	if (!animatedMediaPlaybackAllowed) return false;
	if (allowance === 'NEVER') return false;
	if (reducedMotion && !keptUnderReducedMotion) return isInteracting;
	if (allowance === 'ALWAYS') return true;
	return isInteracting;
}

export function useShouldAnimate({
	kind,
	isHovering = false,
	isFocused = false,
	entitlementOk,
	respectPlaybackAllowed = true,
}: UseShouldAnimateOptions): boolean {
	const saveData = useSaveData();
	const animatedMediaPlaybackAllowed = useAnimatedMediaPlaybackAllowed({enabled: respectPlaybackAllowed});
	const allowance = getKindAllowance(kind);
	return resolveShouldAnimateDecision({
		allowance,
		reducedMotion: Accessibility.useReducedMotion,
		keptUnderReducedMotion: isKeptUnderReducedMotion(kind),
		isInteracting: isHovering || isFocused,
		entitlementOk,
		saveData,
		animatedMediaPlaybackAllowed,
	});
}
