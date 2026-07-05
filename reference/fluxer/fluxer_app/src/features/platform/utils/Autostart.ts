// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {getElectronAPI} from '@app/features/ui/utils/NativeUtils';

const logger = new Logger('AutostartUtils');

let cachedAutostartEnabled: boolean | null = null;

export function getCachedAutostartStatus(): boolean | null {
	return cachedAutostartEnabled;
}

export async function setAutostartEnabled(enabled: boolean): Promise<boolean | null> {
	const electronApi = getElectronAPI();
	if (!electronApi) return null;
	try {
		if (enabled) {
			await electronApi.autostartEnable();
		} else {
			await electronApi.autostartDisable();
		}
		const next = await electronApi.autostartIsEnabled();
		cachedAutostartEnabled = next;
		return next;
	} catch (error) {
		logger.error('Failed to update autostart status', error);
		return null;
	}
}

export async function getAutostartStatus(): Promise<boolean | null> {
	const electronApi = getElectronAPI();
	if (!electronApi) return null;
	try {
		const enabled = await electronApi.autostartIsEnabled();
		cachedAutostartEnabled = enabled;
		return enabled;
	} catch (error) {
		logger.error('Failed to read autostart status', error);
		return null;
	}
}

export async function ensureAutostartDefaultEnabled(): Promise<boolean | null> {
	const electronApi = getElectronAPI();
	if (!electronApi) return null;
	try {
		const initialized = await electronApi.autostartIsInitialized();
		let enabled = await electronApi.autostartIsEnabled();
		if (!initialized && !enabled) {
			const desktopInfo = await electronApi.getDesktopInfo().catch(() => null);
			if (!desktopInfo?.flatpak && !desktopInfo?.portable) {
				await electronApi.autostartEnable();
				enabled = await electronApi.autostartIsEnabled();
			}
		}
		if (!initialized) {
			await electronApi.autostartMarkInitialized();
		}
		cachedAutostartEnabled = enabled;
		return enabled;
	} catch (error) {
		logger.error('Failed to ensure default autostart', error);
		return null;
	}
}
