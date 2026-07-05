// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import {
	MUTE_CONVERSATION_DESCRIPTOR,
	UNMUTE_CONVERSATION_DESCRIPTOR,
} from '@app/features/channel/utils/ChannelMessageDescriptors';
import {DataMenuRenderer} from '@app/features/ui/action_menu/DataMenuRenderer';
import {useDMMenuData} from '@app/features/ui/action_menu/items/DMMenuData';
import {MuteDMMenuItem} from '@app/features/ui/action_menu/items/DMMenuItems';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import type {User} from '@app/features/user/models/User';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useMemo} from 'react';

interface DMContextMenuProps {
	channel: Channel;
	recipient?: User | null;
	onClose: () => void;
}

export const DMContextMenu: React.FC<DMContextMenuProps> = observer(({channel, recipient, onClose}) => {
	const {i18n} = useLingui();
	const {groups} = useDMMenuData(channel, recipient, {
		onClose,
		preserveInitialMarkAsReadVisibility: true,
	});
	const excludeLabels = useMemo(
		() => [i18n._(MUTE_CONVERSATION_DESCRIPTOR), i18n._(UNMUTE_CONVERSATION_DESCRIPTOR)],
		[i18n.locale],
	);
	return (
		<>
			<DataMenuRenderer
				groups={groups}
				excludeLabels={excludeLabels}
				data-flx="ui.action-menu.dm-context-menu.data-menu-renderer"
			/>
			<MenuGroup data-flx="ui.action-menu.dm-context-menu.menu-group">
				<MuteDMMenuItem
					channel={channel}
					onClose={onClose}
					data-flx="ui.action-menu.dm-context-menu.mute-dm-menu-item"
				/>
			</MenuGroup>
		</>
	);
});
