// SPDX-License-Identifier: AGPL-3.0-or-later

import Guilds from '@app/features/guild/state/Guilds';
import {ME} from '@fluxer/constants/src/AppConstants';
import {GuildFeatures} from '@fluxer/constants/src/GuildConstants';

export type ChannelE2EEStatus = 'encrypted' | 'broken' | 'none';

interface ChannelE2EEStatusOptions {
	emptyChannelStatus?: Extract<ChannelE2EEStatus, 'encrypted' | 'none'>;
}

type ChannelE2EEVoiceState = {
	channel_id?: string | null;
	e2ee_capable?: boolean | null;
};

type ChannelE2EEVoiceStateBucket = Readonly<Record<string, Readonly<Record<string, ChannelE2EEVoiceState>>>>;

interface VoiceStateReadAccess {
	getAllVoiceStatesInGuild?: (guildId: string) => ChannelE2EEVoiceStateBucket | undefined;
}

function getVoiceStateReadAccess(): VoiceStateReadAccess | null {
	try {
		return (
			(window as typeof window & {_mediaEngineFacade?: VoiceStateReadAccess; _mediaEngine?: VoiceStateReadAccess})
				._mediaEngineFacade ??
			(window as typeof window & {_mediaEngine?: VoiceStateReadAccess})._mediaEngine ??
			null
		);
	} catch {
		return null;
	}
}

export function computeChannelE2EEStatus(
	guildId: string | null,
	channelId: string | null,
	options: ChannelE2EEStatusOptions = {},
): ChannelE2EEStatus {
	if (!channelId) return 'none';
	if (guildId !== null && !(Guilds.getGuild(guildId)?.features.has(GuildFeatures.VOICE_E2EE) ?? false)) {
		return 'none';
	}
	const emptyChannelStatus = options.emptyChannelStatus ?? 'none';
	const guildBucket = getVoiceStateReadAccess()?.getAllVoiceStatesInGuild?.(guildId ?? ME);
	const channelStates = guildBucket?.[channelId];
	if (!channelStates) return emptyChannelStatus;
	let total = 0;
	let capable = 0;
	for (const connId of Object.keys(channelStates)) {
		const vs = channelStates[connId];
		if (!vs.channel_id) continue;
		total += 1;
		if (vs.e2ee_capable === true) {
			capable += 1;
		}
	}
	if (total === 0) return emptyChannelStatus;
	if (capable === 0) return 'none';
	if (capable === total) return 'encrypted';
	return 'broken';
}
