// SPDX-License-Identifier: AGPL-3.0-or-later

import {COPY_COMMUNITY_ID_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {REPORT_COMMUNITY_DESCRIPTOR} from '@app/features/moderation/utils/ModerationMessageDescriptors';
import {openReportGuildModal} from '@app/features/moderation/utils/ReportActionUtils';
import {CopyIdIcon, ReportUserIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as TextCopyCommands from '@app/features/ui/commands/TextCopyCommands';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

interface DiscoveryGuildContextMenuProps {
	guild: {id: string; name: string};
	onClose: () => void;
}

export const DiscoveryGuildContextMenu: React.FC<DiscoveryGuildContextMenuProps> = observer(({guild, onClose}) => {
	const {i18n} = useLingui();
	const handleCopyId = useCallback(() => {
		void TextCopyCommands.copy(i18n, guild.id);
		onClose();
	}, [guild.id, i18n, onClose]);
	const handleReport = useCallback(() => {
		onClose();
		openReportGuildModal({i18n, guild});
	}, [guild, i18n, onClose]);
	return (
		<MenuGroup data-flx="ui.action-menu.discovery-guild-context-menu.menu-group">
			<MenuItem
				icon={<CopyIdIcon data-flx="ui.action-menu.discovery-guild-context-menu.copy-id-icon" />}
				onClick={handleCopyId}
				data-flx="ui.action-menu.discovery-guild-context-menu.menu-item.copy-id"
			>
				{i18n._(COPY_COMMUNITY_ID_DESCRIPTOR)}
			</MenuItem>
			<MenuItem
				icon={<ReportUserIcon data-flx="ui.action-menu.discovery-guild-context-menu.report-user-icon" />}
				onClick={handleReport}
				danger
				data-flx="ui.action-menu.discovery-guild-context-menu.menu-item.report"
			>
				{i18n._(REPORT_COMMUNITY_DESCRIPTOR)}
			</MenuItem>
		</MenuGroup>
	);
});
