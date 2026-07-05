// SPDX-License-Identifier: AGPL-3.0-or-later

import * as ChannelCommands from '@app/features/channel/commands/ChannelCommands';
import Channels from '@app/features/channel/state/Channels';
import {BaseChangeNicknameModal} from '@app/features/user/components/modals/BaseChangeNicknameModal';
import type {User} from '@app/features/user/models/User';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

interface ChangeGroupDMNicknameModalProps {
	channelId: string;
	user: User;
}

export const ChangeGroupDMNicknameModal: React.FC<ChangeGroupDMNicknameModalProps> = observer(({channelId, user}) => {
	const channel = Channels.getChannel(channelId);
	const currentNick = channel?.nicks?.[user.id] || '';
	const handleSave = useCallback(
		async (nick: string | null) => {
			await ChannelCommands.updateGroupDMNickname(channelId, user.id, nick);
		},
		[channelId, user.id],
	);
	return (
		<BaseChangeNicknameModal
			currentNick={currentNick}
			displayName={user.displayName}
			onSave={handleSave}
			data-flx="channel.change-group-dm-nickname-modal.base-change-nickname-modal"
		/>
	);
});
