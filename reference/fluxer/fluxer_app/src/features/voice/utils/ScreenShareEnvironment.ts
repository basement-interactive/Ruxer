// SPDX-License-Identifier: AGPL-3.0-or-later

import {getElectronAPI, isLinuxWaylandDesktopSession} from '@app/features/ui/utils/NativeUtils';

export type DisplayShareEnvironment = 'web' | 'desktop-custom' | 'desktop-wayland';

export function resolveDisplayShareEnvironment(
	hasElectronApi: boolean,
	isLinuxWaylandDesktop: boolean,
): DisplayShareEnvironment {
	if (!hasElectronApi) {
		return 'web';
	}
	return isLinuxWaylandDesktop ? 'desktop-wayland' : 'desktop-custom';
}

let cachedEnvironment: DisplayShareEnvironment | null = null;

export async function getDisplayShareEnvironment(): Promise<DisplayShareEnvironment> {
	if (cachedEnvironment != null) return cachedEnvironment;
	const electronApi = getElectronAPI();
	if (!electronApi) {
		cachedEnvironment = 'web';
		return cachedEnvironment;
	}
	const isLinuxWaylandDesktop = electronApi.platform === 'linux' && (await isLinuxWaylandDesktopSession());
	cachedEnvironment = resolveDisplayShareEnvironment(true, isLinuxWaylandDesktop);
	return cachedEnvironment;
}

export function usesNativeDisplaySharePicker(environment: DisplayShareEnvironment): boolean {
	return environment !== 'desktop-custom';
}

export function usesNativeDisplayShareAudioSelection(environment: DisplayShareEnvironment): boolean {
	return environment !== 'desktop-custom';
}

export function prestartAudioToggleIsPickerOwned(environment: DisplayShareEnvironment): boolean {
	return environment === 'web';
}

export function canRestartDisplayShareWithoutPreselectedSource(environment: DisplayShareEnvironment): boolean {
	return environment !== 'desktop-custom';
}

export function shouldShowDesktopDownloadCta(environment: DisplayShareEnvironment): boolean {
	return environment === 'web';
}

export function supportsDeviceScreenShare(): boolean {
	return getElectronAPI() != null;
}
