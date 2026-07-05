// SPDX-License-Identifier: AGPL-3.0-or-later

import AppStorage from '@app/features/platform/state/PersistentStorage';

const CANARY_TESTER_DISMISS_KEY = 'fluxer_canary_tester_cta_dismissed';

export function isCanaryTesterCtaDismissed(): boolean {
	return AppStorage.getItem(CANARY_TESTER_DISMISS_KEY) === '1';
}

export function dismissCanaryTesterCtaNagbar(): void {
	AppStorage.setItem(CANARY_TESTER_DISMISS_KEY, '1');
}

export function resetCanaryTesterCtaNagbar(): void {
	AppStorage.removeItem(CANARY_TESTER_DISMISS_KEY);
}
