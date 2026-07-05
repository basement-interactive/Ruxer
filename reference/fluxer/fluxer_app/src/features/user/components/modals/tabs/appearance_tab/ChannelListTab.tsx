// SPDX-License-Identifier: AGPL-3.0-or-later

import * as AccessibilityCommands from '@app/features/accessibility/commands/AccessibilityCommands';
import Accessibility from '@app/features/accessibility/state/Accessibility';
import {Switch} from '@app/features/ui/components/form/FormSwitch';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const SHOW_UNREAD_INDICATOR_ON_MUTED_CHANNELS_DESCRIPTOR = msg({
	message: 'Show unread indicator on muted channels',
	comment: 'Label in the channel list tab.',
});
export const ChannelListTabContent: React.FC = observer(() => {
	const {i18n} = useLingui();
	return (
		<Switch
			label={i18n._(SHOW_UNREAD_INDICATOR_ON_MUTED_CHANNELS_DESCRIPTOR)}
			value={Accessibility.showFadedUnreadOnMutedChannels}
			onChange={(value) => AccessibilityCommands.update({showFadedUnreadOnMutedChannels: value})}
			data-flx="user.appearance-tab.channel-list-tab.channel-list-tab-content.switch.update"
		/>
	);
});
