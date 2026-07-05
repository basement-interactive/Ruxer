// SPDX-License-Identifier: AGPL-3.0-or-later

import {MuteDurationSheet} from '@app/features/app/components/bottomsheets/MuteDurationSheet';
import type {Channel} from '@app/features/channel/models/Channel';
import {
	MUTE_CONVERSATION_DESCRIPTOR,
	UNMUTE_CONVERSATION_DESCRIPTOR,
} from '@app/features/channel/utils/ChannelMessageDescriptors';
import {useMuteSheet} from '@app/features/notification/hooks/useMuteSheet';
import {useDMMenuData} from '@app/features/ui/action_menu/items/DMMenuData';
import {MenuBottomSheet} from '@app/features/ui/menu_bottom_sheet/MenuBottomSheet';
import type {User} from '@app/features/user/models/User';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface DMBottomSheetProps {
	isOpen: boolean;
	onClose: () => void;
	channel: Channel;
	recipient?: User | null;
}

export const DMBottomSheet: React.FC<DMBottomSheetProps> = observer(({isOpen, onClose, channel, recipient}) => {
	const {i18n} = useLingui();
	const {muteSheetOpen, openMuteSheet, closeMuteSheet, handleMute, handleUnmute, muteConfig} = useMuteSheet({
		guildId: null,
		channelId: channel.id,
		onClose,
	});
	const {groups, isMuted, mutedText} = useDMMenuData(channel, recipient, {
		onClose,
		onOpenMuteSheet: openMuteSheet,
	});
	return (
		<>
			<MenuBottomSheet
				isOpen={isOpen}
				onClose={onClose}
				groups={groups}
				data-flx="channel.dm-bottom-sheet.menu-bottom-sheet"
			/>
			<MuteDurationSheet
				isOpen={muteSheetOpen}
				onClose={closeMuteSheet}
				isMuted={isMuted}
				mutedText={mutedText}
				muteConfig={muteConfig}
				muteTitle={i18n._(MUTE_CONVERSATION_DESCRIPTOR)}
				unmuteTitle={i18n._(UNMUTE_CONVERSATION_DESCRIPTOR)}
				onMute={handleMute}
				onUnmute={handleUnmute}
				data-flx="channel.dm-bottom-sheet.mute-duration-sheet"
			/>
		</>
	);
});
