// SPDX-License-Identifier: AGPL-3.0-or-later

import {getMuteDurationOptions} from '@app/features/channel/components/MuteOptions';
import type {Channel} from '@app/features/channel/models/Channel';
import * as ChannelUtils from '@app/features/channel/utils/ChannelUtils';
import {MARK_AS_READ_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import * as ReadStateCommands from '@app/features/read_state/commands/ReadStateCommands';
import ReadStates from '@app/features/read_state/state/ReadStates';
import {MarkAsReadIcon, MuteIcon} from '@app/features/ui/action_menu/ContextMenuIcons';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import {MenuItemSubmenu} from '@app/features/ui/action_menu/MenuItemSubmenu';
import * as UserGuildSettingsCommands from '@app/features/user/commands/UserGuildSettingsCommands';
import UserGuildSettings from '@app/features/user/state/UserGuildSettings';
import {getMutedText} from '@app/lib/overlay/OverlayContextMenu';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useMemo} from 'react';

const MUTE_DESCRIPTOR = msg({
	message: 'Mute {displayLabel}',
	comment: 'Action that mutes the named target.',
});
const UNMUTE_DESCRIPTOR = msg({
	message: 'Unmute {displayLabel}',
	comment: 'Action that re-enables notifications for the named target.',
});

interface DMMenuItemProps {
	channel: Channel;
	onClose: () => void;
}

export const MarkDMAsReadMenuItem: React.FC<DMMenuItemProps> = observer(({channel, onClose}) => {
	const {i18n} = useLingui();
	const hasUnread = ReadStates.hasUnread(channel.id);
	const handleMarkAsRead = useCallback(() => {
		ReadStateCommands.ack(channel.id, true, true);
		onClose();
	}, [channel.id, onClose]);
	return (
		<MenuItem
			icon={
				<MarkAsReadIcon data-flx="ui.action-menu.items.dm-menu-items.mark-dm-as-read-menu-item.mark-as-read-icon" />
			}
			onClick={handleMarkAsRead}
			disabled={!hasUnread}
			data-flx="ui.action-menu.items.dm-menu-items.mark-dm-as-read-menu-item.menu-item.mark-as-read"
		>
			{i18n._(MARK_AS_READ_DESCRIPTOR)}
		</MenuItem>
	);
});
export const MuteDMMenuItem: React.FC<DMMenuItemProps> = observer(({channel, onClose}) => {
	const {i18n} = useLingui();
	const muteDurations = useMemo(() => getMuteDurationOptions(i18n), [i18n.locale]);
	const channelOverride = UserGuildSettings.getChannelOverride(null, channel.id);
	const isMuted = channelOverride?.muted ?? false;
	const muteConfig = channelOverride?.mute_config;
	const mutedText = getMutedText(isMuted, muteConfig);
	const dmDisplayName = ChannelUtils.getDMDisplayName(channel);
	const displayLabel = channel.isDM() ? `@${dmDisplayName}` : dmDisplayName;
	const muteLabel = i18n._(MUTE_DESCRIPTOR, {displayLabel});
	const unmuteLabel = i18n._(UNMUTE_DESCRIPTOR, {displayLabel});
	const handleMute = useCallback(
		(duration: number | null) => {
			const muteConfig = duration
				? {
						selected_time_window: duration,
						end_time: new Date(Date.now() + duration).toISOString(),
					}
				: null;
			UserGuildSettingsCommands.updateChannelOverride(
				null,
				channel.id,
				{
					muted: true,
					mute_config: muteConfig,
				},
				{persistImmediately: true},
			);
			onClose();
		},
		[channel.id, onClose],
	);
	const handleUnmute = useCallback(() => {
		UserGuildSettingsCommands.updateChannelOverride(
			null,
			channel.id,
			{
				muted: false,
				mute_config: null,
			},
			{persistImmediately: true},
		);
		onClose();
	}, [channel.id, onClose]);
	if (isMuted) {
		return (
			<MenuItem
				icon={<MuteIcon data-flx="ui.action-menu.items.dm-menu-items.mute-dm-menu-item.mute-icon" />}
				onClick={handleUnmute}
				hint={mutedText ?? undefined}
				data-flx="ui.action-menu.items.dm-menu-items.mute-dm-menu-item.menu-item.unmute"
			>
				{unmuteLabel}
			</MenuItem>
		);
	}
	return (
		<MenuItemSubmenu
			label={muteLabel}
			onTriggerSelect={() => handleMute(null)}
			render={() => (
				<MenuGroup data-flx="ui.action-menu.items.dm-menu-items.mute-dm-menu-item.menu-group">
					{muteDurations.map((duration) => (
						<MenuItem
							key={duration.value ?? 'until'}
							onClick={() => handleMute(duration.value)}
							data-flx="ui.action-menu.items.dm-menu-items.mute-dm-menu-item.menu-item.mute"
						>
							{duration.label}
						</MenuItem>
					))}
				</MenuGroup>
			)}
			data-flx="ui.action-menu.items.dm-menu-items.mute-dm-menu-item.menu-item-submenu"
		/>
	);
});
