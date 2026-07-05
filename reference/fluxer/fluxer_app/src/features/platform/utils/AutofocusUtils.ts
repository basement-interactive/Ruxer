// SPDX-License-Identifier: AGPL-3.0-or-later

import {Platform} from '@app/features/platform/types/Platform';
import MobileLayout from '@app/features/ui/state/MobileLayout';

export function shouldDisableAutofocusOnMobile(): boolean {
	return Platform.isMobileBrowser || MobileLayout.enabled;
}
