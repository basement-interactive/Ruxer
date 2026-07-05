// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelPinsContent} from '@app/features/app/components/shared/ChannelPinsContent';
import type {Channel} from '@app/features/channel/models/Channel';
import {BottomSheet} from '@app/features/ui/bottom_sheet/BottomSheet';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';

const PINNED_MESSAGES_DESCRIPTOR = msg({
	message: 'Pinned messages',
	comment: 'Button or menu action label in the channel pins bottom sheet. Keep it concise.',
});
export const ChannelPinsBottomSheet = observer(
	({isOpen, onClose, channel}: {isOpen: boolean; onClose: () => void; channel: Channel}) => {
		const {i18n} = useLingui();
		return (
			<BottomSheet
				isOpen={isOpen}
				onClose={onClose}
				title={i18n._(PINNED_MESSAGES_DESCRIPTOR)}
				snapPoints={[0, 1]}
				initialSnap={1}
				data-flx="channel.channel-pins-bottom-sheet.bottom-sheet"
			>
				<ChannelPinsContent
					channel={channel}
					onJump={onClose}
					data-flx="channel.channel-pins-bottom-sheet.channel-pins-content"
				/>
			</BottomSheet>
		);
	},
);
