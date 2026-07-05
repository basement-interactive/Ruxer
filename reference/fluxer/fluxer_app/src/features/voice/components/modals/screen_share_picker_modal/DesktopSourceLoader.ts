// SPDX-License-Identifier: AGPL-3.0-or-later

import {getElectronAPI, isLinuxWaylandDesktopSession} from '@app/features/ui/utils/NativeUtils';
import {
	DESKTOP_SOURCE_PRELOAD_TTL_MS,
	normaliseDesktopSource,
} from '@app/features/voice/components/modals/screen_share_picker_modal/shared';
import type {DesktopSource} from '@app/types/electron.d';

let preloadedDesktopSources: Array<DesktopSource> | null = null;
let preloadedDesktopSourcesAt = 0;
let desktopSourcePreloadPromise: Promise<Array<DesktopSource>> | null = null;

export async function loadScreenShareDesktopSourceList(): Promise<Array<DesktopSource>> {
	if (await isLinuxWaylandDesktopSession()) {
		return [];
	}
	const electronApi = getElectronAPI();
	if (!electronApi) {
		throw new Error('Desktop screen share picker is unavailable outside the desktop app');
	}
	const sources = await electronApi.getDesktopSources(['window', 'screen'], undefined, {listOnly: true});
	return sources.map(normaliseDesktopSource);
}

export async function loadScreenShareDesktopSources(options: {force?: boolean} = {}): Promise<Array<DesktopSource>> {
	if (await isLinuxWaylandDesktopSession()) {
		preloadedDesktopSources = [];
		preloadedDesktopSourcesAt = Date.now();
		return [];
	}
	const now = Date.now();
	if (
		!options.force &&
		preloadedDesktopSources &&
		now - preloadedDesktopSourcesAt >= 0 &&
		now - preloadedDesktopSourcesAt <= DESKTOP_SOURCE_PRELOAD_TTL_MS
	) {
		return preloadedDesktopSources;
	}
	if (desktopSourcePreloadPromise) {
		return desktopSourcePreloadPromise;
	}
	if (options.force) {
		preloadedDesktopSources = null;
		preloadedDesktopSourcesAt = 0;
	}
	const electronApi = getElectronAPI();
	if (!electronApi) {
		throw new Error('Desktop screen share picker is unavailable outside the desktop app');
	}
	const loadPromise = electronApi.getDesktopSources(['window', 'screen']).then((sources) => {
		const normalisedSources = sources.map(normaliseDesktopSource);
		preloadedDesktopSources = normalisedSources;
		preloadedDesktopSourcesAt = Date.now();
		return normalisedSources;
	});
	desktopSourcePreloadPromise = loadPromise;
	void loadPromise
		.finally(() => {
			if (desktopSourcePreloadPromise === loadPromise) {
				desktopSourcePreloadPromise = null;
			}
		})
		.catch(() => {});
	return loadPromise;
}
