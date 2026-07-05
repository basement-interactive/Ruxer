// SPDX-License-Identifier: AGPL-3.0-or-later

import {ADD_NOTE_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {AddNoteIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as UserProfileCommands from '@app/features/user/commands/UserProfileCommands';
import type {User} from '@app/features/user/models/User';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

interface AddNoteMenuItemProps {
	user: User;
	onClose: () => void;
}

export const AddNoteMenuItem: React.FC<AddNoteMenuItemProps> = observer(({user, onClose}) => {
	const {i18n} = useLingui();
	const handleAddNote = useCallback(() => {
		UserProfileCommands.openUserProfile(user.id, undefined, true);
		onClose();
	}, [onClose, user.id]);
	return (
		<MenuItem
			icon={<AddNoteIcon data-flx="ui.action-menu.items.user-note-menu-items.add-note-menu-item.add-note-icon" />}
			onClick={handleAddNote}
			data-flx="ui.action-menu.items.user-note-menu-items.add-note-menu-item.menu-item.add-note"
		>
			{i18n._(ADD_NOTE_DESCRIPTOR)}
		</MenuItem>
	);
});
