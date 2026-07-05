// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelAccessGateModal} from '@app/features/channel/components/modals/ChannelAccessGateModal';
import type {Channel} from '@app/features/channel/models/Channel';
import Channels from '@app/features/channel/state/Channels';
import GuildMatureContentAgree, {MatureContentGateReason} from '@app/features/guild/state/GuildMatureContentAgree';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';

export interface ChannelGateTarget {
	channel?: Channel | null;
	channelId?: string | null;
	guildId?: string | null;
	onConfirm?: () => void;
}

function getChannelGateKey(target: ChannelGateTarget, reason: MatureContentGateReason): string {
	const channel = target.channelId ? Channels.getChannel(target.channelId) : target.channel;
	const resolved = GuildMatureContentAgree.getResolvedContext({
		channelId: target.channelId ?? channel?.id ?? null,
		guildId: target.guildId ?? channel?.guildId ?? null,
	});
	return [
		'channel-access-gate',
		reason,
		resolved.scope,
		resolved.scopeId ?? resolved.channelId ?? resolved.guildId ?? target.channelId ?? target.guildId ?? 'unknown',
	].join(':');
}

export function promptForChannelGate(target: ChannelGateTarget): boolean {
	const channel = target.channelId ? Channels.getChannel(target.channelId) : target.channel;
	const channelId = target.channelId ?? channel?.id ?? null;
	const guildId = target.guildId ?? channel?.guildId ?? null;
	const reason = GuildMatureContentAgree.getGateReason({channelId, guildId});
	if (reason === MatureContentGateReason.NONE) {
		return false;
	}
	const key = getChannelGateKey({channel, channelId, guildId}, reason);
	ModalCommands.pushWithKey(
		modal(() => (
			<ChannelAccessGateModal
				channel={channel}
				channelId={channelId}
				guildId={guildId}
				reason={reason}
				onConfirm={target.onConfirm}
				data-flx="channel.channel-gate-commands.channel-access-gate-modal"
			/>
		)),
		key,
	);
	return true;
}
