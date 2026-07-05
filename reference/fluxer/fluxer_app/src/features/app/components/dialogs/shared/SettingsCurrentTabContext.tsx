// SPDX-License-Identifier: AGPL-3.0-or-later

import type {UserSettingsTabType} from '@app/features/user/components/settings_utils/SettingsSectionRegistry';
import React, {useContext} from 'react';

const SettingsCurrentTabContext = React.createContext<UserSettingsTabType | null>(null);

export const SettingsCurrentTabProvider = SettingsCurrentTabContext.Provider;

export function useSettingsCurrentTab(): UserSettingsTabType | null {
	return useContext(SettingsCurrentTabContext);
}
