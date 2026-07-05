// SPDX-License-Identifier: AGPL-3.0-or-later

import Updater from '@app/features/app/state/Updater';

const CONTROLLER_CHANGE_TIMEOUT_MS = 4000;

export async function ensureLatestAssets(options: {force?: boolean} = {}): Promise<{
	updateFound: boolean;
}> {
	await Updater.checkForUpdates(options.force ?? false);
	return {updateFound: Updater.updateInfo.web.available};
}

export async function activateLatestServiceWorker(): Promise<void> {
	if (!('serviceWorker' in navigator)) {
		return;
	}
	try {
		const registration = await navigator.serviceWorker.getRegistration();
		if (!registration) {
			return;
		}
		await registration.update().catch((error: unknown) => {
			console.warn('[Versioning] Failed to update service worker registration', error);
		});
		const postSkipWaiting = (worker: ServiceWorker | null) => {
			if (!worker) return;
			try {
				worker.postMessage({type: 'SKIP_WAITING'});
			} catch (error) {
				console.warn('[Versioning] Failed to postMessage SKIP_WAITING', error);
			}
		};
		if (registration.waiting) {
			postSkipWaiting(registration.waiting);
		} else if (registration.installing) {
			const installing = registration.installing;
			installing.addEventListener('statechange', () => {
				if (installing.state === 'installed') {
					postSkipWaiting(registration.waiting);
				}
			});
		}
		await waitForControllerChange();
	} catch (error) {
		console.warn('[Versioning] Failed to activate latest service worker', error);
	}
}

async function waitForControllerChange(): Promise<void> {
	if (!('serviceWorker' in navigator)) {
		return;
	}
	if (!navigator.serviceWorker.controller) {
		return;
	}
	await new Promise<void>((resolve) => {
		let settled = false;
		const timeoutId = window.setTimeout(() => {
			if (!settled) {
				settled = true;
				resolve();
			}
		}, CONTROLLER_CHANGE_TIMEOUT_MS);
		const handleControllerChange = () => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timeoutId);
			navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
			resolve();
		};
		navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
	});
}
