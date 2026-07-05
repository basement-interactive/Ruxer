// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import {getDMDisplayName} from '@app/features/channel/utils/ChannelUtils';
import type {VoiceSessionRestoreSnapshot} from '@app/features/voice/state/VoiceSessionRestore';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';

export function getVoiceSessionRestoreSnapshotKey(
	snapshot: VoiceSessionRestoreSnapshot | null | undefined,
): string | null {
	if (!snapshot) return null;
	return `${snapshot.userId}:${snapshot.channelId}:${snapshot.updatedAt}`;
}

export function isRestorableVoiceChannelType(channelType: number): boolean {
	return (
		channelType === ChannelTypes.GUILD_VOICE || channelType === ChannelTypes.DM || channelType === ChannelTypes.GROUP_DM
	);
}

export function getVoiceSessionRestoreChannelDisplayName(channel: Channel, fallback: string): string {
	switch (channel.type) {
		case ChannelTypes.DM:
		case ChannelTypes.GROUP_DM:
		case ChannelTypes.DM_PERSONAL_NOTES:
			return getDMDisplayName(channel);
		default:
			return channel.name?.trim() || fallback;
	}
}
