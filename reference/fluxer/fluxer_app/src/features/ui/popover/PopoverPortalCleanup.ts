// SPDX-License-Identifier: AGPL-3.0-or-later

import {getExtendedWindow, supportsRequestIdleCallback} from '@app/features/platform/types/Browser';

const FLOATING_PORTAL_SELECTOR = '[data-floating-ui-portal]';
const PORTAL_CLEANUP_TIMEOUT_MS = 200;

let cleanupScheduled = false;
let sweepRequested = false;
let pendingPopoutKeys = new Set<string>();

function cleanupFloatingPortals(): void {
	cleanupScheduled = false;
	const popoutKeys = pendingPopoutKeys;
	const shouldSweep = sweepRequested;
	pendingPopoutKeys = new Set();
	sweepRequested = false;
	if (typeof document === 'undefined' || (popoutKeys.size === 0 && !shouldSweep)) return;
	const portals = document.querySelectorAll<HTMLElement>(FLOATING_PORTAL_SELECTOR);
	for (const portal of portals) {
		const describedBy = portal.getAttribute('aria-describedby');
		const belongsToPendingPopout = describedBy != null && popoutKeys.has(describedBy);
		const isEmptyOrOrphaned = shouldSweep && (!portal.hasChildNodes() || !document.body.contains(portal.parentElement));
		if (belongsToPendingPopout || isEmptyOrOrphaned) {
			portal.remove();
		}
	}
}

function schedulePortalCleanup(): void {
	if (cleanupScheduled) return;
	cleanupScheduled = true;
	if (typeof window !== 'undefined' && supportsRequestIdleCallback(window)) {
		const extendedWindow = getExtendedWindow();
		if (extendedWindow.requestIdleCallback) {
			extendedWindow.requestIdleCallback(cleanupFloatingPortals, {timeout: PORTAL_CLEANUP_TIMEOUT_MS});
			return;
		}
	}
	requestAnimationFrame(cleanupFloatingPortals);
}

export function schedulePopoutPortalCleanup(popoutKey: string | number): void {
	pendingPopoutKeys.add(String(popoutKey));
	schedulePortalCleanup();
}

export function scheduleFloatingPortalSweep(): void {
	sweepRequested = true;
	schedulePortalCleanup();
}
