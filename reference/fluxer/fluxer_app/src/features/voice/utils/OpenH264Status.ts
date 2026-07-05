// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import {getElectronAPI, isDesktop} from '@app/features/ui/utils/NativeUtils';
import type {OpenH264Status} from '@app/types/electron.d';

const logger = new Logger('OpenH264Status');

let cachedStatus: OpenH264Status | null = null;
let pendingPromise: Promise<OpenH264Status | null> | null = null;

function fetchStatus(): Promise<OpenH264Status | null> {
	if (!isDesktop()) return Promise.resolve(null);
	const electron = getElectronAPI();
	if (!electron?.getOpenH264Status) return Promise.resolve(null);
	return electron
		.getOpenH264Status()
		.then((status) => {
			cachedStatus = status;
			return status;
		})
		.catch((error) => {
			logger.warn('Failed to fetch OpenH264 status', {error});
			return null;
		});
}

export function loadOpenH264Status(): Promise<OpenH264Status | null> {
	if (cachedStatus) return Promise.resolve(cachedStatus);
	if (pendingPromise) return pendingPromise;
	pendingPromise = fetchStatus().finally(() => {
		pendingPromise = null;
	});
	return pendingPromise;
}

export function getOpenH264StatusSync(): OpenH264Status | null {
	return cachedStatus;
}

export function resetOpenH264Status(): void {
	cachedStatus = null;
	pendingPromise = null;
}

export async function setOpenH264Enabled(enabled: boolean): Promise<OpenH264Status | null> {
	if (!isDesktop()) return null;
	const electron = getElectronAPI();
	if (!electron?.setOpenH264Enabled) return null;
	try {
		const status = await electron.setOpenH264Enabled(enabled);
		cachedStatus = status;
		return status;
	} catch (error) {
		logger.warn('Failed to set OpenH264 enabled state', {error});
		return null;
	}
}

if (typeof window !== 'undefined' && isDesktop()) {
	void loadOpenH264Status();
}
