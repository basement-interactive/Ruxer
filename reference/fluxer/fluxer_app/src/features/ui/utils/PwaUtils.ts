// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	isIOSMobileOrTabletUserAgent,
	isMobileOrTabletUserAgent,
} from '@app/features/platform/notifications/NotificationAlertOptions';
import {isElectron} from '@app/features/ui/utils/NativeUtils';

interface NavigatorWithStandalone extends Navigator {
	standalone?: boolean;
}

export function isStandalonePwa(): boolean {
	const matchDisplayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
	const navigatorStandalone = (window.navigator as NavigatorWithStandalone).standalone === true;
	const androidReferrer = document.referrer.includes('android-app://');
	return matchDisplayMode || navigatorStandalone || androidReferrer;
}

export function isMobileOrTablet(): boolean {
	return isMobileOrTabletUserAgent(navigator.userAgent, navigator.maxTouchPoints);
}

export function isInstalledIOSPwa(): boolean {
	return (
		isStandalonePwa() && isIOSMobileOrTabletUserAgent(navigator.userAgent, navigator.maxTouchPoints) && !isElectron()
	);
}

export function isPwaOnMobileOrTablet(): boolean {
	return isStandalonePwa() && isMobileOrTablet();
}

export function isInstalledPwa(): boolean {
	return isStandalonePwa() && !isElectron();
}
