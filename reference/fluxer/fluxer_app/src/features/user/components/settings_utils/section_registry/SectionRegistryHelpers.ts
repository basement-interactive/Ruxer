// SPDX-License-Identifier: AGPL-3.0-or-later

import Users from '@app/features/user/state/Users';

export function shouldShowClaimedAccountSections(): boolean {
	return Users.getCurrentUser()?.isClaimed() ?? true;
}
