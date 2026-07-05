// SPDX-License-Identifier: AGPL-3.0-or-later

import i18n from '@app/app/I18n';
import {OFFLINE_DESCRIPTOR, ONLINE_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import Presence from '@app/features/presence/state/Presence';
import type {User} from '@app/features/user/models/User';
import * as NicknameUtils from '@app/features/user/utils/NicknameUtils';
import {StatusTypes} from '@fluxer/constants/src/StatusConstants';

export interface GroupDMMemberGroup {
	id: string;
	displayName: string;
	count: number;
	users: Array<User>;
}

function sortUsersByDisplayName(users: Array<User>): Array<User> {
	return [...users].sort((a, b) => {
		const nameA = NicknameUtils.getDisplayName(a);
		const nameB = NicknameUtils.getDisplayName(b);
		return nameA.localeCompare(nameB);
	});
}

export function getGroupDMMemberGroups(users: Array<User>): Array<GroupDMMemberGroup> {
	const onlineUsers: Array<User> = [];
	const offlineUsers: Array<User> = [];
	for (const user of users) {
		const status = Presence.getStatus(user.id);
		if (status === StatusTypes.OFFLINE || status === StatusTypes.INVISIBLE) {
			offlineUsers.push(user);
		} else {
			onlineUsers.push(user);
		}
	}
	return [
		{
			id: 'online',
			displayName: i18n._(ONLINE_DESCRIPTOR),
			count: onlineUsers.length,
			users: sortUsersByDisplayName(onlineUsers),
		},
		{
			id: 'offline',
			displayName: i18n._(OFFLINE_DESCRIPTOR),
			count: offlineUsers.length,
			users: sortUsersByDisplayName(offlineUsers),
		},
	].filter((group) => group.count > 0);
}
