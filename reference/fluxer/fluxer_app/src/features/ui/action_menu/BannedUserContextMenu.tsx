// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GuildBan} from '@app/features/guild/commands/GuildCommands';
import {BanDetailsModal} from '@app/features/moderation/components/modals/BanDetailsModal';
import {RevokeBanIcon, ViewDetailsIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface BannedUserContextMenuProps {
	ban: GuildBan;
	onClose: () => void;
	onRevoke: () => void;
}

export const BannedUserContextMenu: React.FC<BannedUserContextMenuProps> = observer(({ban, onClose, onRevoke}) => {
	const handleViewDetails = () => {
		ModalCommands.pushAfterBottomSheetClose(
			onClose,
			modal(() => (
				<BanDetailsModal
					ban={ban}
					onRevoke={onRevoke}
					data-flx="ui.action-menu.banned-user-context-menu.handle-view-details.ban-details-modal"
				/>
			)),
		);
	};
	const handleRevokeBan = () => {
		onClose();
		onRevoke();
	};
	return (
		<>
			<MenuGroup data-flx="ui.action-menu.banned-user-context-menu.menu-group">
				<MenuItem
					icon={<ViewDetailsIcon data-flx="ui.action-menu.banned-user-context-menu.view-details-icon" />}
					onClick={handleViewDetails}
					data-flx="ui.action-menu.banned-user-context-menu.menu-item.view-details"
				>
					<Trans>View details</Trans>
				</MenuItem>
			</MenuGroup>
			<MenuGroup data-flx="ui.action-menu.banned-user-context-menu.menu-group--2">
				<MenuItem
					icon={<RevokeBanIcon data-flx="ui.action-menu.banned-user-context-menu.revoke-ban-icon" />}
					danger
					onClick={handleRevokeBan}
					data-flx="ui.action-menu.banned-user-context-menu.menu-item.revoke-ban"
				>
					<Trans>Revoke ban</Trans>
				</MenuItem>
			</MenuGroup>
		</>
	);
});
