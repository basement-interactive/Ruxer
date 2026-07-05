// SPDX-License-Identifier: AGPL-3.0-or-later

import ChannelPins from '@app/features/channel/state/ChannelPins';
import Channels from '@app/features/channel/state/Channels';
import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import GuildReadState from '@app/features/guild/state/GuildReadState';
import Invites from '@app/features/invite/state/Invites';
import Drafts from '@app/features/messaging/state/MessagingDrafts';
import Messages from '@app/features/messaging/state/MessagingMessages';
import SavedMessages from '@app/features/messaging/state/SavedMessages';
import SelectedChannel from '@app/features/navigation/state/SelectedChannel';
import MentionFeed from '@app/features/notification/state/MentionFeed';
import Permission from '@app/features/permissions/state/Permission';
import ReadStates from '@app/features/read_state/state/ReadStates';
import QuickSwitcher from '@app/features/search/state/QuickSwitcher';
import Slowmode from '@app/features/slowmode/state/Slowmode';
import * as PiPCommands from '@app/features/ui/commands/PiPCommands';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import Webhooks from '@app/features/webhook/state/Webhooks';
import type {Channel} from '@fluxer/schema/src/domains/channel/ChannelSchemas';

interface ChannelDeletePayload {
	id: string;
	type: number;
	guild_id?: string;
}

export function handleChannelDelete(data: ChannelDeletePayload, _context: GatewayHandlerContext): void {
	const channel = data as Channel;
	const guildId = data.guild_id;
	PiPCommands.clearPiPForChannel(data.id);
	MediaEngine.handleChannelDelete(data.id);
	Slowmode.deleteChannel(data.id);
	Drafts.deleteChannelDraft(data.id);
	SavedMessages.handleChannelDelete(channel);
	ChannelPins.handleChannelDelete(channel);
	Channels.handleChannelDelete({channel});
	Permission.handleChannelDelete(data.id, guildId);
	GuildReadState.handleChannelDelete(data.id);
	Invites.handleChannelDelete(data.id);
	Webhooks.handleChannelDelete(data.id);
	ReadStates.handleChannelDelete({channel});
	SelectedChannel.handleChannelDelete(channel);
	Messages.handleCleanup();
	MentionFeed.handleChannelDelete(channel);
	QuickSwitcher.recomputeIfOpen();
}
