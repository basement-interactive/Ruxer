// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {REPORT_USER_DESCRIPTOR} from '@app/features/moderation/utils/ModerationMessageDescriptors';
import {openReportUserModal} from '@app/features/moderation/utils/ReportActionUtils';
import {ReportUserIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import type {User} from '@app/features/user/models/User';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

interface ReportUserMenuItemProps {
	user: User;
	onClose: () => void;
	guildId?: string;
	message?: Message;
}

export const ReportUserMenuItem: React.FC<ReportUserMenuItemProps> = observer(({user, onClose, guildId, message}) => {
	const {i18n} = useLingui();
	const handleReportUser = useCallback(() => {
		ModalCommands.runAfterBottomSheetClose(onClose, () =>
			openReportUserModal({
				i18n,
				user,
				guildId,
				message,
			}),
		);
	}, [guildId, i18n, message, onClose, user]);
	return (
		<MenuItem
			icon={<ReportUserIcon size={16} data-flx="ui.action-menu.items.report-user-menu-item.report-user-icon" />}
			onClick={handleReportUser}
			danger
			data-flx="ui.action-menu.items.report-user-menu-item.menu-item.report-user"
		>
			{i18n._(REPORT_USER_DESCRIPTOR)}
		</MenuItem>
	);
});
