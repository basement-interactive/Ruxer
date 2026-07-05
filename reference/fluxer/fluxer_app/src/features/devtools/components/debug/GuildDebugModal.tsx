// SPDX-License-Identifier: AGPL-3.0-or-later

import {DebugModal, type DebugTab} from '@app/features/devtools/components/debug/DebugModal';
import type {Guild} from '@app/features/guild/models/Guild';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useMemo} from 'react';

const COMMUNITY_RECORD_DESCRIPTOR = msg({
	message: 'Community record',
	comment: 'Developer debug modal tab showing the raw community data record.',
});

interface GuildDebugModalProps {
	title: string;
	guild: Guild;
}

export const GuildDebugModal: React.FC<GuildDebugModalProps> = observer(({title, guild}) => {
	const {i18n} = useLingui();
	const recordJsonData = useMemo(() => guild.toJSON(), [guild]);
	const tabs: Array<DebugTab> = [
		{
			id: 'record',
			label: i18n._(COMMUNITY_RECORD_DESCRIPTOR),
			data: recordJsonData,
		},
	];
	return <DebugModal title={title} tabs={tabs} data-flx="devtools.debug.guild-debug-modal.debug-modal" />;
});
