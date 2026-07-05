// SPDX-License-Identifier: AGPL-3.0-or-later

import * as LinkChannelCommands from '@app/features/channel/commands/LinkChannelCommands';
import {DMChannelView} from '@app/features/channel/components/channel_view/DMChannelView';
import {GuildChannelView} from '@app/features/channel/components/channel_view/GuildChannelView';
import {MatureContentChannelGate} from '@app/features/channel/components/MatureContentChannelGate';
import Channels from '@app/features/channel/state/Channels';
import GuildMatureContentAgree, {MatureContentGateReason} from '@app/features/guild/state/GuildMatureContentAgree';
import * as NavigationCommands from '@app/features/navigation/commands/NavigationCommands';
import {useLocation, useParams} from '@app/features/platform/components/router/RouterReact';
import {FAVORITES_GUILD_ID} from '@fluxer/constants/src/AppConstants';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {observer} from 'mobx-react-lite';
import {useEffect} from 'react';

export const ChannelIndexPage = observer(() => {
	const location = useLocation();
	const {
		guildId: routeGuildId,
		channelId,
		messageId,
	} = useParams() as {
		guildId?: string;
		channelId?: string;
		messageId?: string;
	};
	const channel = channelId ? Channels.getChannel(channelId) : undefined;
	const isInFavorites = location.pathname.startsWith('/channels/@favorites');
	const derivedGuildId = isInFavorites ? channel?.guildId : routeGuildId || channel?.guildId;
	const linkChannelGateReason =
		channel?.type === ChannelTypes.GUILD_LINK
			? GuildMatureContentAgree.getGateReason({channelId: channel.id, guildId: derivedGuildId})
			: MatureContentGateReason.NONE;
	const showLinkChannelGate =
		channel?.type === ChannelTypes.GUILD_LINK && linkChannelGateReason !== MatureContentGateReason.NONE;
	useEffect(() => {
		if (!channelId) {
			return;
		}
		if (!channel) {
			return;
		}
		if (channel.type !== ChannelTypes.GUILD_CATEGORY && channel.type !== ChannelTypes.GUILD_LINK) {
			return;
		}
		if (channel.type === ChannelTypes.GUILD_LINK) {
			if (showLinkChannelGate) {
				return;
			}
			LinkChannelCommands.openLinkChannel(channel, {skipGate: true});
		}
		const fallbackGuildId = routeGuildId ?? (isInFavorites ? FAVORITES_GUILD_ID : undefined);
		if (!fallbackGuildId) {
			return;
		}
		NavigationCommands.selectChannel(fallbackGuildId, undefined, undefined, 'replace');
	}, [channelId, channel, routeGuildId, isInFavorites, showLinkChannelGate]);
	if (!channelId) {
		return null;
	}
	if (channel?.type === ChannelTypes.GUILD_LINK && showLinkChannelGate) {
		return (
			<MatureContentChannelGate
				channelId={channel.id}
				guildId={derivedGuildId}
				reason={linkChannelGateReason}
				data-flx="channel.channel-index-page.mature-content-channel-gate"
			/>
		);
	}
	if (channel && (channel.type === ChannelTypes.GUILD_CATEGORY || channel.type === ChannelTypes.GUILD_LINK)) {
		return null;
	}
	if (channel?.isPrivate()) {
		return <DMChannelView channelId={channelId} data-flx="channel.channel-index-page.dm-channel-view" />;
	}
	return (
		<GuildChannelView
			channelId={channelId}
			guildId={derivedGuildId}
			messageId={messageId}
			data-flx="channel.channel-index-page.guild-channel-view"
		/>
	);
});
