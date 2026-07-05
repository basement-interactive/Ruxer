// SPDX-License-Identifier: AGPL-3.0-or-later

import {DeleteIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface PersonalNotesContextMenuProps {
	onPurge: () => void;
	onClose: () => void;
}

export const PersonalNotesContextMenu: React.FC<PersonalNotesContextMenuProps> = observer(({onPurge, onClose}) => (
	<MenuGroup data-flx="ui.action-menu.personal-notes-context-menu.menu-group">
		<MenuItem
			icon={<DeleteIcon size={16} data-flx="ui.action-menu.personal-notes-context-menu.delete-icon" />}
			danger
			onClick={() => {
				onClose();
				onPurge();
			}}
			data-flx="ui.action-menu.personal-notes-context-menu.menu-item.close"
		>
			<Trans>Purge personal notes</Trans>
		</MenuItem>
	</MenuGroup>
));
