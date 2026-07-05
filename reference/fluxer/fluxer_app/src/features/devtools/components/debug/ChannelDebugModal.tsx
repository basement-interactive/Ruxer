// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import {DebugModal, type DebugTab} from '@app/features/devtools/components/debug/DebugModal';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useMemo} from 'react';

const CHANNEL_RECORD_DESCRIPTOR = msg({
	message: 'Channel record',
	comment: 'Developer debug modal tab showing the raw channel data record.',
});

interface ChannelDebugModalProps {
	title: string;
	channel: Channel;
}

export const ChannelDebugModal: React.FC<ChannelDebugModalProps> = observer(({title, channel}) => {
	const {i18n} = useLingui();
	const recordJsonData = useMemo(() => channel.toJSON(), [channel]);
	const tabs: Array<DebugTab> = [
		{
			id: 'record',
			label: i18n._(CHANNEL_RECORD_DESCRIPTOR),
			data: recordJsonData,
		},
	];
	return <DebugModal title={title} tabs={tabs} data-flx="devtools.debug.channel-debug-modal.debug-modal" />;
});
