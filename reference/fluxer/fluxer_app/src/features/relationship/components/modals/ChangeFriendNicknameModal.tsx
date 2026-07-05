// SPDX-License-Identifier: AGPL-3.0-or-later

import * as RelationshipCommands from '@app/features/relationship/commands/RelationshipCommands';
import Relationships from '@app/features/relationship/state/Relationships';
import {BaseChangeNicknameModal} from '@app/features/user/components/modals/BaseChangeNicknameModal';
import type {User} from '@app/features/user/models/User';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

interface ChangeFriendNicknameModalProps {
	user: User;
}

export const ChangeFriendNicknameModal: React.FC<ChangeFriendNicknameModalProps> = observer(({user}) => {
	const relationship = Relationships.getRelationship(user.id);
	const currentNick = relationship?.nickname ?? '';
	const handleSave = useCallback(
		async (nick: string | null) => {
			await RelationshipCommands.updateFriendNickname(user.id, nick);
		},
		[user.id],
	);
	return (
		<BaseChangeNicknameModal
			currentNick={currentNick}
			displayName={user.displayName}
			onSave={handleSave}
			data-flx="relationship.change-friend-nickname-modal.base-change-nickname-modal"
		/>
	);
});
