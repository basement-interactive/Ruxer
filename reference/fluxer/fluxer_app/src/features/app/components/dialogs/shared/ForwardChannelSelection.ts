// SPDX-License-Identifier: AGPL-3.0-or-later

import {formatSlowmodeTime} from '@app/features/channel/components/SlowmodeIndicator';
import type {Channel} from '@app/features/channel/models/Channel';
import Channels from '@app/features/channel/state/Channels';
import * as ChannelUtils from '@app/features/channel/utils/ChannelUtils';
import DeveloperOptions from '@app/features/devtools/state/DeveloperOptions';
import Guilds from '@app/features/guild/state/Guilds';
import {PERSONAL_NOTES_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import GuildMembers from '@app/features/member/state/GuildMembers';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import SelectedChannel from '@app/features/navigation/state/SelectedChannel';
import Permission from '@app/features/permissions/state/Permission';
import {formatPermissionLabel} from '@app/features/permissions/utils/PermissionUtils';
import Slowmode from '@app/features/slowmode/state/Slowmode';
import Users from '@app/features/user/state/Users';
import {ChannelTypes, Permissions} from '@fluxer/constants/src/ChannelConstants';
import {GuildOperations} from '@fluxer/constants/src/GuildConstants';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {isForwardableChannelType} from './ForwardChannelEligibility';

const CHANNEL_DESCRIPTOR = msg({
	message: 'Channel {id}',
	comment: 'Short label in the settings dialog forward channel selection. Preserve {id}; it is inserted by code.',
});
const SENDING_MESSAGES_IS_DISABLED_IN_THIS_COMMUNITY_DESCRIPTOR = msg({
	message: 'Sending messages is disabled in this community',
	comment: 'Short label in the settings dialog forward channel selection.',
});
const YOU_RE_ON_TIMEOUT_IN_THIS_COMMUNITY_DESCRIPTOR = msg({
	message: "You're on timeout in this community",
	comment: 'Short label in the settings dialog forward channel selection. Keep the tone plain and specific.',
});
const YOU_NEED_THE_PERMISSION_TO_SEND_MESSAGES_IN_DESCRIPTOR = msg({
	message: 'You need the "{sendMessagesPermissionLabel}" permission to send messages in this channel',
	comment:
		'Forward dialog error shown when the user lacks the Send Messages permission in the target channel. Permission name is interpolated.',
});
const YOU_NEED_THE_PERMISSION_TO_EMBED_LINKS_IN_DESCRIPTOR = msg({
	message: 'You need the "{embedLinksPermissionLabel}" permission to embed links in this channel',
	comment:
		'Forward dialog error shown when the forwarded message contains embeds and the user lacks Embed Links in the target channel.',
});
const YOU_NEED_THE_PERMISSION_TO_ATTACH_FILES_IN_DESCRIPTOR = msg({
	message: 'You need the "{attachFilesPermissionLabel}" permission to attach files in this channel',
	comment:
		'Forward dialog error shown when the forwarded message has attachments and the user lacks Attach Files in the target channel.',
});
const SLOWMODE_WAIT_DESCRIPTOR = msg({
	message: 'Slowmode · wait {remaining}',
	comment:
		'Short label in the settings dialog forward channel selection. Preserve {remaining}; it is inserted by code.',
});

export interface ChannelSlowmodeState {
	isEnabled: boolean;
	isCoolingDown: boolean;
	remainingMs: number;
}

const EMPTY_SLOWMODE_STATE: ChannelSlowmodeState = {isEnabled: false, isCoolingDown: false, remainingMs: 0};

export function getChannelSlowmodeState(channel: Channel): ChannelSlowmodeState {
	if (!channel.guildId || channel.rateLimitPerUser <= 0) return EMPTY_SLOWMODE_STATE;
	if (Permission.can(Permissions.BYPASS_SLOWMODE, channel)) return EMPTY_SLOWMODE_STATE;
	if (DeveloperOptions.mockSlowmodeActive) {
		return {isEnabled: true, isCoolingDown: true, remainingMs: DeveloperOptions.mockSlowmodeRemaining};
	}
	const remainingMs = Slowmode.getSlowmodeRemaining(channel.id, channel.rateLimitPerUser);
	return {isEnabled: true, isCoolingDown: remainingMs > 0, remainingMs};
}

export const getForwardChannelDisplayName = (channel: Channel, i18n?: I18n): string => {
	if (
		channel.type === ChannelTypes.DM_PERSONAL_NOTES ||
		channel.type === ChannelTypes.DM ||
		channel.type === ChannelTypes.GROUP_DM
	) {
		return ChannelUtils.getDMDisplayName(channel);
	}
	if (channel.name) return channel.name;
	if (!i18n) return `Channel ${channel.id}`;
	const id = channel.id;
	return i18n._(CHANNEL_DESCRIPTOR, {id});
};
export const getForwardChannelGuildName = (channel: Channel): string | null => {
	if (!channel.guildId) return null;
	const guild = Guilds.getGuild(channel.guildId);
	return guild?.name ?? null;
};
export const getForwardChannelCategoryName = (channel: Channel): string | null => {
	if (!channel.parentId) return null;
	const category = Channels.getChannel(channel.parentId);
	if (!category) return null;
	return category.name || null;
};

function messageHasMedia(message: Message): {
	hasEmbeds: boolean;
	hasAttachments: boolean;
} {
	const hasEmbeds =
		message.embeds.length > 0 ||
		(message.messageSnapshots?.some((s) => s.embeds != null && s.embeds.length > 0) ?? false);
	const hasAttachments =
		message.attachments.length > 0 ||
		(message.messageSnapshots?.some((s) => s.attachments != null && s.attachments.length > 0) ?? false);
	return {hasEmbeds, hasAttachments};
}

interface UseForwardChannelSelectionOptions {
	excludedChannelId: string;
	message: Message;
	maxSelections?: number;
	mediaSelection?: {
		hasEmbeds: boolean;
		hasAttachments: boolean;
	};
}

export const useForwardChannelSelection = ({
	excludedChannelId,
	message,
	maxSelections = 5,
	mediaSelection,
}: UseForwardChannelSelectionOptions) => {
	const {i18n} = useLingui();
	const locale = i18n.locale;
	const allKnownChannels = Channels.allChannels;
	const recentChannelIds = SelectedChannel.recentChannels;
	const {hasEmbeds, hasAttachments} = useMemo(
		() => mediaSelection ?? messageHasMedia(message),
		[message, mediaSelection],
	);
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());
	const [slowmodeTick, setSlowmodeTick] = useState(0);
	const getChannelPermissionIssue = useCallback(
		(channel: Channel): string | null => {
			if (!channel.guildId) return null;
			const guild = Guilds.getGuild(channel.guildId);
			if (guild && (guild.disabledOperations & GuildOperations.SEND_MESSAGE) !== 0) {
				return i18n._(SENDING_MESSAGES_IS_DISABLED_IN_THIS_COMMUNITY_DESCRIPTOR);
			}
			const currentUserId = Users.currentUser?.id;
			const member = currentUserId ? GuildMembers.getMember(channel.guildId, currentUserId) : null;
			if (member?.isTimedOut()) {
				return i18n._(YOU_RE_ON_TIMEOUT_IN_THIS_COMMUNITY_DESCRIPTOR);
			}
			if (!Permission.can(Permissions.SEND_MESSAGES, channel)) {
				const sendMessagesPermissionLabel = formatPermissionLabel(i18n, Permissions.SEND_MESSAGES);
				return i18n._(YOU_NEED_THE_PERMISSION_TO_SEND_MESSAGES_IN_DESCRIPTOR, {sendMessagesPermissionLabel});
			}
			if (!hasEmbeds && !hasAttachments) return null;
			if (hasEmbeds && !Permission.can(Permissions.EMBED_LINKS, {channelId: channel.id, guildId: channel.guildId})) {
				const embedLinksPermissionLabel = formatPermissionLabel(i18n, Permissions.EMBED_LINKS);
				return i18n._(YOU_NEED_THE_PERMISSION_TO_EMBED_LINKS_IN_DESCRIPTOR, {embedLinksPermissionLabel});
			}
			if (
				hasAttachments &&
				!Permission.can(Permissions.ATTACH_FILES, {channelId: channel.id, guildId: channel.guildId})
			) {
				const attachFilesPermissionLabel = formatPermissionLabel(i18n, Permissions.ATTACH_FILES);
				return i18n._(YOU_NEED_THE_PERMISSION_TO_ATTACH_FILES_IN_DESCRIPTOR, {attachFilesPermissionLabel});
			}
			return null;
		},
		[hasEmbeds, hasAttachments, i18n],
	);
	const allChannels = useMemo(() => {
		const channels = allKnownChannels.filter((channel) => isForwardableChannelType(channel.type));
		return channels.sort((a, b) => {
			const aIsSource = a.id === excludedChannelId;
			const bIsSource = b.id === excludedChannelId;
			if (aIsSource && bIsSource) return 0;
			if (aIsSource) return 1;
			if (bIsSource) return -1;
			const aIsUnavailable = getChannelPermissionIssue(a) != null || getChannelSlowmodeState(a).isCoolingDown;
			const bIsUnavailable = getChannelPermissionIssue(b) != null || getChannelSlowmodeState(b).isCoolingDown;
			if (aIsUnavailable !== bIsUnavailable) return aIsUnavailable ? 1 : -1;
			const aIndex = recentChannelIds.indexOf(a.id);
			const bIndex = recentChannelIds.indexOf(b.id);
			if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
			if (aIndex !== -1) return -1;
			if (bIndex !== -1) return 1;
			const aName = getForwardChannelDisplayName(a, i18n).toLowerCase();
			const bName = getForwardChannelDisplayName(b, i18n).toLowerCase();
			return aName.localeCompare(bName);
		});
	}, [allKnownChannels, recentChannelIds, excludedChannelId, getChannelPermissionIssue, i18n.locale, slowmodeTick]);
	const filteredChannels = useMemo(() => {
		if (!searchQuery.trim()) return allChannels;
		const query = searchQuery.toLowerCase();
		return allChannels.filter((channel) => {
			const channelName = (channel.name || '').toLowerCase();
			const displayName = getForwardChannelDisplayName(channel, i18n).toLowerCase();
			const guildName = channel.guildId ? (Guilds.getGuild(channel.guildId)?.name ?? '').toLowerCase() : '';
			if (channel.type === ChannelTypes.DM_PERSONAL_NOTES) {
				const notes = i18n._(PERSONAL_NOTES_DESCRIPTOR).toLowerCase();
				if (notes.includes(query)) return true;
			}
			return displayName.includes(query) || channelName.includes(query) || guildName.includes(query);
		});
	}, [allChannels, searchQuery, i18n.locale]);
	const handleToggleChannel = useCallback(
		(channelId: string) => {
			setSelectedChannelIds((prev) => {
				const next = new Set(prev);
				if (next.has(channelId)) {
					next.delete(channelId);
					return next;
				}
				if (next.size >= maxSelections) return prev;
				next.add(channelId);
				return next;
			});
		},
		[maxSelections],
	);
	const hasAnySlowmodeChannel = useMemo(
		() =>
			DeveloperOptions.mockSlowmodeActive ||
			allChannels.some(
				(channel) =>
					channel.guildId != null &&
					channel.rateLimitPerUser > 0 &&
					!Permission.can(Permissions.BYPASS_SLOWMODE, channel),
			),
		[allChannels],
	);
	useEffect(() => {
		if (!hasAnySlowmodeChannel) return;
		const intervalId = window.setInterval(() => {
			setSlowmodeTick((current) => (current + 1) % 1000000);
		}, 1000);
		return () => window.clearInterval(intervalId);
	}, [hasAnySlowmodeChannel]);
	const isChannelDisabled = useCallback(
		(channelId: string) => {
			if (!selectedChannelIds.has(channelId) && selectedChannelIds.size >= maxSelections) return true;
			const channel = Channels.getChannel(channelId);
			if (!channel) return false;
			if (getChannelPermissionIssue(channel) != null) return true;
			if (getChannelSlowmodeState(channel).isCoolingDown) return true;
			return false;
		},
		[selectedChannelIds, maxSelections, getChannelPermissionIssue],
	);
	const getChannelDisableReason = useCallback(
		(channel: Channel): string | null => {
			const permissionIssue = getChannelPermissionIssue(channel);
			if (permissionIssue != null) return permissionIssue;
			const slowmode = getChannelSlowmodeState(channel);
			if (slowmode.isCoolingDown) {
				const remaining = formatSlowmodeTime(slowmode.remainingMs, locale);
				return i18n._(SLOWMODE_WAIT_DESCRIPTOR, {remaining});
			}
			return null;
		},
		[getChannelPermissionIssue, i18n, locale],
	);
	const selectedChannels = useMemo(
		() =>
			Array.from(selectedChannelIds)
				.map((channelId) => Channels.getChannel(channelId))
				.filter((channel): channel is Channel => channel != null),
		[selectedChannelIds],
	);
	const slowmodeEnabledSelectedChannels = useMemo(
		() => selectedChannels.filter((channel) => getChannelSlowmodeState(channel).isEnabled),
		[selectedChannels],
	);
	return {
		filteredChannels,
		handleToggleChannel,
		isChannelDisabled,
		getChannelDisableReason,
		searchQuery,
		selectedChannelIds,
		setSearchQuery,
		maxSelections,
		selectedChannels,
		slowmodeEnabledSelectedChannels,
	};
};
