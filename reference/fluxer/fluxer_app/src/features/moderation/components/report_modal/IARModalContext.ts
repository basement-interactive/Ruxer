// SPDX-License-Identifier: AGPL-3.0-or-later

import Authentication from '@app/features/auth/state/Authentication';
import type {Channel} from '@app/features/channel/models/Channel';
import Channels from '@app/features/channel/state/Channels';
import Guilds from '@app/features/guild/state/Guilds';
import type {IARContext, IARResolvedContext} from '@app/features/moderation/components/report_modal/IARModalTypes';
import {
	REPORT_COMMUNITY_DESCRIPTOR,
	REPORT_USER_DESCRIPTOR,
} from '@app/features/moderation/utils/ModerationMessageDescriptors';
import SelectedChannel from '@app/features/navigation/state/SelectedChannel';
import Permission from '@app/features/permissions/state/Permission';
import Relationships from '@app/features/relationship/state/Relationships';
import type {User} from '@app/features/user/models/User';
import * as NicknameUtils from '@app/features/user/utils/NicknameUtils';
import {ME} from '@fluxer/constants/src/AppConstants';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';

const REPORT_MESSAGE_DESCRIPTOR = msg({
	message: 'Report message',
	comment: 'Modal title for the IAR flow when reporting a specific message.',
});
const THIS_USER_DESCRIPTOR = msg({
	message: 'this user',
	comment: 'Lowercase phrase used mid-sentence in IAR copy when referring to the reported user without a name.',
});

function getModalTitle(i18n: I18n, context: IARContext): string {
	switch (context.type) {
		case 'message':
			return i18n._(REPORT_MESSAGE_DESCRIPTOR);
		case 'user':
			return i18n._(REPORT_USER_DESCRIPTOR);
		case 'guild':
			return i18n._(REPORT_COMMUNITY_DESCRIPTOR);
	}
}

function getCurrentChannel(context: IARContext): Channel | null {
	switch (context.type) {
		case 'message':
			return Channels.getChannel(context.message.channelId) ?? null;
		case 'user':
		case 'guild':
			return null;
	}
}

function getReportedUser(context: IARContext, currentUserId: string | null): User | null {
	switch (context.type) {
		case 'message':
			if (context.message.author.id === currentUserId) {
				return null;
			}
			return context.message.author;
		case 'user':
			if (context.user.id === currentUserId) {
				return null;
			}
			return context.user;
		case 'guild':
			return null;
	}
}

function getLeaveableGuildId(context: IARContext, currentChannel: Channel | null): string | null {
	switch (context.type) {
		case 'guild':
			return context.guild.id;
		case 'user':
			return context.guildId ?? null;
		case 'message':
			if (currentChannel?.guildId) {
				return currentChannel.guildId;
			}
			return context.message.guildId ?? null;
	}
}

function getDMChannel(context: IARContext, currentChannel: Channel | null, reportedUser: User | null): Channel | null {
	switch (context.type) {
		case 'message':
			if (currentChannel?.isDM()) {
				return currentChannel;
			}
			break;
		case 'user':
			break;
		case 'guild':
			return null;
	}
	if (reportedUser === null) {
		return null;
	}
	const dmChannel =
		Channels.dmChannels.find((channel) => channel.isDM() && channel.getRecipientId() === reportedUser.id) ?? null;
	return dmChannel;
}

function getDMDisplayName(i18n: I18n, reportedUser: User | null): string {
	if (reportedUser !== null) {
		return NicknameUtils.getDisplayName(reportedUser);
	}
	return i18n._(THIS_USER_DESCRIPTOR);
}

function getBanGuildId(context: IARContext, leaveableGuildId: string | null): string | null {
	switch (context.type) {
		case 'message':
			return leaveableGuildId;
		case 'user':
			return context.guildId ?? null;
		case 'guild':
			return context.guild.id;
	}
}

function isFocusedOnDMWith(dmChannel: Channel | null): boolean {
	if (dmChannel === null) return false;
	const focusedChannelId = SelectedChannel.selectedChannelIds.get(ME);
	return focusedChannelId === dmChannel.id;
}

function canDeleteMessageInChannel(context: IARContext, currentChannel: Channel | null): boolean {
	if (context.type !== 'message') return false;
	if (currentChannel === null) return false;
	if (currentChannel.isDM()) return false;
	return Permission.can(Permissions.MANAGE_MESSAGES, currentChannel);
}

function canBanInGuild(banGuildId: string | null, reportedUser: User | null): boolean {
	if (banGuildId === null || reportedUser === null) return false;
	const guild = Guilds.getGuild(banGuildId);
	if (!guild) return false;
	if (guild.ownerId === reportedUser.id) return false;
	return Permission.canManageUser(Permissions.BAN_MEMBERS, reportedUser, guild);
}

export function resolveIARModalContext(i18n: I18n, context: IARContext): IARResolvedContext {
	const currentChannel = getCurrentChannel(context);
	const reportedUser = getReportedUser(context, Authentication.currentUserId);
	const leaveableGuildId = getLeaveableGuildId(context, currentChannel);
	const dmChannel = getDMChannel(context, currentChannel, reportedUser);
	const leaveableGuild = leaveableGuildId !== null ? (Guilds.getGuild(leaveableGuildId) ?? null) : null;
	const isLeaveableGuildOwner =
		leaveableGuild !== null &&
		Authentication.currentUserId !== null &&
		leaveableGuild.ownerId === Authentication.currentUserId;
	const banGuildId = getBanGuildId(context, leaveableGuildId);
	return {
		title: getModalTitle(i18n, context),
		currentChannel,
		reportedUser,
		isReportedUserBlocked: reportedUser !== null && Relationships.isBlocked(reportedUser.id),
		leaveableGuildId,
		hasCommunityContext: context.type !== 'guild' && leaveableGuildId !== null,
		dmChannel,
		dmDisplayName: getDMDisplayName(i18n, reportedUser),
		isFocusedOnDMWithUser: isFocusedOnDMWith(dmChannel),
		isLeaveableGuildOwner,
		canDeleteReportedMessage: canDeleteMessageInChannel(context, currentChannel),
		banGuildId,
		canBanReportedUser: canBanInGuild(banGuildId, reportedUser),
	};
}
