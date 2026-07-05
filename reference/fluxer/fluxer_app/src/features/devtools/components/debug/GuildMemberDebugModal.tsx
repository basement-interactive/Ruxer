// SPDX-License-Identifier: AGPL-3.0-or-later

import {DebugModal, type DebugTab} from '@app/features/devtools/components/debug/DebugModal';
import type {GuildMember} from '@app/features/member/models/GuildMember';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useMemo} from 'react';

const COMMUNITY_MEMBER_RECORD_DESCRIPTOR = msg({
	message: 'Community member record',
	comment: 'Developer debug modal tab showing the raw community-member data record.',
});

interface GuildMemberDebugModalProps {
	title: string;
	member: GuildMember;
}

export const GuildMemberDebugModal: React.FC<GuildMemberDebugModalProps> = observer(({title, member}) => {
	const {i18n} = useLingui();
	const recordJsonData = useMemo(() => member.toJSON(), [member]);
	const tabs: Array<DebugTab> = [
		{
			id: 'record',
			label: i18n._(COMMUNITY_MEMBER_RECORD_DESCRIPTOR),
			data: recordJsonData,
		},
	];
	return <DebugModal title={title} tabs={tabs} data-flx="devtools.debug.guild-member-debug-modal.debug-modal" />;
});
