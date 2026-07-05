// SPDX-License-Identifier: AGPL-3.0-or-later

import Theme from '@app/features/theme/state/Theme';
import {broadcastThemeStudioMessage} from '@app/features/theme_studio/state/ThemeStudioBroadcast';
import * as UserSettingsCommands from '@app/features/user/commands/UserSettingsCommands';
import type {ThemeType} from '@fluxer/constants/src/UserConstants';

function applyLocalThemePreference(theme: ThemeType): void {
	Theme.setTheme(theme);
}

function persistThemePreference(theme: ThemeType): void {
	void UserSettingsCommands.update({theme});
}

function broadcastThemePreference(): void {
	broadcastThemeStudioMessage({type: 'themePreference', snapshot: Theme.getPreferenceSnapshot()});
}

export function updateThemePreference(theme: ThemeType): boolean {
	if (Theme.syncAcrossDevices) {
		persistThemePreference(theme);
	} else {
		applyLocalThemePreference(theme);
	}
	broadcastThemePreference();
	return true;
}

export function setSyncAcrossDevices(sync: boolean): boolean {
	Theme.setSyncAcrossDevices(sync);
	broadcastThemePreference();
	return true;
}
