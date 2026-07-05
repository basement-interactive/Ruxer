// SPDX-License-Identifier: AGPL-3.0-or-later

import {MuteDurationSheet} from '@app/features/app/components/bottomsheets/MuteDurationSheet';
import type {Channel} from '@app/features/channel/models/Channel';
import {
	MUTE_CHANNEL_DESCRIPTOR,
	UNMUTE_CHANNEL_DESCRIPTOR,
} from '@app/features/channel/utils/ChannelMessageDescriptors';
import type {Guild} from '@app/features/guild/models/Guild';
import {useMuteSheet} from '@app/features/notification/hooks/useMuteSheet';
import {useChannelMenuData} from '@app/features/ui/action_menu/items/ChannelMenuData';
import {MenuBottomSheet} from '@app/features/ui/menu_bottom_sheet/MenuBottomSheet';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const CHANNEL_OPTIONS_DESCRIPTOR = msg({
	message: 'Channel options',
	comment: 'Short label in the channel bottom sheet. Keep it concise.',
});

interface ChannelBottomSheetProps {
	isOpen: boolean;
	onClose: () => void;
	channel: Channel;
	guild?: Guild;
}

export const ChannelBottomSheet: React.FC<ChannelBottomSheetProps> = observer(({isOpen, onClose, channel, guild}) => {
	const {i18n} = useLingui();
	const {muteSheetOpen, muteConfig, openMuteSheet, closeMuteSheet, handleMute, handleUnmute} = useMuteSheet({
		guildId: guild?.id ?? null,
		channelId: channel.id,
	});
	const {groups, state} = useChannelMenuData(channel, guild, {
		onClose,
		onOpenMuteSheet: openMuteSheet,
	});
	return (
		<>
			<MenuBottomSheet
				isOpen={isOpen}
				onClose={onClose}
				groups={groups}
				title={channel.name ?? i18n._(CHANNEL_OPTIONS_DESCRIPTOR)}
				data-flx="channel.channel-bottom-sheet.menu-bottom-sheet"
			/>
			<MuteDurationSheet
				isOpen={muteSheetOpen}
				onClose={closeMuteSheet}
				isMuted={state.isMuted}
				mutedText={state.mutedText}
				muteConfig={muteConfig}
				muteTitle={i18n._(MUTE_CHANNEL_DESCRIPTOR)}
				unmuteTitle={i18n._(UNMUTE_CHANNEL_DESCRIPTOR)}
				onMute={handleMute}
				onUnmute={handleUnmute}
				data-flx="channel.channel-bottom-sheet.mute-duration-sheet"
			/>
		</>
	);
});
