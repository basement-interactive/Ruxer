// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	formatUserSettingsPath,
	getUserSettingsTabLabel,
	type UserSettingsSubtabType,
} from '@app/features/user/components/settings_utils/SettingsConstants';
import type {
	SearchableSettingItem,
	UserSettingsTabType,
} from '@app/features/user/components/settings_utils/SettingsSectionRegistry';
import type {I18n} from '@lingui/core';

export function getAdvancedSettingSourceTab(item: SearchableSettingItem): UserSettingsTabType {
	return item.sourceTabType ?? item.tabType;
}

export function getAdvancedSettingSourceSection(item: SearchableSettingItem): UserSettingsSubtabType | undefined {
	return (item.sourceSectionId ?? item.sectionId) as UserSettingsSubtabType | undefined;
}

export function getAdvancedSettingPath(item: SearchableSettingItem, i18n: I18n): string {
	const sourceTab = getAdvancedSettingSourceTab(item);
	const sourceSection = getAdvancedSettingSourceSection(item);
	if (sourceTab === 'advanced_settings') {
		return getUserSettingsTabLabel(i18n, 'advanced_settings');
	}
	return formatUserSettingsPath(i18n, sourceTab, sourceSection);
}
