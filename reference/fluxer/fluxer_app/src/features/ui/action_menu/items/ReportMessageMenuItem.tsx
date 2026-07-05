// SPDX-License-Identifier: AGPL-3.0-or-later

import {canReportMessage} from '@app/features/channel/components/MessageActionUtils';
import {REPORT_MESSAGE_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {openReportMessageModal} from '@app/features/moderation/utils/ReportActionUtils';
import {ReportMessageIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

interface ReportMessageMenuItemProps {
	message: Message;
	onClose: () => void;
}

export const ReportMessageMenuItem: React.FC<ReportMessageMenuItemProps> = observer(({message, onClose}) => {
	const {i18n} = useLingui();
	const handleReportMessage = useCallback(() => {
		if (!canReportMessage(message)) {
			return;
		}
		ModalCommands.runAfterBottomSheetClose(onClose, () => openReportMessageModal(message));
	}, [message, onClose]);
	if (!canReportMessage(message)) {
		return null;
	}
	return (
		<MenuItem
			icon={
				<ReportMessageIcon size={16} data-flx="ui.action-menu.items.report-message-menu-item.report-message-icon" />
			}
			onClick={handleReportMessage}
			danger
			data-flx="ui.action-menu.items.report-message-menu-item.menu-item.report-message"
		>
			{i18n._(REPORT_MESSAGE_DESCRIPTOR)}
		</MenuItem>
	);
});
