// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelHeaderIcon} from '@app/features/channel/components/channel_header_components/ChannelHeaderIcon';
import {ChannelNotificationSettingsDropdown} from '@app/features/channel/components/channel_header_components/ChannelNotificationSettingsDropdown';
import type {Channel} from '@app/features/channel/models/Channel';
import {NOTIFICATION_SETTINGS_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import * as ContextMenuCommands from '@app/features/ui/commands/ContextMenuCommands';
import {useContextMenuTrigger} from '@app/features/ui/hooks/useContextMenuTrigger';
import UserGuildSettings from '@app/features/user/state/UserGuildSettings';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {BellIcon, BellSlashIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

const NOTIFICATION_SETTINGS_MUTED_DESCRIPTOR = msg({
	message: 'Notification settings (muted)',
	comment: 'Short label in the channel notification settings button. Keep it concise.',
});

interface ChannelNotificationSettingsButtonProps {
	channel: Channel;
}

export const ChannelNotificationSettingsButton = observer(({channel}: ChannelNotificationSettingsButtonProps) => {
	const {i18n} = useLingui();
	const {isOpen, withTracking} = useContextMenuTrigger();
	const channelOverride = UserGuildSettings.getChannelOverride(channel.guildId ?? null, channel.id);
	const isMuted = channelOverride?.muted ?? false;
	const handleClick = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			ContextMenuCommands.openFromElementBottomRight(
				event,
				({onClose}) => (
					<ChannelNotificationSettingsDropdown
						channel={channel}
						onClose={onClose}
						data-flx="channel.channel-header-components.channel-notification-settings-button.handle-click.channel-notification-settings-dropdown"
					/>
				),
				withTracking(),
			);
		},
		[channel, withTracking],
	);
	return (
		<ChannelHeaderIcon
			icon={isMuted ? BellSlashIcon : BellIcon}
			label={isMuted ? i18n._(NOTIFICATION_SETTINGS_MUTED_DESCRIPTOR) : i18n._(NOTIFICATION_SETTINGS_DESCRIPTOR)}
			isSelected={isOpen || isMuted}
			aria-haspopup="menu"
			aria-expanded={isOpen}
			onClick={handleClick}
			data-flx="channel.channel-header-components.channel-notification-settings-button.channel-header-icon.click"
		/>
	);
});
