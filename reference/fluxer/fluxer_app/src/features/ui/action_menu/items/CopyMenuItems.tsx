// SPDX-License-Identifier: AGPL-3.0-or-later

import {COPY_USER_ID_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {CopyIdIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as TextCopyCommands from '@app/features/ui/commands/TextCopyCommands';
import type {User} from '@app/features/user/models/User';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

const COPY_ROLE_ID_DESCRIPTOR = msg({
	message: 'Copy role ID',
	comment: 'Developer-mode action that copies the role ID to the clipboard.',
});

interface CopyUserIdMenuItemProps {
	user: User;
	onClose: () => void;
}

export const CopyUserIdMenuItem: React.FC<CopyUserIdMenuItemProps> = observer(({user, onClose}) => {
	const {i18n} = useLingui();
	const handleCopyUserId = useCallback(() => {
		onClose();
		TextCopyCommands.copy(i18n, user.id, true);
	}, [user.id, onClose, i18n]);
	return (
		<MenuItem
			icon={<CopyIdIcon data-flx="ui.action-menu.items.copy-menu-items.copy-user-id-menu-item.copy-id-icon" />}
			onClick={handleCopyUserId}
			data-flx="ui.action-menu.items.copy-menu-items.copy-user-id-menu-item.menu-item.copy-user-id"
		>
			{i18n._(COPY_USER_ID_DESCRIPTOR)}
		</MenuItem>
	);
});

interface CopyRoleIdMenuItemProps {
	roleId: string;
	onClose: () => void;
}

export const CopyRoleIdMenuItem: React.FC<CopyRoleIdMenuItemProps> = observer(({roleId, onClose}) => {
	const {i18n} = useLingui();
	const handleCopyRoleId = useCallback(() => {
		onClose();
		TextCopyCommands.copy(i18n, roleId, true);
	}, [roleId, onClose, i18n]);
	return (
		<MenuItem
			icon={<CopyIdIcon data-flx="ui.action-menu.items.copy-menu-items.copy-role-id-menu-item.copy-id-icon" />}
			onClick={handleCopyRoleId}
			data-flx="ui.action-menu.items.copy-menu-items.copy-role-id-menu-item.menu-item.copy-role-id"
		>
			{i18n._(COPY_ROLE_ID_DESCRIPTOR)}
		</MenuItem>
	);
});
