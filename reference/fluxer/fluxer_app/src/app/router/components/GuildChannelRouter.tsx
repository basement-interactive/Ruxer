// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import {GuildLayout} from '@app/features/app/components/layout/GuildLayout';
import Channels from '@app/features/channel/state/Channels';
import {compareChannelPosition, filterViewableChannels} from '@app/features/messaging/utils/ChannelShared';
import * as NavigationCommands from '@app/features/navigation/commands/NavigationCommands';
import SelectedChannel from '@app/features/navigation/state/SelectedChannel';
import {useLocation} from '@app/features/platform/components/router/RouterReact';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import {ME} from '@fluxer/constants/src/AppConstants';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect} from 'react';

export const GuildChannelRouter = observer<{guildId: string; children: React.ReactNode}>(({guildId, children}) => {
	const location = useLocation();
	useEffect(() => {
		if (guildId === ME || location.pathname === Routes.ME) {
			return;
		}
		if (MobileLayout.enabled) {
			return;
		}
		if (location.pathname.startsWith('/channels/') && !location.pathname.startsWith(Routes.ME)) {
			if (location.pathname.split('/').length === 3) {
				const pathSegments = location.pathname.split('/');
				const currentGuildId = pathSegments[2];
				if (currentGuildId !== guildId) {
					return;
				}
				const selectedChannelId = SelectedChannel.selectedChannelIds.get(guildId);
				if (selectedChannelId) {
					const channel = Channels.getChannel(selectedChannelId);
					const isViewableChannel = channel ? filterViewableChannels([channel]).length > 0 : false;
					if (channel && channel.guildId === guildId && isViewableChannel) {
						NavigationCommands.selectChannel(guildId, selectedChannelId, undefined, 'replace');
					} else {
						const channels = Channels.getGuildChannels(guildId);
						const viewableChannels = filterViewableChannels(channels).sort(compareChannelPosition);
						if (viewableChannels.length > 0) {
							const firstChannel = viewableChannels[0];
							NavigationCommands.selectChannel(guildId, firstChannel.id, undefined, 'replace');
						}
					}
				} else {
					const channels = Channels.getGuildChannels(guildId);
					const viewableChannels = filterViewableChannels(channels).sort(compareChannelPosition);
					if (viewableChannels.length > 0) {
						const firstChannel = viewableChannels[0];
						NavigationCommands.selectChannel(guildId, firstChannel.id, undefined, 'replace');
					}
				}
			}
		}
	}, [guildId, location.pathname, MobileLayout.enabled]);
	if (guildId === ME || location.pathname === Routes.ME) {
		return null;
	}
	return <GuildLayout data-flx="app.router.guild-channel-router.guild-layout">{children}</GuildLayout>;
});
