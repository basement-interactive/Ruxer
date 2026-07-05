// SPDX-License-Identifier: AGPL-3.0-or-later

import {VIEW_PROFILE_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {ViewProfileIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as UserProfileCommands from '@app/features/user/commands/UserProfileCommands';
import type {User} from '@app/features/user/models/User';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

interface UserProfileMenuItemProps {
	user: User;
	guildId?: string;
	onClose: () => void;
}

export const UserProfileMenuItem: React.FC<UserProfileMenuItemProps> = observer(({user, guildId, onClose}) => {
	const {i18n} = useLingui();
	const handleViewProfile = useCallback(() => {
		onClose();
		UserProfileCommands.openUserProfile(user.id, guildId);
	}, [onClose, user.id, guildId]);
	return (
		<MenuItem
			icon={<ViewProfileIcon size={16} data-flx="ui.action-menu.items.user-profile-menu-item.view-profile-icon" />}
			onClick={handleViewProfile}
			data-flx="ui.action-menu.items.user-profile-menu-item.menu-item.view-profile"
		>
			{i18n._(VIEW_PROFILE_DESCRIPTOR)}
		</MenuItem>
	);
});
