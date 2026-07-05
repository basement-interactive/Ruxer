// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {getElectronAPI} from '@app/features/ui/utils/NativeUtils';
import type {DesktopTroubleshootingSettings} from '@app/types/electron.d';

const logger = new Logger('DesktopTroubleshootingUtils');

let cachedSettings: DesktopTroubleshootingSettings | null = null;

export function getCachedDesktopTroubleshootingSettings(): DesktopTroubleshootingSettings | null {
	return cachedSettings;
}

export async function getDesktopTroubleshootingSettings(): Promise<DesktopTroubleshootingSettings | null> {
	const electronApi = getElectronAPI();
	if (!electronApi?.getDesktopTroubleshootingSettings) return null;
	try {
		const settings = await electronApi.getDesktopTroubleshootingSettings();
		cachedSettings = settings;
		return settings;
	} catch (error) {
		logger.error('Failed to read desktop troubleshooting settings', error);
		return null;
	}
}

export async function setDesktopDisableHardwareAcceleration(
	disable: boolean,
	options?: {restart?: boolean},
): Promise<DesktopTroubleshootingSettings | null> {
	const electronApi = getElectronAPI();
	if (!electronApi?.setDesktopDisableHardwareAcceleration) return null;
	try {
		const next = await electronApi.setDesktopDisableHardwareAcceleration({
			disable,
			restart: options?.restart ?? false,
		});
		cachedSettings = next;
		return next;
	} catch (error) {
		logger.error('Failed to update desktop hardware-acceleration setting', error);
		return null;
	}
}
