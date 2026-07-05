// SPDX-License-Identifier: AGPL-3.0-or-later

import * as AccessibilityCommands from '@app/features/accessibility/commands/AccessibilityCommands';
import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import {HIDE_FAVORITES_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {
	formatUserSettingsPath,
	type UserSettingsSubtabType,
} from '@app/features/user/components/settings_utils/SettingsConstants';
import {ENABLE_FAVORITES_DESCRIPTOR} from '@app/features/user/components/settings_utils/section_registry/SharedDescriptors';
import type {I18n} from '@lingui/core';
import {Trans} from '@lingui/react/macro';

const ADVANCED_APPEARANCE_SECTION_ID = 'advanced-settings-appearance' as UserSettingsSubtabType;

export function confirmHideFavorites(onConfirm: (() => void) | undefined, i18n: I18n): void {
	const favoritesSettingsPath = `${formatUserSettingsPath(
		i18n,
		'advanced_settings',
		ADVANCED_APPEARANCE_SECTION_ID,
	)} > ${i18n._(ENABLE_FAVORITES_DESCRIPTOR)}`;
	ModalCommands.push(
		modal(() => (
			<ConfirmModal
				title={i18n._(HIDE_FAVORITES_DESCRIPTOR)}
				description={
					<div data-flx="messaging.favorites-commands.confirm-hide-favorites.div">
						<Trans>
							This will hide all favorites-related UI elements including buttons and menu items. Your existing favorites
							will be preserved and can be re-enabled anytime from{' '}
							<strong data-flx="messaging.favorites-commands.confirm-hide-favorites.strong">
								{favoritesSettingsPath}
							</strong>
							.
						</Trans>
					</div>
				}
				primaryText={i18n._(HIDE_FAVORITES_DESCRIPTOR)}
				primaryVariant="danger"
				onPrimary={() => {
					AccessibilityCommands.update({showFavorites: false});
					onConfirm?.();
				}}
				data-flx="messaging.favorites-commands.confirm-hide-favorites.confirm-modal"
			/>
		)),
	);
}
