// SPDX-License-Identifier: AGPL-3.0-or-later

import type {UserSettingsTabType} from '@app/features/user/components/settings_utils/SettingsSectionRegistry';

export const PROFILE_SETTINGS_TAB: UserSettingsTabType = 'my_profile';
export const ACCOUNT_SETTINGS_TAB: UserSettingsTabType = 'account_security';

export const ACCOUNT_NESTED_TAB_TYPES = [
	'authorized_apps',
	'blocked_users',
	'devices',
] as const satisfies ReadonlyArray<UserSettingsTabType>;
export type AccountNestedSettingsTabType = (typeof ACCOUNT_NESTED_TAB_TYPES)[number];
export type AccountSettingsManagementSectionId = 'security' | 'blocked_users';

export const PRIMARY_SETTINGS_NAV_HIDDEN_TAB_TYPES = new Set<UserSettingsTabType>([
	PROFILE_SETTINGS_TAB,
	...ACCOUNT_NESTED_TAB_TYPES,
]);

export function isAccountNestedSettingsTab(
	tabType: UserSettingsTabType | null | undefined,
): tabType is AccountNestedSettingsTabType {
	return ACCOUNT_NESTED_TAB_TYPES.some((candidate) => candidate === tabType);
}

export function getAccountSectionForNestedTab(
	tabType: UserSettingsTabType | null | undefined,
): AccountSettingsManagementSectionId | null {
	switch (tabType) {
		case 'authorized_apps':
			return 'security';
		case 'blocked_users':
			return 'blocked_users';
		case 'devices':
			return 'security';
		default:
			return null;
	}
}

export function getAccountSectionForLegacySection(
	sectionId: string | null | undefined,
): AccountSettingsManagementSectionId | null {
	switch (sectionId) {
		case 'authorized_apps':
		case 'authorized-applications':
		case 'security':
			return 'security';
		case 'blocked_users':
		case 'blocked-users':
			return 'blocked_users';
		case 'devices':
		case 'signed-in-devices':
			return 'security';
		default:
			return null;
	}
}
