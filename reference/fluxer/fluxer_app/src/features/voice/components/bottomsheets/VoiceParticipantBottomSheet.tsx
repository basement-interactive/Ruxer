// SPDX-License-Identifier: AGPL-3.0-or-later

import {useVoiceParticipantMenuData} from '@app/features/ui/action_menu/items/VoiceParticipantMenuData';
import {MenuBottomSheet} from '@app/features/ui/menu_bottom_sheet/MenuBottomSheet';
import type {User} from '@app/features/user/models/User';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface VoiceParticipantBottomSheetProps {
	isOpen: boolean;
	onClose: () => void;
	user: User;
	guildId?: string;
	connectionId?: string;
	isConnectionItem?: boolean;
	isParentGroupedItem?: boolean;
	participant?: unknown;
	streamKey?: string;
	isScreenShare?: boolean;
	isWatching?: boolean;
	hasScreenShareAudio?: boolean;
	isOwnScreenShare?: boolean;
	onStopWatching?: () => void;
}

export const VoiceParticipantBottomSheet: React.FC<VoiceParticipantBottomSheetProps> = observer(
	({
		isOpen,
		onClose,
		user,
		guildId,
		connectionId,
		isConnectionItem = false,
		isParentGroupedItem = false,
		streamKey,
		isScreenShare = false,
		isWatching = false,
		hasScreenShareAudio = false,
		isOwnScreenShare = false,
		onStopWatching,
	}) => {
		const {groups} = useVoiceParticipantMenuData({
			user,
			guildId,
			connectionId,
			isGroupedItem: isConnectionItem,
			isParentGroupedItem,
			streamKey,
			isScreenShare,
			isWatching,
			hasScreenShareAudio,
			isOwnScreenShare,
			onStopWatching,
			onClose,
		});
		return (
			<MenuBottomSheet
				isOpen={isOpen}
				onClose={onClose}
				groups={groups}
				data-flx="voice.voice-participant-bottom-sheet.menu-bottom-sheet"
			/>
		);
	},
);
