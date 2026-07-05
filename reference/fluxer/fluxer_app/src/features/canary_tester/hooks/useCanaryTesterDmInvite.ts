// SPDX-License-Identifier: AGPL-3.0-or-later

import {isCanaryTesterCtaDismissed} from '@app/features/app/components/layout/app_layout/CanaryTesterDismissal';
import Config from '@app/features/app/config/Config';
import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import GuildMembers from '@app/features/member/state/GuildMembers';
import Nagbar from '@app/features/ui/state/Nagbar';
import Users from '@app/features/user/state/Users';
import {CANARY_TESTER_MIN_ACCOUNT_AGE_MS, CANARY_TESTERS_GUILD_ID} from '@fluxer/constants/src/AppConstants';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';

export function useCanaryTesterDmInviteVisible(): boolean {
	const user = Users.currentUser;
	void Nagbar.canaryTesterCtaDismissalVersion;
	if (Nagbar.forceHideCanaryTesterCta) return false;
	if (Nagbar.forceCanaryTesterCta) return true;
	if (!user) return false;
	if (RuntimeConfig.isSelfHosted()) return false;
	if (Config.PUBLIC_RELEASE_CHANNEL !== 'canary') return false;
	if (user.bot) return false;
	if (!user.email || !user.verified) return false;
	if (user.requiredActions && user.requiredActions.length > 0) return false;
	if (SnowflakeUtils.age(user.id) < CANARY_TESTER_MIN_ACCOUNT_AGE_MS) return false;
	if (GuildMembers.getMember(CANARY_TESTERS_GUILD_ID, user.id)) return false;
	return isCanaryTesterCtaDismissed();
}
