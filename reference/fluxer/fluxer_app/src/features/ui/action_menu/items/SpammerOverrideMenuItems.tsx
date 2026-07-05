// SPDX-License-Identifier: AGPL-3.0-or-later

import LocalUserSpamOverride from '@app/features/moderation/state/LocalUserSpamOverride';
import {CheckboxItem} from '@app/features/ui/action_menu/ContextMenu';
import type {User} from '@app/features/user/models/User';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const MARK_AS_SPAM_LOCALLY_DESCRIPTOR = msg({
	message: 'Mark as spam locally',
	comment: 'Developer-mode action that marks the selected message as spam on this client only.',
});
const IGNORE_SPAM_FLAG_DESCRIPTOR = msg({
	message: 'Ignore spam flag',
	comment: 'Developer-mode action that ignores a spam classification on the selected message.',
});

interface SpammerOverrideMenuItemsProps {
	user: User;
	developerMode: boolean;
}

export function shouldShowSpammerOverrideMenuItems(params: {user: User; developerMode: boolean}): boolean {
	return params.developerMode;
}

export const SpammerOverrideMenuItems: React.FC<SpammerOverrideMenuItemsProps> = observer(({user, developerMode}) => {
	const {i18n} = useLingui();
	const isServerSpammer = LocalUserSpamOverride.isServerSpammer(user.flags);
	const isLocalSpammer = LocalUserSpamOverride.isLocallyMarkedSpammer(user.id);
	const isLocalNotSpammer = LocalUserSpamOverride.isLocallyMarkedNotSpammer(user.id);
	if (!shouldShowSpammerOverrideMenuItems({user, developerMode})) {
		return null;
	}
	return (
		<>
			<CheckboxItem
				checked={isLocalSpammer}
				onCheckedChange={(checked) => {
					if (checked) {
						LocalUserSpamOverride.markAsSpammer(user.id);
						return;
					}
					LocalUserSpamOverride.clearOverride(user.id);
				}}
				danger
				data-flx="ui.action-menu.items.spammer-override-menu-items.checkbox-item"
			>
				{i18n._(MARK_AS_SPAM_LOCALLY_DESCRIPTOR)}
			</CheckboxItem>
			{isServerSpammer && (
				<CheckboxItem
					checked={isLocalNotSpammer}
					onCheckedChange={(checked) => {
						if (checked) {
							LocalUserSpamOverride.markAsNotSpammer(user.id);
							return;
						}
						LocalUserSpamOverride.clearOverride(user.id);
					}}
					data-flx="ui.action-menu.items.spammer-override-menu-items.checkbox-item--2"
				>
					{i18n._(IGNORE_SPAM_FLAG_DESCRIPTOR)}
				</CheckboxItem>
			)}
		</>
	);
});
