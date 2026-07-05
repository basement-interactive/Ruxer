// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {getElectronAPI} from '@app/features/ui/utils/NativeUtils';
import type {DesktopWindowBehaviorSettings} from '@app/types/electron.d';

const logger = new Logger('DesktopWindowBehaviorUtils');

let cachedSettings: DesktopWindowBehaviorSettings | null = null;

export function getCachedDesktopWindowBehaviorSettings(): DesktopWindowBehaviorSettings | null {
	return cachedSettings;
}

export async function getDesktopWindowBehaviorSettings(): Promise<DesktopWindowBehaviorSettings | null> {
	const electronApi = getElectronAPI();
	if (!electronApi?.getDesktopWindowBehaviorSettings) return null;
	try {
		const settings = await electronApi.getDesktopWindowBehaviorSettings();
		cachedSettings = settings;
		return settings;
	} catch (error) {
		logger.error('Failed to read desktop window behavior settings', error);
		return null;
	}
}

export async function setDesktopWindowBehaviorSettings(
	settings: Partial<DesktopWindowBehaviorSettings>,
): Promise<DesktopWindowBehaviorSettings | null> {
	const electronApi = getElectronAPI();
	if (!electronApi?.setDesktopWindowBehaviorSettings) return null;
	try {
		const next = await electronApi.setDesktopWindowBehaviorSettings(settings);
		cachedSettings = next;
		return next;
	} catch (error) {
		logger.error('Failed to update desktop window behavior settings', error);
		return null;
	}
}

export async function getDesktopWindowBehaviorPendingRestart(): Promise<boolean> {
	const electronApi = getElectronAPI();
	if (!electronApi?.getDesktopWindowBehaviorPendingRestart) return false;
	try {
		return await electronApi.getDesktopWindowBehaviorPendingRestart();
	} catch (error) {
		logger.error('Failed to read desktop window behavior pending-restart flag', error);
		return false;
	}
}

export async function relaunchDesktopApp(): Promise<void> {
	const electronApi = getElectronAPI();
	if (!electronApi?.desktopAppRelaunch) return;
	try {
		await electronApi.desktopAppRelaunch();
	} catch (error) {
		logger.error('Failed to relaunch desktop app', error);
	}
}
