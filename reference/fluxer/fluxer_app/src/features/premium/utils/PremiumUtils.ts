// SPDX-License-Identifier: AGPL-3.0-or-later

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';

export function shouldShowPremiumFeatures(): boolean {
	return !RuntimeConfig.isSelfHosted();
}
