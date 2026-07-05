// SPDX-License-Identifier: AGPL-3.0-or-later

import {DebugModal, type DebugTab} from '@app/features/devtools/components/debug/DebugModal';
import type {User} from '@app/features/user/models/User';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useMemo} from 'react';

const USER_RECORD_DESCRIPTOR = msg({
	message: 'User record',
	comment: 'Developer debug modal tab showing the raw user data record.',
});

interface UserDebugModalProps {
	title: string;
	user: User;
}

export const UserDebugModal: React.FC<UserDebugModalProps> = observer(({title, user}) => {
	const {i18n} = useLingui();
	const recordJsonData = useMemo(() => user.toJSON(), [user]);
	const tabs: Array<DebugTab> = [
		{
			id: 'record',
			label: i18n._(USER_RECORD_DESCRIPTOR),
			data: recordJsonData,
		},
	];
	return <DebugModal title={title} tabs={tabs} data-flx="devtools.debug.user-debug-modal.debug-modal" />;
});
