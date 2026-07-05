// SPDX-License-Identifier: AGPL-3.0-or-later

import {Switch} from '@app/features/ui/components/form/FormSwitch';
import PrivacyPreferences from '@app/features/user/state/PrivacyPreferences';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

export const ActiveNowTabContent: React.FC = observer(function ActiveNowTabContent() {
	const showActiveNow = PrivacyPreferences.getShowActiveNow();
	const handleToggle = useCallback((value: boolean) => {
		PrivacyPreferences.setShowActiveNow(value);
	}, []);
	return (
		<Switch
			label={<Trans>Show active now on the home screen</Trans>}
			description={
				<Trans>
					Show active now on the home screen to surface friends active in voice. You'll see a preview, the channel
					context, who's already there, and a quick way to join in.
				</Trans>
			}
			value={showActiveNow}
			onChange={handleToggle}
			data-flx="user.appearance-tab.active-now-tab.active-now-tab-content.switch.toggle"
		/>
	);
});
