// SPDX-License-Identifier: AGPL-3.0-or-later

import Authentication from '@app/features/auth/state/Authentication';
import type {Guild} from '@app/features/guild/models/Guild';
import {REPORT_COMMUNITY_DESCRIPTOR} from '@app/features/moderation/utils/ModerationMessageDescriptors';
import {openReportGuildModal} from '@app/features/moderation/utils/ReportActionUtils';
import {ReportUserIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

interface ReportGuildMenuItemProps {
	guild: Guild;
	onClose: () => void;
}

export const ReportGuildMenuItem: React.FC<ReportGuildMenuItemProps> = observer(({guild, onClose}) => {
	const {i18n} = useLingui();
	const isOwner = guild.ownerId === Authentication.currentUserId;
	const handleReportGuild = useCallback(() => {
		ModalCommands.runAfterBottomSheetClose(onClose, () => openReportGuildModal({i18n, guild}));
	}, [guild, i18n, onClose]);
	if (isOwner) {
		return null;
	}
	return (
		<MenuItem
			icon={<ReportUserIcon size={16} data-flx="ui.action-menu.items.report-guild-menu-item.report-user-icon" />}
			onClick={handleReportGuild}
			danger
			data-flx="ui.action-menu.items.report-guild-menu-item.menu-item.report-guild"
		>
			{i18n._(REPORT_COMMUNITY_DESCRIPTOR)}
		</MenuItem>
	);
});
