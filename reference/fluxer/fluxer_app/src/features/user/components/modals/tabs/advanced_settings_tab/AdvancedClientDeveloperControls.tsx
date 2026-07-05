// SPDX-License-Identifier: AGPL-3.0-or-later

import {Switch} from '@app/features/ui/components/form/FormSwitch';
import * as UserSettingsCommands from '@app/features/user/commands/UserSettingsCommands';
import UserSettings from '@app/features/user/state/UserSettings';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const ENABLE_DEVELOPER_MODE_DESCRIPTOR = msg({
	message: 'Enable developer mode',
	comment: 'Short label for an advanced developer setting.',
});

export const DeveloperModeControl = observer(() => {
	const {i18n} = useLingui();
	return (
		<Switch
			ariaLabel={i18n._(ENABLE_DEVELOPER_MODE_DESCRIPTOR)}
			value={UserSettings.developerMode}
			onChange={(value) => UserSettingsCommands.update({developerMode: value})}
			compact
			data-flx="user.advanced-settings-tab.switch.developer-mode"
		/>
	);
});
