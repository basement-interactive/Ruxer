// SPDX-License-Identifier: AGPL-3.0-or-later

import {WarningAlert} from '@app/features/ui/warning_alert/WarningAlert';
import {Trans} from '@lingui/react/macro';
import type React from 'react';

export const LimitedProfileNotice: React.FC = () => {
	return (
		<WarningAlert data-flx="user.limited-profile-notice.warning-alert">
			<Trans>This user has limited their profile. Some details are hidden from people who aren't their friends.</Trans>
		</WarningAlert>
	);
};
