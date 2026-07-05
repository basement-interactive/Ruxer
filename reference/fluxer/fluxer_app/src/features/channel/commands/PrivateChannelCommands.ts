// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import Channels from '@app/features/channel/state/Channels';
import * as NavigationCommands from '@app/features/navigation/commands/NavigationCommands';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import UserPinnedDM from '@app/features/user/state/UserPinnedDM';
import {ME} from '@fluxer/constants/src/AppConstants';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import type {Channel} from '@fluxer/schema/src/domains/channel/ChannelSchemas';

const logger = new Logger('PrivateChannelCommands');

type UserChannelRequest = {recipient_id: string} | {recipients: Array<string>};

async function requestUserChannel(body: UserChannelRequest): Promise<Channel> {
	const response = await http.post<Channel>(Endpoints.USER_CHANNELS, {body});
	return response.body;
}

function findExistingDm(userId: string): Channel | null {
	const existingChannel = Channels.dmChannels.find(
		(channel) => channel.type === ChannelTypes.DM && channel.recipientIds.includes(userId),
	);
	return existingChannel?.toJSON() ?? null;
}

function persistChannelCreate(channel: Channel): void {
	Channels.handleChannelCreate({channel});
}

async function requestRecipientMutation(action: 'add' | 'remove', channelId: string, userId: string): Promise<void> {
	const endpoint = Endpoints.CHANNEL_RECIPIENT(channelId, userId);
	if (action === 'add') {
		await http.put(endpoint);
		return;
	}
	await http.delete(endpoint);
}

async function requestChannelPin(action: 'pin' | 'unpin', channelId: string): Promise<void> {
	const endpoint = Endpoints.USER_CHANNEL_PIN(channelId);
	if (action === 'pin') {
		await http.put(endpoint);
		return;
	}
	await http.delete(endpoint);
}

export async function create(userId: string): Promise<Channel> {
	try {
		return await requestUserChannel({recipient_id: userId});
	} catch (error) {
		logger.error('Failed to create private channel:', error);
		throw error;
	}
}

export async function createGroupDM(recipientIds: Array<string>): Promise<Channel> {
	try {
		return await requestUserChannel({recipients: recipientIds});
	} catch (error) {
		logger.error('Failed to create group DM:', error);
		throw error;
	}
}

export async function removeRecipient(channelId: string, userId: string): Promise<void> {
	try {
		await requestRecipientMutation('remove', channelId, userId);
	} catch (error) {
		logger.error('Failed to remove recipient:', error);
		throw error;
	}
}

export async function ensureDMChannel(userId: string): Promise<string> {
	const channel = await ensureDMChannelResponse(userId);
	return channel.id;
}

export async function ensureDMChannelResponse(userId: string): Promise<Channel> {
	try {
		const existingChannel = findExistingDm(userId);
		if (existingChannel) {
			return existingChannel;
		}
		const channel = await create(userId);
		persistChannelCreate(channel);
		return channel;
	} catch (error) {
		logger.error('Failed to ensure DM channel:', error);
		throw error;
	}
}

export async function openDMChannel(userId: string): Promise<void> {
	try {
		const channel = await ensureDMChannelResponse(userId);
		NavigationCommands.selectChannel(ME, channel.id);
	} catch (error) {
		logger.error('Failed to open DM channel:', error);
		throw error;
	}
}

export async function pinDmChannel(channelId: string): Promise<void> {
	try {
		await requestChannelPin('pin', channelId);
		UserPinnedDM.pinDM(channelId);
	} catch (error) {
		logger.error('Failed to pin DM channel:', error);
		throw error;
	}
}

export async function unpinDmChannel(channelId: string): Promise<void> {
	try {
		await requestChannelPin('unpin', channelId);
		UserPinnedDM.unpinDM(channelId);
	} catch (error) {
		logger.error('Failed to unpin DM channel:', error);
		throw error;
	}
}

export async function addRecipient(channelId: string, userId: string): Promise<void> {
	try {
		await requestRecipientMutation('add', channelId, userId);
	} catch (error) {
		logger.error('Failed to add recipient:', error);
		throw error;
	}
}
