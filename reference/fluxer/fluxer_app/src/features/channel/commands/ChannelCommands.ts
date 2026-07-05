// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import Channels from '@app/features/channel/state/Channels';
import Invites from '@app/features/invite/state/Invites';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import Slowmode from '@app/features/slowmode/state/Slowmode';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import type {Channel, ChannelSlowmodeStateResponse} from '@fluxer/schema/src/domains/channel/ChannelSchemas';
import type {Invite} from '@fluxer/schema/src/domains/invite/InviteSchemas';

const logger = new Logger('Channels');

export interface ChannelRtcRegion {
	id: string;
	name: string;
	emoji: string;
}

type ChannelCreateParams = Pick<
	Channel,
	'name' | 'url' | 'type' | 'parent_id' | 'bitrate' | 'user_limit' | 'voice_connection_limit'
> & {
	permission_overwrites?: Array<PermissionOverwritePatch>;
};
type ChannelUpdateParams = Partial<
	Pick<
		Channel,
		| 'name'
		| 'topic'
		| 'url'
		| 'nsfw'
		| 'nsfw_override'
		| 'content_warning_level'
		| 'content_warning_text'
		| 'bitrate'
		| 'user_limit'
		| 'voice_connection_limit'
		| 'icon'
		| 'owner_id'
		| 'rtc_region'
	>
>;

interface PermissionOverwritePatch {
	id: string;
	type: 0 | 1;
	allow: string;
	deny: string;
}

async function requestChannelCreate(guildId: string, params: ChannelCreateParams): Promise<Channel> {
	const response = await http.post<Channel>(Endpoints.GUILD_CHANNELS(guildId), {body: params});
	return response.body;
}

async function requestChannelPatch(
	channelId: string,
	body: ChannelUpdateParams | Record<string, unknown>,
): Promise<Channel> {
	const response = await http.patch<Channel>(Endpoints.CHANNEL(channelId), {body});
	return response.body;
}

function isPrivateChannel(channelId: string): boolean {
	const channel = Channels.getChannel(channelId);
	return (
		channel != null && !channel.guildId && (channel.type === ChannelTypes.DM || channel.type === ChannelTypes.GROUP_DM)
	);
}

function shouldOptimisticallyRemove(channelId: string, options?: RemoveChannelOptions): boolean {
	return options?.optimistic ?? isPrivateChannel(channelId);
}

function deleteChannelQuery(
	silent?: boolean,
	deleteMessages?: boolean,
): {silent?: true; delete_messages?: true} | undefined {
	if (!silent && !deleteMessages) return undefined;
	const query: {silent?: true; delete_messages?: true} = {};
	if (silent) query.silent = true;
	if (deleteMessages) query.delete_messages = true;
	return query;
}

function syncSlowmodeTimestamp(channelId: string, data: ChannelSlowmodeStateResponse): void {
	const {rate_limit_per_user, retry_after_ms, can_bypass} = data;
	if (rate_limit_per_user <= 0 || can_bypass) {
		Slowmode.clearChannel(channelId);
		return;
	}
	if (retry_after_ms <= 0) {
		Slowmode.clearChannel(channelId);
		return;
	}
	Slowmode.updateSlowmodeRemaining(channelId, retry_after_ms);
}

async function requestSlowmodeState(channelId: string): Promise<ChannelSlowmodeStateResponse | null> {
	const response = await http.get<ChannelSlowmodeStateResponse>(Endpoints.CHANNEL_SLOWMODE(channelId));
	const data = response.body;
	if (!data) return null;
	syncSlowmodeTimestamp(channelId, data);
	return data;
}

export async function create(guildId: string, params: ChannelCreateParams): Promise<Channel> {
	try {
		return await requestChannelCreate(guildId, params);
	} catch (error) {
		logger.error('Failed to create channel:', error);
		throw error;
	}
}

export async function update(channelId: string, params: ChannelUpdateParams): Promise<Channel> {
	try {
		return await requestChannelPatch(channelId, params);
	} catch (error) {
		logger.error(`Failed to update channel ${channelId}:`, error);
		throw error;
	}
}

export async function updateGroupDMNickname(
	channelId: string,
	userId: string,
	nickname: string | null,
): Promise<Channel> {
	try {
		return await requestChannelPatch(channelId, {
			nicks: {
				[userId]: nickname,
			},
		});
	} catch (error) {
		logger.error(`Failed to update nickname for user ${userId} in channel ${channelId}:`, error);
		throw error;
	}
}

export interface RemoveChannelOptions {
	optimistic?: boolean;
}

export async function remove(
	channelId: string,
	silent?: boolean,
	options?: RemoveChannelOptions & {deleteMessages?: boolean},
): Promise<void> {
	const removeOptimistically = shouldOptimisticallyRemove(channelId, options);
	if (removeOptimistically) {
		Channels.removeChannelOptimistically(channelId);
	}
	try {
		await http.delete(Endpoints.CHANNEL(channelId), {
			query: deleteChannelQuery(silent, options?.deleteMessages),
		});
		if (removeOptimistically) {
			Channels.clearOptimisticallyRemovedChannel(channelId);
		}
	} catch (error) {
		if (removeOptimistically) {
			Channels.rollbackChannelDeletion(channelId);
		}
		logger.error(`Failed to delete channel ${channelId}:`, error);
		throw error;
	}
}

export async function bulkDeleteMyMessages(channelId: string): Promise<void> {
	try {
		await http.post(Endpoints.CHANNEL_BULK_DELETE_MY_MESSAGES(channelId), {body: {}});
		logger.debug(`Deleted caller's messages in channel ${channelId}`);
	} catch (error) {
		logger.error(`Failed to delete caller's messages in channel ${channelId}:`, error);
		throw error;
	}
}

export async function updatePermissionOverwrites(
	channelId: string,
	permissionOverwrites: Array<PermissionOverwritePatch>,
): Promise<Channel> {
	try {
		return await requestChannelPatch(channelId, {permission_overwrites: permissionOverwrites});
	} catch (error) {
		logger.error(`Failed to update permission overwrites for channel ${channelId}:`, error);
		throw error;
	}
}

export async function fetchChannelInvites(channelId: string): Promise<Array<Invite>> {
	try {
		Invites.handleChannelInvitesFetchPending(channelId);
		const response = await http.get<Array<Invite>>(Endpoints.CHANNEL_INVITES(channelId));
		const data = response.body ?? [];
		Invites.handleChannelInvitesFetchSuccess(channelId, data);
		return data;
	} catch (error) {
		logger.error(`Failed to fetch invites for channel ${channelId}:`, error);
		Invites.handleChannelInvitesFetchError(channelId);
		throw error;
	}
}

const inFlightSlowmodeFetches = new Map<string, Promise<ChannelSlowmodeStateResponse | null>>();

export function fetchSlowmodeState(channelId: string): Promise<ChannelSlowmodeStateResponse | null> {
	const existing = inFlightSlowmodeFetches.get(channelId);
	if (existing) return existing;
	const promise = (async () => {
		try {
			return await requestSlowmodeState(channelId);
		} catch (error) {
			logger.error(`Failed to fetch slowmode state for channel ${channelId}:`, error);
			return null;
		} finally {
			inFlightSlowmodeFetches.delete(channelId);
		}
	})();
	inFlightSlowmodeFetches.set(channelId, promise);
	return promise;
}

export async function fetchRtcRegions(channelId: string): Promise<Array<ChannelRtcRegion>> {
	try {
		const response = await http.get<Array<ChannelRtcRegion>>(Endpoints.CHANNEL_RTC_REGIONS(channelId));
		return response.body ?? [];
	} catch (error) {
		logger.error(`Failed to fetch RTC regions for channel ${channelId}:`, error);
		throw error;
	}
}
