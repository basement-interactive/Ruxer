// SPDX-License-Identifier: AGPL-3.0-or-later

import Authentication from '@app/features/auth/state/Authentication';
import * as GuildMemberCommands from '@app/features/member/commands/GuildMemberCommands';
import type {GuildMember} from '@app/features/member/models/GuildMember';
import {BaseChangeNicknameModal} from '@app/features/user/components/modals/BaseChangeNicknameModal';
import type {User} from '@app/features/user/models/User';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

interface ChangeNicknameModalProps {
	guildId: string;
	user: User;
	member: GuildMember;
}

export const ChangeNicknameModal: React.FC<ChangeNicknameModalProps> = observer(({guildId, user, member}) => {
	const currentUserId = Authentication.currentUserId;
	const isCurrentUser = user.id === currentUserId;
	const handleSave = useCallback(
		async (nick: string | null) => {
			if (isCurrentUser) {
				await GuildMemberCommands.updateProfile(guildId, {nick});
			} else {
				await GuildMemberCommands.update(guildId, user.id, {nick});
			}
		},
		[guildId, user.id, isCurrentUser],
	);
	return (
		<BaseChangeNicknameModal
			currentNick={member.nick || ''}
			displayName={user.displayName}
			onSave={handleSave}
			data-flx="user.change-nickname-modal.base-change-nickname-modal"
		/>
	);
});
