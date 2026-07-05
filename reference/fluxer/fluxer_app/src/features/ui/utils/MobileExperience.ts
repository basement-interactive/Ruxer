// SPDX-License-Identifier: AGPL-3.0-or-later

import MobileLayout from '@app/features/ui/state/MobileLayout';

export function isMobileExperienceEnabled(): boolean {
	return MobileLayout.platformMobileDetected || MobileLayout.isMobileLayout();
}
