// SPDX-License-Identifier: AGPL-3.0-or-later

import {WarningAlert} from '@app/features/ui/warning_alert/WarningAlert';
import {Trans} from '@lingui/react/macro';
import type React from 'react';

export const UserProfileDataWarning: React.FC = () => {
	return (
		<WarningAlert data-flx="user.user-profile-data-warning.warning-alert">
			<Trans>Unable to load profile banner, badges, and bio.</Trans>
		</WarningAlert>
	);
};
